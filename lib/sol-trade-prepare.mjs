/** Server-only exact-in SOL trading with execution-time token baseline guards. */
import {Buffer} from 'buffer';
import {PublicKey,TransactionInstruction,TransactionMessage,VersionedTransaction,SystemProgram,ComputeBudgetProgram} from '@solana/web3.js';
import {getAssociatedTokenAddressSync,TOKEN_2022_PROGRAM_ID,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,createAssociatedTokenAccountInstruction,unpackAccount,unpackMint} from '@solana/spl-token';
import {loadAddressLookupTables,resolveTransactionAddresses,transactionAddressKeys} from './transaction-addresses.mjs';
import {simulationCostProof} from './simulation-cost.mjs';
import {buildSolBalanceGuards,tokenBalanceEqualityGuard,LIGHTHOUSE_NET_GUARD_SOURCE} from './sol-token-net-guard.mjs';
import {decodeReviewedTransaction} from './wallet-transaction-policy.mjs';
import {QUOTES} from './quote-assets.mjs';
import {reviewedQuoteAccount,rewriteReviewedQuoteCreation,quoteAccountGuardsAndClosure} from './sol-transient-intermediate.mjs';
import {inspectRouteV2} from './jupiter-route-v2.mjs';
import {tryDirectSolRoute} from './sol-direct-route.mjs';
import {resolveSolRouteScope,SOL_ROUTE_SCOPE_VERSION,SOL_INTERMEDIATE_VENUE} from './sol-route-scope.mjs';
import {SOL_MINT,SOL_TRADE_RESERVE,SOL_TRADE_OVERHEAD_CAP,assertSolRouteQuote,assertSolTradeOutcome,createSolTradeIntent} from './sol-trade-intent.mjs';
import {canonicalWsolAddress,readCanonicalWsol,assertTemporaryWsol,temporaryWsolAddress,temporaryWsolCreate,retargetRouteWsol,TOKEN_ACCOUNT_BYTES} from './sol-temporary-wsol.mjs';
const JUPITER='JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',COMPUTE='ComputeBudget111111111111111111111111111111';
function decode(raw){if(!raw||!Array.isArray(raw.accounts)||raw.accounts.length>80||typeof raw.data!=='string')throw Error('Invalid upstream route instruction.');return new TransactionInstruction({programId:new PublicKey(raw.programId),keys:raw.accounts.map(k=>({pubkey:new PublicKey(k.pubkey),isSigner:k.isSigner===true,isWritable:k.isWritable===true})),data:Buffer.from(raw.data,'base64')});}
const ROUTER_NO_ROUTE=new Set(['COULD_NOT_FIND_ANY_ROUTE','NO_ROUTES_FOUND','TOKEN_NOT_TRADABLE','ROUTE_PLAN_DOES_NOT_CONSUME_ALL_THE_AMOUNT','CIRCULAR_ARBITRAGE_IS_DISABLED']);
// Quote and swap-instruction requests are stateless reads, so a bounded retry cannot duplicate any action.
const ROUTER_RETRY_STATUS=new Set([429,500,502,503,504]),ROUTER_BACKOFF=[250,750];
function retryAfterMs(value){if(typeof value!=='string'||!/^\d{1,3}$/.test(value.trim()))return 0;return Number(value.trim())*1000;}
async function routerRejection(r){let code='';try{const text=await r.text();if(text.length<=4000){const parsed=JSON.parse(text);if(typeof parsed?.errorCode==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(parsed.errorCode))code=parsed.errorCode;}}catch{/* Upstream detail is optional. */}if(ROUTER_NO_ROUTE.has(code))return Object.assign(Error(`The SOL router has not indexed this token's verified Grainpad pool yet (${code}). Pool creation does not index it, and indexing is not immediate. Trade this pool with wXMR now. That wXMR trade is not SOL trading from launch. SOL stays unavailable until this new pool is indexed.`),{code:'router-not-indexed',routerCode:code,fallback:'wxmr-direct'});return Error(code?`Official SOL router rejected this route (${code}).`:'Official SOL router rejected this route request.');}
/** @param {{attempts?:number,deadlineMs?:number,sleep?:(ms:number)=>Promise<unknown>,now?:()=>number}} [policy] */
export async function fetchSolRouterJSON(fetcher,url,body,{attempts=3,deadlineMs=20_000,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now}={}){
 if(!Number.isInteger(attempts)||attempts<1||attempts>3||!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>30_000)throw Error('Invalid SOL router retry policy.');
 const end=now()+deadlineMs;let failure='Official SOL router is unavailable.';
 for(let attempt=1;attempt<=attempts;attempt++){
  const remaining=end-now();if(remaining<=0)break;
  let r;
  try{r=await fetcher(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(Math.min(10000,remaining)),redirect:'manual'});}
  catch{failure='Official SOL router did not respond.';const wait=ROUTER_BACKOFF[attempt-1]??750;if(attempt<attempts&&now()+wait<end){await sleep(wait);continue;}break;}
  if(r.status>=300&&r.status<400)throw Error('Official SOL router redirected unexpectedly.');
  if(!r.ok){
   if(!ROUTER_RETRY_STATUS.has(r.status))throw await routerRejection(r);
   failure=r.status===429?'Official SOL router is rate limited. Retry in a few seconds.':'Official SOL router is unavailable.';
   const wait=Math.min(2000,Math.max(ROUTER_BACKOFF[attempt-1]??750,retryAfterMs(r.headers?.get?.('retry-after'))));
   await r.body?.cancel?.();
   if(attempt<attempts&&now()+wait<end){await sleep(wait);continue;}
   break;
  }
  const text=await r.text();if(text.length>100000)throw Error('Route response too large.');return JSON.parse(text);
 }
 throw Error(failure);
}
/** Optional Worker secret for the official router; without it requests are unchanged. */
export function solRouterFetcher(apiKey,base=(...args)=>globalThis.fetch(...args)){
 if(apiKey===undefined||apiKey===null||apiKey==='')return base;
 if(typeof apiKey!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(apiKey))throw Error('Invalid SOL router credential configuration.');
 return (url,init={})=>base(url,{...init,headers:{...(init.headers||{}),'x-api-key':apiKey}});
}
/** Any registered Grainpad wXMR launch, routed only through its current verified pool (curve or migrated CPMM). */
export async function prepareGuardedSolTrade({connection,storage,findLaunch,platformId,owner,mint,side,amount,slippageBps,maxTotalDebitLamports,expectedGenesis,fetcher=(...args)=>globalThis.fetch(...args),now=Date.now}){
 if(!['buy','sell'].includes(side))throw Error('Choose Buy or Sell.');
 if(typeof findLaunch!=='function'||typeof platformId!=='string')throw Error('SOL route admission is not configured.');
 const row=await findLaunch(mint);
 if(await connection.getGenesisHash()!==expectedGenesis)throw Error('Wrong SOL network.');
 // Registered mint, canonical pool and current on-chain pool state, before any wallet account or router work.
 const scope=await resolveSolRouteScope(connection,row,{mint,platformId,now});
 const baseProgram=new PublicKey(scope.tokenProgram);
 const payer=new PublicKey(owner);if(!PublicKey.isOnCurve(payer.toBytes()))throw Error('Trade owner must be an on-curve signing wallet.');
 const baseMint=new PublicKey(mint),baseAta=getAssociatedTokenAddressSync(baseMint,payer,false,baseProgram),canonicalWsol=canonicalWsolAddress(payer),temporaryWsol=await temporaryWsolAddress(payer),quoteMint=new PublicKey(row.quoteMint),quoteAta=getAssociatedTokenAddressSync(quoteMint,payer);
 const [baseAccount,wsolAccount,quoteAccount,quoteMintAccount,temporaryAccount]=await connection.getMultipleAccountsInfo([baseAta,canonicalWsol,quoteAta,quoteMint,temporaryWsol],'confirmed');
 const preservedWsol=readCanonicalWsol(payer,wsolAccount);
 if(preservedWsol&&temporaryAccount)assertTemporaryWsol(payer,temporaryWsol,temporaryAccount);
 const wsolAta=preservedWsol?temporaryWsol:canonicalWsol;
 if(!quoteMintAccount||!quoteMintAccount.owner.equals(TOKEN_PROGRAM_ID)||!unpackMint(quoteMint,quoteMintAccount,TOKEN_PROGRAM_ID).isInitialized||unpackMint(quoteMint,quoteMintAccount,TOKEN_PROGRAM_ID).decimals!==QUOTES.wXMR.decimals)throw Error('Indexed wXMR intermediary is not its initialized classic SPL mint.');
 const quoteState=reviewedQuoteAccount(owner,row.quoteMint,quoteAccount),quoteGuards=quoteAccountGuardsAndClosure(quoteState),quoteClose=quoteGuards.close?[quoteGuards.close]:[];
 if(baseAccount&&String(baseAccount.owner)!==String(baseProgram))throw Error('Wrong token baseline owner or mint.');
 const baseState=baseAccount?unpackAccount(baseAta,baseAccount,baseProgram):null,baseline=baseState?baseState.amount:0n;
 if(baseState&&(!baseState.mint.equals(baseMint)||!baseState.owner.equals(payer)))throw Error('Wrong token baseline owner or mint.');
 if(side==='sell'&&(!baseAccount||baseline<BigInt(amount)))throw Error('Insufficient token balance for sale.');
 if(!Number.isSafeInteger(maxTotalDebitLamports)||maxTotalDebitLamports<(side==='buy'?Number(amount):0)||maxTotalDebitLamports-(side==='buy'?Number(amount):0)>SOL_TRADE_OVERHEAD_CAP)throw Error('Review maximum SOL debit and an overhead limit of at most 0.003 SOL.');
 let quote,built,routeSource='jupiter';
 const direct=await tryDirectSolRoute({connection,scope,platformId,owner,side,amount,slippageBps,baseAta,wsolAta,quoteAta});
 if(direct?.quote&&direct.built){quote=direct.quote;built=direct.built;routeSource=direct.routeSource;}
 else {
  try{
   const params=new URLSearchParams({inputMint:side==='buy'?SOL_MINT:mint,outputMint:side==='buy'?mint:SOL_MINT,amount,slippageBps:String(slippageBps),swapMode:'ExactIn',instructionVersion:'V2',restrictIntermediateTokens:'true',maxAccounts:'64',dexes:`${scope.venue},${SOL_INTERMEDIATE_VENUE}`});
   quote=await fetchSolRouterJSON(fetcher,`https://api.jup.ag/swap/v1/quote?${params}`);
  }catch(error){
   if(direct?.error&&error?.code==='router-not-indexed')error.message+=` Direct pool routing did not replace it (${String(direct.error.message||'unavailable').replace(/[<>]/g,'').slice(0,180)}).`;
   throw error;
  }
 }
 const terms=assertSolRouteQuote(quote,{mint,pool:scope.pool,side,amount,slippageBps,venue:scope.venue});
 if(quote.routePlan.length!==2||quote.routePlan[0].swapInfo.outputMint!==row.quoteMint)throw Error('SOL route must use only indexed wXMR as its intermediary.');
 if(!built)built=await fetchSolRouterJSON(fetcher,'https://api.jup.ag/swap/v1/swap-instructions',{userPublicKey:owner,quoteResponse:quote,wrapAndUnwrapSol:true,useSharedAccounts:false,dynamicComputeUnitLimit:false});
 if(preservedWsol)retargetRouteWsol(built,canonicalWsol.toBase58(),wsolAta.toBase58());
 if(built.tokenLedgerInstruction||built.otherInstructions?.length||!Array.isArray(built.setupInstructions)||!Array.isArray(built.computeBudgetInstructions)||!built.swapInstruction||!built.cleanupInstruction)throw Error('Unsupported SOL route instruction layout.');
 const swap=decode(built.swapInstruction),data=swap.data,at=i=>swap.keys[i]?.pubkey.toBase58();
 const failed=[];
 if(swap.programId.toBase58()!==JUPITER)failed.push('program');
 if(data.length<34)failed.push('header-length');else{
  for(const [name,ok] of [['discriminator',data.subarray(0,8).toString('hex')==='bb64facc31c4af14'],['input-amount',data.readBigUInt64LE(8)===BigInt(amount)],['quoted-output',data.readBigUInt64LE(16)===BigInt(quote.outAmount)],['slippage',data.readUInt16LE(24)===slippageBps],['platform-fee',data.readUInt16LE(26)===0],['positive-fee',data.readUInt16LE(28)===0]])if(!ok)failed.push(name);
 }
 const expected=[owner,(side==='buy'?wsolAta:baseAta).toBase58(),(side==='buy'?baseAta:wsolAta).toBase58(),terms.inputMint,terms.outputMint,String(side==='buy'?TOKEN_PROGRAM_ID:baseProgram),String(side==='buy'?baseProgram:TOKEN_PROGRAM_ID),null,'D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf',JUPITER];
 for(let i=0;i<expected.length;i++)if(expected[i]!==null&&at(i)!==expected[i])failed.push('account-'+i);
 if(![JUPITER,(side==='buy'?baseAta:wsolAta).toBase58()].includes(at(7)))failed.push('optional-destination');
 if(!swap.keys[0]?.isSigner||!swap.keys[1]?.isWritable||!swap.keys[2]?.isWritable||swap.keys.some(k=>k.isSigner&&String(k.pubkey)!==owner))failed.push('privileges');
 if(swap.keys.filter(k=>String(k.pubkey)===scope.pool).length!==1)failed.push('indexed-pool');
 if(!swap.keys.some(k=>String(k.pubkey)===scope.program))failed.push('pool-program');
 if(scope.stage==='cpmm'&&swap.keys.some(k=>String(k.pubkey)===scope.launchPool))failed.push('retired-curve-pool');
 // Decode the compiled route steps and prove the approved step consumes the verified pool and its vaults.
 if(!failed.length)failed.push(...inspectRouteV2(swap,{side,scope,owner,platformId,baseAta:String(baseAta),wsolAta:String(wsolAta),quoteAta:String(quoteAta)}));
 if(failed.length)throw Error('Jupiter V2 instruction differs from reviewed exact-input terms: '+failed.join(', '));
 if(preservedWsol&&swap.keys.some(key=>key.pubkey.toBase58()===preservedWsol.account))throw Error('Existing WSOL account cannot be the route account.');
 let fresh=false,wrappedFresh=false,wrappedTransfer=false,quoteCreated=false;const setup=built.setupInstructions.map(raw=>{const ix=decode(raw),p=ix.programId.toBase58(),d=ix.data,at=i=>ix.keys[i]?.pubkey.toBase58();
  if(p===ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()&&d.length===1&&d[0]===1&&at(0)===owner&&at(2)===owner){
   if(preservedWsol&&at(1)===wsolAta.toBase58()&&at(3)===SOL_MINT&&at(5)===String(TOKEN_PROGRAM_ID)){if(wrappedFresh)throw Error('Intermediate wallet token accounts are not supported.');wrappedFresh=true;return null;}
   const target=getAssociatedTokenAddressSync(new PublicKey(at(3)),payer,false,new PublicKey(at(5))).toBase58();if(at(1)!==target)throw Error('Invalid route ATA.');
   if(at(1)===quoteAta.toBase58()){if(quoteCreated)throw Error('Repeated wXMR intermediary creation.');quoteCreated=true;return rewriteReviewedQuoteCreation(ix,quoteState);}
   if(at(1)===baseAta.toBase58()){if(fresh||at(5)!==String(baseProgram))throw Error('Invalid fresh token destination.');fresh=true;return baseAccount?null:createAssociatedTokenAccountInstruction(payer,baseAta,payer,baseMint,baseProgram);}
   if(at(1)!==wsolAta.toBase58()||wrappedFresh||at(5)!==String(TOKEN_PROGRAM_ID))throw Error('Intermediate wallet token accounts are not supported.');wrappedFresh=true;if(preservedWsol)return null;return createAssociatedTokenAccountInstruction(payer,wsolAta,payer,new PublicKey(SOL_MINT));
  }
  if(p===SystemProgram.programId.toBase58()&&d.length===12&&d.readUInt32LE(0)===2&&at(0)===owner&&at(1)===wsolAta.toBase58()&&side==='buy'&&d.readBigUInt64LE(4)===BigInt(amount)&&!wrappedTransfer){wrappedTransfer=true;return ix;}
  if(p===TOKEN_PROGRAM_ID.toBase58()&&d.length===1&&d[0]===17&&at(0)===wsolAta.toBase58())return ix;
  throw Error('Unsupported route setup operation.');}).filter(Boolean);
 if((quoteState.fresh&&!quoteCreated)||!wrappedFresh||(!baseAccount&&!fresh)||(side==='buy'&&!wrappedTransfer)||(side==='sell'&&wrappedTransfer))throw Error('Missing fresh destination or exact SOL funding.');
 if(preservedWsol){
  const rent=typeof connection.getMinimumBalanceForRentExemption==='function'?await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_BYTES):2039280;
  setup.unshift(...temporaryWsolCreate({owner,address:wsolAta,rentLamports:rent,existing:temporaryAccount}));
 }
 const cleanup=decode(built.cleanupInstruction);if(cleanup.programId.toBase58()!==TOKEN_PROGRAM_ID.toBase58()||cleanup.data.length!==1||cleanup.data[0]!==9||String(cleanup.keys[0]?.pubkey)!==String(wsolAta)||String(cleanup.keys[1]?.pubkey)!==owner||String(cleanup.keys[2]?.pubkey)!==owner)throw Error('Unsupported SOL cleanup.');
 if(preservedWsol){
  for(const ix of [...setup,cleanup]){
   const keys=ix.keys.map(key=>key.pubkey.toBase58());
   if(ix.programId.equals(TOKEN_PROGRAM_ID)&&ix.data.length===1&&ix.data[0]===9&&keys[0]===preservedWsol.account)throw Error('Existing WSOL account cannot be closed.');
   if(ix.programId.equals(SystemProgram.programId)&&ix.data.length>=12&&ix.data.readUInt32LE(0)===2&&keys[1]===preservedWsol.account)throw Error('Existing WSOL starting balance cannot fund this route.');
  }
 }
 const routerCompute=built.computeBudgetInstructions.map(decode);if(routerCompute.some(ix=>String(ix.programId)!==COMPUTE||ix.keys.length||!((ix.data.length===5&&ix.data[0]===2&&ix.data.readUInt32LE(1)>0&&ix.data.readUInt32LE(1)<=1400000)||(ix.data.length===9&&ix.data[0]===3)))||routerCompute.filter(ix=>ix.data[0]===2).length!==1||routerCompute.filter(ix=>ix.data[0]===3).length>1)throw Error('Unsupported compute instructions.');
 // Keep the wallet review inside the user-approved debit cap.  A missing/zero
 // price lets wallets inject a congestion estimate that was never reviewed.
 // The route therefore carries one explicit, low and immutable priority price.
 const compute=[routerCompute.find(ix=>ix.data[0]===2),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000})];
 const latest=await connection.getLatestBlockhashAndContext('confirmed'),tables=await loadAddressLookupTables(connection,built.addressLookupTableAddresses,{minContextSlot:latest.context.slot});
 const {pre:preGuards,post:postGuards}=buildSolBalanceGuards({side,baseAccount:baseAta,wsolAccount:wsolAta,baseline:String(baseline),amount,minimum:terms.minimum,baseExists:!!baseAccount,preservedWsol});
 let tx,packet;try{tx=new VersionedTransaction(new TransactionMessage({payerKey:payer,recentBlockhash:latest.value.blockhash,instructions:[...compute,...setup,...preGuards,...quoteGuards.pre,swap,...postGuards,...quoteGuards.post,...quoteClose,cleanup]}).compileToV0Message(tables.tables));packet=tx.serialize();}catch(error){if(!String(error?.message||error).includes('overruns'))throw error;throw Error('Guarded SOL route exceeds supported signer or packet limits.');}
 if(tx.message.header.numRequiredSignatures!==1||String(tx.message.staticAccountKeys[0])!==owner||packet.length>1232)throw Error('Guarded SOL route exceeds supported signer or packet limits.');
 let addressContext=await resolveTransactionAddresses(connection,tx,{minContextSlot:tables.slot});
 const allKeys=transactionAddressKeys(tx,addressContext),writable=allKeys.filter((_,i)=>tx.message.isAccountWritable(i));
 const snapshot=await connection.getMultipleAccountsInfoAndContext(writable.map(k=>new PublicKey(k)),{commitment:'confirmed',minContextSlot:addressContext.slot});
 if(!Number.isSafeInteger(snapshot.context?.slot)||snapshot.context.slot<addressContext.slot||snapshot.value.length!==writable.length)throw Error('Owned intermediate account snapshot unavailable.');
 const intermediates=[];
 for(let i=0;i<writable.length;i++){const a=snapshot.value[i],key=writable[i];if(!a||key===String(baseAta)||key===String(wsolAta)||key===String(quoteAta)||![String(TOKEN_PROGRAM_ID),String(TOKEN_2022_PROGRAM_ID)].includes(String(a.owner)))continue;
  const token=unpackAccount(new PublicKey(key),a,a.owner);if(token.owner.equals(payer))intermediates.push({account:key,amount:String(token.amount),mint:String(token.mint),program:String(a.owner)});
 }
 if(intermediates.length){const unchanged=intermediates.map(t=>tokenBalanceEqualityGuard(t.account,t.amount));
  tx=new VersionedTransaction(new TransactionMessage({payerKey:payer,recentBlockhash:latest.value.blockhash,instructions:[...compute,...setup,...preGuards,...quoteGuards.pre,...unchanged,swap,...postGuards,...quoteGuards.post,...unchanged,...quoteClose,cleanup]}).compileToV0Message(tables.tables));
  if(tx.serialize().length>1232)throw Error('Guarded SOL route is too large. No security assertions were removed.');
  addressContext=await resolveTransactionAddresses(connection,tx,{minContextSlot:snapshot.context.slot});
 }
 const proof=await simulationCostProof(connection,tx,payer,{sigVerify:false,addresses:[owner,String(baseAta)],minContextSlot:addressContext.slot,addressContext,allowPayerCredit:side==='sell'});
 const account=proof.accounts[1];if(!account||account.owner!==String(baseProgram))throw Error('Fresh token output unavailable.');
 const bytes=Buffer.from(account.data[0],'base64');if(bytes.length<165||!bytes.subarray(0,32).equals(baseMint.toBuffer())||!bytes.subarray(32,64).equals(payer.toBuffer()))throw Error('Wrong output mint or owner.');
 const input={owner,mint,pool:scope.pool,launchPool:scope.launchPool,routeStage:scope.stage,routeVenue:scope.venue,routeScopeVersion:SOL_ROUTE_SCOPE_VERSION,routeSource,tokenProgram:scope.tokenProgram,side,amount,minimum:terms.minimum,maxTotalDebitLamports,maxOverheadLamports:side==='buy'?maxTotalDebitLamports-Number(amount):proof.fee,minContextSlot:addressContext.slot,lastValidBlockHeight:latest.value.lastValidBlockHeight,addressFingerprint:addressContext.fingerprint,transactionBase64:Buffer.from(tx.serialize()).toString('base64'),outputAccount:side==='buy'?String(baseAta):owner,baseAccount:String(baseAta),wsolAccount:String(wsolAta),preservedWsol,tokenBaseline:String(baseline),intermediateBalances:[{account:String(quoteAta),amount:String(quoteState.amount),mint:row.quoteMint,program:String(TOKEN_PROGRAM_ID),fresh:quoteState.fresh},...intermediates],transientIntermediate:quoteState.fresh?String(quoteAta):null,allowDefaultZeroPrice:false,balanceGuardsVersion:2,freshOutput:!baseAccount,netMinimumGuard:{program:'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95',sourceCommit:LIGHTHOUSE_NET_GUARD_SOURCE,minimum:terms.minimum,account:side==='buy'?String(baseAta):String(wsolAta)},reviewed:decodeReviewedTransaction(tx,addressContext)};
 const tokenAfter=bytes.readBigUInt64LE(64),inputDelta=side==='buy'?amount:String(baseline-tokenAfter),outputDelta=side==='buy'?String(tokenAfter-baseline):String(BigInt(proof.after)-BigInt(proof.before)+BigInt(proof.fee));
 if(side==='sell'&&BigInt(terms.minimum)<=BigInt(proof.fee))throw Error('SOL sale is too small after network fees.');
 assertSolTradeOutcome(input,{...proof,inputDelta,outputDelta,tokenBaselineEvidence:'same-bank-or-onchain-guard'});
 if(proof.after<SOL_TRADE_RESERVE)throw Error('Insufficient SOL fee reserve.');
 return createSolTradeIntent(storage,{...input,estimatedLamports:proof.debit,networkFee:proof.fee,netOutput:outputDelta,...(side==='sell'?{minimumNetSol:String(BigInt(terms.minimum)-BigInt(proof.fee)),estimatedNetSol:String(BigInt(proof.after)-BigInt(proof.before))}:{})});
}

// Compatibility alias for the disabled initial candidate adapter.
export const prepareNewAccountSolBuy=prepareGuardedSolTrade;
