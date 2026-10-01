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
import {SOL_MINT,SOL_TRADE_RESERVE,SOL_TRADE_OVERHEAD_CAP,assertSolRouteQuote,assertSolTradeOutcome,createSolTradeIntent} from './sol-trade-intent.mjs';
const JUPITER='JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',COMPUTE='ComputeBudget111111111111111111111111111111';
function decode(raw){if(!raw||!Array.isArray(raw.accounts)||raw.accounts.length>80||typeof raw.data!=='string')throw Error('Invalid upstream route instruction.');return new TransactionInstruction({programId:new PublicKey(raw.programId),keys:raw.accounts.map(k=>({pubkey:new PublicKey(k.pubkey),isSigner:k.isSigner===true,isWritable:k.isWritable===true})),data:Buffer.from(raw.data,'base64')});}
export async function fetchSolRouterJSON(fetcher,url,body){const r=await fetcher(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000),redirect:'manual'});if(r.status>=300&&r.status<400)throw Error('Official SOL router redirected unexpectedly.');if(!r.ok)throw Error('Official SOL router is unavailable.');const text=await r.text();if(text.length>100000)throw Error('Route response too large.');return JSON.parse(text);}
export async function prepareGuardedSolTrade({connection,storage,findLaunch,owner,mint,side,amount,slippageBps,maxTotalDebitLamports,expectedGenesis,fetcher=(...args)=>globalThis.fetch(...args)}){
 if(!['buy','sell'].includes(side))throw Error('Choose Buy or Sell.');
 const row=await findLaunch(mint);
 if(!row||row.mint!==mint||row.network!=='mainnet-beta'||row.verification!=='confirmed-on-chain'||(row.quoteAsset??row.quoteSymbol)!=='wXMR'||row.tokenProgram!==TOKEN_2022_PROGRAM_ID.toBase58()||row.decimals!==6||row.quoteMint!==QUOTES.wXMR.mint)throw Error('SOL route requires an indexed Token-2022 Grainpad wXMR launch.');
 if(await connection.getGenesisHash()!==expectedGenesis)throw Error('Wrong SOL network.');
 const payer=new PublicKey(owner);if(!PublicKey.isOnCurve(payer.toBytes()))throw Error('Trade owner must be an on-curve signing wallet.');
 const baseMint=new PublicKey(mint),baseAta=getAssociatedTokenAddressSync(baseMint,payer,false,TOKEN_2022_PROGRAM_ID),wsolAta=getAssociatedTokenAddressSync(new PublicKey(SOL_MINT),payer),quoteMint=new PublicKey(row.quoteMint),quoteAta=getAssociatedTokenAddressSync(quoteMint,payer);
 const [baseAccount,wsolAccount,quoteAccount,quoteMintAccount]=await connection.getMultipleAccountsInfo([baseAta,wsolAta,quoteAta,quoteMint],'confirmed');
 if(wsolAccount)throw Error('This route requires an absent WSOL account; existing WSOL must be handled separately.');
 if(!quoteMintAccount||!quoteMintAccount.owner.equals(TOKEN_PROGRAM_ID)||!unpackMint(quoteMint,quoteMintAccount,TOKEN_PROGRAM_ID).isInitialized||unpackMint(quoteMint,quoteMintAccount,TOKEN_PROGRAM_ID).decimals!==QUOTES.wXMR.decimals)throw Error('Indexed wXMR intermediary is not its initialized classic SPL mint.');
 const quoteState=reviewedQuoteAccount(owner,row.quoteMint,quoteAccount),quoteGuards=quoteAccountGuardsAndClosure(quoteState),quoteClose=quoteGuards.close?[quoteGuards.close]:[];
 const baseline=baseAccount?unpackAccount(baseAta,baseAccount,TOKEN_2022_PROGRAM_ID).amount:0n;
 if(baseAccount&&(String(baseAccount.owner)!==String(TOKEN_2022_PROGRAM_ID)||!unpackAccount(baseAta,baseAccount,TOKEN_2022_PROGRAM_ID).mint.equals(baseMint)||!unpackAccount(baseAta,baseAccount,TOKEN_2022_PROGRAM_ID).owner.equals(payer)))throw Error('Wrong token baseline owner or mint.');
 if(side==='sell'&&(!baseAccount||baseline<BigInt(amount)))throw Error('Insufficient token balance for sale.');
 if(!Number.isSafeInteger(maxTotalDebitLamports)||maxTotalDebitLamports<(side==='buy'?Number(amount):0)||maxTotalDebitLamports-(side==='buy'?Number(amount):0)>SOL_TRADE_OVERHEAD_CAP)throw Error('Review maximum SOL debit and an overhead limit of at most 0.003 SOL.');
 const params=new URLSearchParams({inputMint:side==='buy'?SOL_MINT:mint,outputMint:side==='buy'?mint:SOL_MINT,amount,slippageBps:String(slippageBps),swapMode:'ExactIn',instructionVersion:'V2',restrictIntermediateTokens:'true',maxAccounts:'64',dexes:'Raydium Launchlab,Raydium CLMM'});
 const quote=await fetchSolRouterJSON(fetcher,`https://api.jup.ag/swap/v1/quote?${params}`);const terms=assertSolRouteQuote(quote,{mint,pool:row.pool,side,amount,slippageBps});
 if(quote.routePlan.length!==2||quote.routePlan[0].swapInfo.outputMint!==row.quoteMint)throw Error('SOL route must use only indexed wXMR as its intermediary.');
 const built=await fetchSolRouterJSON(fetcher,'https://api.jup.ag/swap/v1/swap-instructions',{userPublicKey:owner,quoteResponse:quote,wrapAndUnwrapSol:true,useSharedAccounts:false,dynamicComputeUnitLimit:false});
 if(built.tokenLedgerInstruction||built.otherInstructions?.length||!Array.isArray(built.setupInstructions)||!Array.isArray(built.computeBudgetInstructions)||!built.swapInstruction||!built.cleanupInstruction)throw Error('Unsupported SOL route instruction layout.');
 const swap=decode(built.swapInstruction),data=swap.data,at=i=>swap.keys[i]?.pubkey.toBase58();
 const failed=[];
 if(swap.programId.toBase58()!==JUPITER)failed.push('program');
 if(data.length<34)failed.push('header-length');else{
  for(const [name,ok] of [['discriminator',data.subarray(0,8).toString('hex')==='bb64facc31c4af14'],['input-amount',data.readBigUInt64LE(8)===BigInt(amount)],['quoted-output',data.readBigUInt64LE(16)===BigInt(quote.outAmount)],['slippage',data.readUInt16LE(24)===slippageBps],['platform-fee',data.readUInt16LE(26)===0],['positive-fee',data.readUInt16LE(28)===0]])if(!ok)failed.push(name);
 }
 const expected=[owner,(side==='buy'?wsolAta:baseAta).toBase58(),(side==='buy'?baseAta:wsolAta).toBase58(),terms.inputMint,terms.outputMint,String(side==='buy'?TOKEN_PROGRAM_ID:TOKEN_2022_PROGRAM_ID),String(side==='buy'?TOKEN_2022_PROGRAM_ID:TOKEN_PROGRAM_ID),null,'D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf',JUPITER];
 for(let i=0;i<expected.length;i++)if(expected[i]!==null&&at(i)!==expected[i])failed.push('account-'+i);
 if(![JUPITER,(side==='buy'?baseAta:wsolAta).toBase58()].includes(at(7)))failed.push('optional-destination');
 if(!swap.keys[0]?.isSigner||!swap.keys[1]?.isWritable||!swap.keys[2]?.isWritable||swap.keys.some(k=>k.isSigner&&String(k.pubkey)!==owner))failed.push('privileges');
 if(swap.keys.filter(k=>String(k.pubkey)===row.pool).length!==1)failed.push('indexed-pool');
 if(failed.length)throw Error('Jupiter V2 instruction differs from reviewed exact-input terms: '+failed.join(', '));
 let fresh=false,wrappedFresh=false,wrappedTransfer=false,quoteCreated=false;const setup=built.setupInstructions.map(raw=>{const ix=decode(raw),p=ix.programId.toBase58(),d=ix.data,at=i=>ix.keys[i]?.pubkey.toBase58();
  if(p===ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()&&d.length===1&&d[0]===1&&at(0)===owner&&at(2)===owner){
   const target=getAssociatedTokenAddressSync(new PublicKey(at(3)),payer,false,new PublicKey(at(5))).toBase58();if(at(1)!==target)throw Error('Invalid route ATA.');
   if(at(1)===quoteAta.toBase58()){if(quoteCreated)throw Error('Repeated wXMR intermediary creation.');quoteCreated=true;return rewriteReviewedQuoteCreation(ix,quoteState);}
   if(at(1)===baseAta.toBase58()){if(fresh||at(5)!==TOKEN_2022_PROGRAM_ID.toBase58())throw Error('Invalid fresh GRAINU destination.');fresh=true;return baseAccount?null:createAssociatedTokenAccountInstruction(payer,baseAta,payer,baseMint,TOKEN_2022_PROGRAM_ID);}
   if(at(1)!==wsolAta.toBase58()||wrappedFresh||at(5)!==String(TOKEN_PROGRAM_ID))throw Error('Intermediate wallet token accounts are not supported.');wrappedFresh=true;return createAssociatedTokenAccountInstruction(payer,wsolAta,payer,new PublicKey(SOL_MINT));
  }
  if(p===SystemProgram.programId.toBase58()&&d.length===12&&d.readUInt32LE(0)===2&&at(0)===owner&&at(1)===wsolAta.toBase58()&&side==='buy'&&d.readBigUInt64LE(4)===BigInt(amount)&&!wrappedTransfer){wrappedTransfer=true;return ix;}
  if(p===TOKEN_PROGRAM_ID.toBase58()&&d.length===1&&d[0]===17&&at(0)===wsolAta.toBase58())return ix;
  throw Error('Unsupported route setup operation.');}).filter(Boolean);
 if((quoteState.fresh&&!quoteCreated)||!wrappedFresh||(!baseAccount&&!fresh)||(side==='buy'&&!wrappedTransfer)||(side==='sell'&&wrappedTransfer))throw Error('Missing fresh destination or exact SOL funding.');
 const cleanup=decode(built.cleanupInstruction);if(cleanup.programId.toBase58()!==TOKEN_PROGRAM_ID.toBase58()||cleanup.data.length!==1||cleanup.data[0]!==9||String(cleanup.keys[0]?.pubkey)!==String(wsolAta)||String(cleanup.keys[1]?.pubkey)!==owner||String(cleanup.keys[2]?.pubkey)!==owner)throw Error('Unsupported SOL cleanup.');
 const compute=built.computeBudgetInstructions.map(decode).filter(ix=>!(String(ix.programId)===COMPUTE&&ix.data.length===9&&ix.data[0]===3&&ix.data.readBigUInt64LE(1)===0n));if(compute.some(ix=>String(ix.programId)!==COMPUTE||ix.keys.length||!((ix.data.length===5&&ix.data[0]===2&&ix.data.readUInt32LE(1)>0&&ix.data.readUInt32LE(1)<=1400000)||(ix.data.length===9&&ix.data[0]===3)))||compute.filter(ix=>ix.data[0]===2).length!==1||compute.filter(ix=>ix.data[0]===3).length>1)throw Error('Unsupported compute instructions.');
 const latest=await connection.getLatestBlockhashAndContext('confirmed'),tables=await loadAddressLookupTables(connection,built.addressLookupTableAddresses,{minContextSlot:latest.context.slot});
 const {pre:preGuards,post:postGuards}=buildSolBalanceGuards({side,baseAccount:baseAta,wsolAccount:wsolAta,baseline:String(baseline),amount,minimum:terms.minimum,baseExists:!!baseAccount});
 let tx=new VersionedTransaction(new TransactionMessage({payerKey:payer,recentBlockhash:latest.value.blockhash,instructions:[...compute,...setup,...preGuards,quoteGuards.pre,swap,...postGuards,quoteGuards.post,...quoteClose,cleanup]}).compileToV0Message(tables.tables));
 if(tx.message.header.numRequiredSignatures!==1||String(tx.message.staticAccountKeys[0])!==owner||tx.serialize().length>1232)throw Error('Guarded SOL route exceeds supported signer or packet limits.');
 let addressContext=await resolveTransactionAddresses(connection,tx,{minContextSlot:tables.slot});
 const allKeys=transactionAddressKeys(tx,addressContext),writable=allKeys.filter((_,i)=>tx.message.isAccountWritable(i));
 const snapshot=await connection.getMultipleAccountsInfoAndContext(writable.map(k=>new PublicKey(k)),{commitment:'confirmed',minContextSlot:addressContext.slot});
 if(!Number.isSafeInteger(snapshot.context?.slot)||snapshot.context.slot<addressContext.slot||snapshot.value.length!==writable.length)throw Error('Owned intermediate account snapshot unavailable.');
 const intermediates=[];
 for(let i=0;i<writable.length;i++){const a=snapshot.value[i],key=writable[i];if(!a||key===String(baseAta)||key===String(wsolAta)||key===String(quoteAta)||![String(TOKEN_PROGRAM_ID),String(TOKEN_2022_PROGRAM_ID)].includes(String(a.owner)))continue;
  const token=unpackAccount(new PublicKey(key),a,a.owner);if(token.owner.equals(payer))intermediates.push({account:key,amount:String(token.amount),mint:String(token.mint),program:String(a.owner)});
 }
 if(intermediates.length){const unchanged=intermediates.map(t=>tokenBalanceEqualityGuard(t.account,t.amount));
  tx=new VersionedTransaction(new TransactionMessage({payerKey:payer,recentBlockhash:latest.value.blockhash,instructions:[...compute,...setup,...preGuards,quoteGuards.pre,...unchanged,swap,...postGuards,quoteGuards.post,...unchanged,...quoteClose,cleanup]}).compileToV0Message(tables.tables));
  if(tx.serialize().length>1232)throw Error('Guarded SOL route is too large. No security assertions were removed.');
  addressContext=await resolveTransactionAddresses(connection,tx,{minContextSlot:snapshot.context.slot});
 }
 const proof=await simulationCostProof(connection,tx,payer,{sigVerify:false,addresses:[owner,String(baseAta)],minContextSlot:addressContext.slot,addressContext,allowPayerCredit:side==='sell'});
 const account=proof.accounts[1];if(!account||account.owner!==TOKEN_2022_PROGRAM_ID.toBase58())throw Error('Fresh token output unavailable.');
 const bytes=Buffer.from(account.data[0],'base64');if(bytes.length<165||!bytes.subarray(0,32).equals(baseMint.toBuffer())||!bytes.subarray(32,64).equals(payer.toBuffer()))throw Error('Wrong output mint or owner.');
 const input={owner,mint,pool:row.pool,side,amount,minimum:terms.minimum,maxTotalDebitLamports,maxOverheadLamports:side==='buy'?maxTotalDebitLamports-Number(amount):proof.fee,minContextSlot:addressContext.slot,lastValidBlockHeight:latest.value.lastValidBlockHeight,addressFingerprint:addressContext.fingerprint,transactionBase64:Buffer.from(tx.serialize()).toString('base64'),outputAccount:side==='buy'?String(baseAta):owner,baseAccount:String(baseAta),wsolAccount:String(wsolAta),tokenBaseline:String(baseline),intermediateBalances:[{account:String(quoteAta),amount:String(quoteState.amount),mint:row.quoteMint,program:String(TOKEN_PROGRAM_ID),fresh:quoteState.fresh},...intermediates],transientIntermediate:quoteState.fresh?String(quoteAta):null,allowDefaultZeroPrice:true,balanceGuardsVersion:1,freshOutput:!baseAccount,netMinimumGuard:{program:'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95',sourceCommit:LIGHTHOUSE_NET_GUARD_SOURCE,minimum:terms.minimum,account:side==='buy'?String(baseAta):String(wsolAta)},reviewed:decodeReviewedTransaction(tx,addressContext)};
 const tokenAfter=bytes.readBigUInt64LE(64),inputDelta=side==='buy'?amount:String(baseline-tokenAfter),outputDelta=side==='buy'?String(tokenAfter-baseline):String(BigInt(proof.after)-BigInt(proof.before)+BigInt(proof.fee));
 if(side==='sell'&&BigInt(terms.minimum)<=BigInt(proof.fee))throw Error('SOL sale is too small after network fees.');
 assertSolTradeOutcome(input,{...proof,inputDelta,outputDelta,tokenBaselineEvidence:'same-bank-or-onchain-guard'});
 if(proof.after<SOL_TRADE_RESERVE)throw Error('Insufficient SOL fee reserve.');
 return createSolTradeIntent(storage,{...input,estimatedLamports:proof.debit,networkFee:proof.fee,netOutput:outputDelta,...(side==='sell'?{minimumNetSol:String(BigInt(terms.minimum)-BigInt(proof.fee)),estimatedNetSol:String(BigInt(proof.after)-BigInt(proof.before))}:{})});
}

// Compatibility alias for the disabled initial candidate adapter.
export const prepareNewAccountSolBuy=prepareGuardedSolTrade;
