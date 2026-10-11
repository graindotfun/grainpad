import {createClassicSolReviewGuard} from './classic-sol-review.mjs';
import {CLASSIC_SOL_MODE,readClassicSolIssuanceState} from './classic-sol-policy.mjs';
import {buildLaunchInstruction} from './launch-instructions.mjs';
import {authorizePlannedLaunch} from './monero-prelaunch-browser.mjs';
import {inspectTransactionStatus} from './transaction-status.mjs';
import {simulationCostProof} from './simulation-cost.mjs';
import {sessionRpcFetch} from "./browser-rpc-session.mjs";
import {rebroadcastSigned} from './rebroadcast.mjs';
import './browser-buffer.mjs';
import { Buffer } from "buffer";
import { Connection, PublicKey, Keypair, VersionedTransaction, TransactionMessage, ComputeBudgetProgram } from "@solana/web3.js";
import {quoteAsset} from "./quote-assets.mjs";
import {buildPublicCreatorBuyIntent,buildPublicRewardsLaunch,compilePublicRewardsLaunch,readPublicCreatorBuyBalance,publicCreatorBuySimulationAddresses,assertPublicCreatorBuySimulation,launchPacketBytes} from './public-creator-buy.mjs';
import {solCreatorBuyLamports,quoteSolCreatorBuy,buildSolCreatorBuyIntent,assertSolCreatorBuyIntent,assertSolCreatorBuyFresh,readSolCreatorBuyFunding,assertSolQuoteMeetsIntent} from './public-sol-creator-buy.mjs';
import {GRAINPAD_SOL_LOOKUP_TABLE} from './sol-route-lookup.mjs';
import {loadAddressLookupTables,resolveTransactionAddresses} from './transaction-addresses.mjs';
import {readRewardsIssuanceState} from "./rewards-issuance.mjs";
import {isLaunchTaxBps} from "./rewards-policy.mjs";
import { NETWORKS, type Network } from "./site-config";
import {assertMintSuffix} from "./vanity-suffix";
import {isPreviousOfficialMint} from "./previous-official-mints.mjs";
import {POLICY,grainpadPlatformId,decodePlatform,assertGrainpadPolicy} from "./platform-policy";

import {assertTokenCreationEnabled} from './platform-settings.mjs';
import {decodeReviewedTransaction,inspectWalletTransaction,sameSimulatedAccount} from './wallet-transaction-policy.mjs';
// Load signing guards with the launch module, before preparing a review. A tab
// must not need a new deployment-specific chunk after it reaches wallet review.
import {signWalletFirst} from './wallet-signing.mjs';
import {assertBlockhashWindow} from './blockhash-window.mjs';
import {createSigningAttempt,assertReviewFresh,safeStore,type SigningAttempt} from './signing-attempt.mjs';
const launchMintSigners=new WeakMap<object,Keypair>();const classicSolReviews=createClassicSolReviewGuard();

import bs58 from 'bs58';
import type {Wallet} from "./wallet";
import {formatSOL} from "./format-sol";
export {formatSOL} from "./format-sol";
export type {Wallet} from "./wallet";
export function rpc(network:Network,attemptId?:string,submittedSignature?:string){return new Connection(`${window.location.origin}/api/rpc?network=${network}`,{commitment:"confirmed",disableRetryOnRateLimit:true,fetch:sessionRpcFetch,httpHeaders:{...(attemptId?{'X-Grainpad-Attempt':attemptId}:{}),...(submittedSignature?{'X-Grainpad-Signature':submittedSignature}:{})}});}
export async function assertNetwork(connection:Connection,network:Network){if(await connection.getGenesisHash()!==NETWORKS[network].genesis)throw Error("RPC network does not match your selection.");}
export function solToLamports(value:string):bigint{
 if(!/^(0|[1-9][0-9]*)(\.[0-9]{1,9})?$/.test(value))throw Error("Enter a SOL amount with up to 9 decimal places.");
 const [a,b=""]=value.split(".");const n=BigInt(a)*BigInt("1000000000")+BigInt(b.padEnd(9,"0"));
 if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error("Amount is too large.");return n;
}
export type PublicCreatorBuy={quote:string;amountIn:string;minOut:string;taxBps:number;slippageBps:number;expectedNetOutputRaw:string;simulatedNetOutputRaw:string;transferFeeRaw:string;totalCurveFeeRaw:string;curveFeesRaw:Record<string,string>;curvePrincipalRaw:string;quoteDecimals:number;tokenDecimals:number;balanceBeforeRaw:string;quoteExpiresAt?:number;wxmrQuotedRaw?:string;launchDebitLamports?:string;wxmrBeforeRaw?:string|null;wsolBeforeRaw?:string|null;wxmrExists?:boolean;wsolExists?:boolean;tickArrays?:number};
export type SolCreatorBuyIntent={quote:'SOL';amountIn:string;minOut:string;taxBps:number;slippageBps:number;quoteExpiresAt:number};
export type PreparedLaunch={launchMode?:"classic-sol-v1";creatorBuy?:PublicCreatorBuy|null;setupCostCapLamports?:number;setupStep?:"1a"|"1b";setupSlot?:number;setupTotalLamports?:number;remainingSetupLamports?:number;transactionBytes?:number;simulationUnits?:number;transaction:VersionedTransaction;network:Network;owner:string;mint:string;pool:string;metadataHash:string;name:string;symbol:string;platformName:string;quoteAsset:string;quoteMint:string;quoteDecimals:number;estimatedLamports:number;maxLamports:bigint;createdAt:number;lastValidBlockHeight:number;blockhash:string;rewards?:{taxBps:number;collector:string};fees:{protocol:string;platform:string;creator:string};simulationLogs:string[];targetAccount?:string;operationKind?:"platform"|"launch";minimumBalanceLamports?:number;measuredDebitLamports?:number;networkFeeLamports?:number;balanceBeforeLamports?:number};
export type PreparedOperation=Pick<PreparedLaunch,"launchMode"|"creatorBuy"|"rewards"|"setupCostCapLamports"|"transaction"|"network"|"owner"|"estimatedLamports"|"maxLamports"|"createdAt"|"lastValidBlockHeight"|"blockhash"|"targetAccount"|"operationKind"|"minimumBalanceLamports"|"measuredDebitLamports"|"networkFeeLamports"|"balanceBeforeLamports"|"setupStep"|"setupSlot"|"setupTotalLamports"|"remainingSetupLamports"|"transactionBytes"|"simulationUnits"> & {simulationLogs?:string[];priorityFee?:{microLamports:number;floor:number;cap:number;lamports:number;source:string}};
/** Pending is a normal state; uncertain attempts remain locked until resolved. */
// Receipt polling runs every second; the same-origin relay's genesis is verified once per tab, not per poll.
let receiptNetworkVerified=false;
export async function inspectSubmitted(signature:string,receipt?:{target?:string;expiry?:number;acceptConfirmed?:boolean}){
 const connection=rpc('mainnet-beta',undefined,signature);if(!receiptNetworkVerified){await assertNetwork(connection,'mainnet-beta');receiptNetworkVerified=true;}
 const raw=localStorage.getItem(`grainpad-tx-expiry:${signature}`);
 return inspectTransactionStatus(connection,signature,{expiry:receipt?.expiry??(raw?Number(raw):NaN),target:receipt?.target??localStorage.getItem(`grainpad-tx-target:${signature}`),publicKey:(value:string)=>new PublicKey(value),acceptConfirmed:receipt?.acceptConfirmed===true});
}
export async function resolveSubmitted(signature:string){
 const result=await inspectSubmitted(signature);
 if(['finalized','failed','expired'].includes(result.status))return result.status;
 throw Error(result.reason||'Transaction is still pending or its expiry cannot be verified. Check the explorer before retrying.');
}
export const DEVNET_PLATFORM="";
/** Draft-time SOL creator-buy quote. Reads the live SOL/wXMR pool and the owner's accounts, and refuses before any
 * signature if the launch would not fit one packet (a placeholder of the exact URI length stands in for the
 * not-yet-signed metadata URI). The returned intent is what the creator signs inside the metadata. */
export async function quoteSolCreatorBuyDraft(input:{network:Network;owner:string;mint:string;name:string;symbol:string;uriLength:number;amount:string;taxBps:number}){
 assertTokenCreationEnabled();
 if(input.network!=="mainnet-beta")throw Error("Rewards launches are mainnet-only.");
 const amountIn=solCreatorBuyLamports(input.amount);if(amountIn==='0')return null;
 if(!isLaunchTaxBps(input.taxBps))throw Error('Creator buy requires the selected launch tax.');
 if(!Number.isSafeInteger(input.uriLength)||input.uriLength<10||input.uriLength>200)throw Error('Metadata URI length is unavailable.');
 const connection=rpc(input.network);await assertNetwork(connection,input.network);
 const owner=new PublicKey(input.owner),mint=new PublicKey(input.mint),probe={owner:input.owner,mint:input.mint,creatorBuy:{amountIn}};
 const funding=await readSolCreatorBuyFunding(connection,probe);
 const quote=await quoteSolCreatorBuy(connection,{amountIn,taxBps:input.taxBps});
 const intent=buildSolCreatorBuyIntent({amountIn,expectedNetOutputRaw:quote.expectedNetOutputRaw,taxBps:input.taxBps});
 const {platformId}=await readRewardsIssuanceState(connection);
 const uri=('https://grainpad.fun/api/assets/'+'0'.repeat(200)).slice(0,input.uriLength);
 const built=buildPublicRewardsLaunch({owner,mint,platform:platformId,name:input.name,symbol:input.symbol,uri,taxBps:input.taxBps,quoteMint:quoteAsset('wXMR').mint,creatorBuy:intent,solRoute:{ticks:quote.ticks,wsolExists:funding.wsolExists,wxmrExists:funding.wxmrExists}});
 const lookupTables=(await loadAddressLookupTables(connection,[new PublicKey(GRAINPAD_SOL_LOOKUP_TABLE)])).tables;
 const transaction=compilePublicRewardsLaunch(built,{owner,blockhash:String(PublicKey.default),lookupTables,walletFormat:"compact"});
 return {intent,quote,packetBytes:launchPacketBytes(transaction),wsolExists:funding.wsolExists,wxmrExists:funding.wxmrExists,ownerLamports:funding.ownerLamportsBefore};
}
async function prepareSolCreatorBuy(connection:Connection,input:{owner:PublicKey;mint:PublicKey;platformId:PublicKey;name:string;symbol:string;uri:string;taxBps:number;signed:unknown}){
 const intent=assertSolCreatorBuyIntent(input.signed,input.taxBps) as SolCreatorBuyIntent;assertSolCreatorBuyFresh(intent);
 const p={owner:String(input.owner),mint:String(input.mint),creatorBuy:intent};
 const funding=await readSolCreatorBuyFunding(connection,p);
 const quote=await quoteSolCreatorBuy(connection,{amountIn:intent.amountIn,taxBps:input.taxBps});
 assertSolQuoteMeetsIntent(quote,intent);
 const built=buildPublicRewardsLaunch({owner:input.owner,mint:input.mint,platform:input.platformId,name:input.name,symbol:input.symbol,uri:input.uri,taxBps:input.taxBps,quoteMint:quoteAsset('wXMR').mint,creatorBuy:intent,solRoute:{ticks:quote.ticks,wsolExists:funding.wsolExists,wxmrExists:funding.wxmrExists}});
 return {intent,quote,funding,built};
}
export async function verifyClassicSolAvailability(network:Network){if(network!=='mainnet-beta')throw Error('Classic SOL launch is mainnet-only.');const connection=rpc(network);await assertNetwork(connection,network);return readClassicSolIssuanceState(connection);}
async function prepareClassicSol(input:{network:Network;owner:string;name:string;symbol:string;uri:string;metadataHash:string;maxCost:string;mintKeypair:Keypair;creatorBuyAmount?:string;solCreatorBuyIntent?:SolCreatorBuyIntent|null;taxBps?:number}):Promise<PreparedLaunch>{
 if(!/^[a-f0-9]{64}$/.test(input.metadataHash)||!input.name.trim()||Buffer.byteLength(input.name)>32||!/^[$A-Za-z0-9]{1,10}$/.test(input.symbol)||Buffer.byteLength(input.uri)>200||! /^(https:\/\/|ipfs:\/\/)/.test(input.uri))throw Error('Canonical classic SOL metadata required.');
 if(input.network!=='mainnet-beta'||input.taxBps!==0||solToLamports(input.creatorBuyAmount||'0')!==0n||input.solCreatorBuyIntent)throw Error('Classic SOL launches have no transfer tax or conversion buy.');
 const connection=rpc(input.network),owner=new PublicKey(input.owner),mint=input.mintKeypair,maxLamports=solToLamports(input.maxCost);await assertNetwork(connection,input.network);
 const state=await readClassicSolIssuanceState(connection);
 if(maxLamports<=0n||mint.publicKey.equals(owner)||await connection.getAccountInfo(mint.publicKey))throw Error('Fresh mint and positive cost limit required.');
 const built=buildLaunchInstruction({owner,mint:mint.publicKey,platform:state.platformId,symbol:'SOL',name:input.name,tokenSymbol:input.symbol,uri:input.uri});
 const latest=await connection.getLatestBlockhash('confirmed');
 const transaction=new VersionedTransaction(new TransactionMessage({payerKey:owner,recentBlockhash:latest.blockhash,instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:600000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}),built.instruction]}).compileToV0Message());
 const addressContext=await resolveTransactionAddresses(connection,transaction,{minContextSlot:state.slot}),cost=await simulationCostProof(connection,transaction,owner,{sigVerify:false,addresses:[input.owner],minContextSlot:state.slot,addressContext});
 if(BigInt(cost.debit)>maxLamports||cost.after<5000000)throw Error('Simulated SOL cost exceeds the limit or required0.005SOL reserve. Nothing was sent.');
 const prepared:PreparedLaunch={launchMode:CLASSIC_SOL_MODE,transaction,network:input.network,owner:input.owner,mint:String(mint.publicKey),pool:String(built.pool),metadataHash:input.metadataHash,name:input.name,symbol:input.symbol,platformName:'Grainpad',quoteAsset:'SOL',quoteMint:state.quote.mint,quoteDecimals:9,estimatedLamports:cost.debit,maxLamports,createdAt:Date.now(),...latest,targetAccount:String(mint.publicKey),operationKind:'launch',minimumBalanceLamports:5000000,measuredDebitLamports:cost.debit,networkFeeLamports:cost.fee,balanceBeforeLamports:cost.before,simulationUnits:cost.units,fees:{protocol:state.config.tradeFeeRate.toString(),platform:state.platform.feeRate.toString(),creator:state.platform.creatorFeeRate.toString()},simulationLogs:cost.sim.value.logs||[],creatorBuy:null};
 classicSolReviews.capture(prepared);launchMintSigners.set(prepared,mint);return prepared;
}
export async function prepareLaunch(input:{network:Network;owner:string;name:string;symbol:string;uri:string;metadataHash:string;maxCost:string;mintKeypair:Keypair;quoteAsset?:string;taxBps?:number;creatorBuyAmount?:string;creatorBuyCurrency?:'wXMR'|'SOL';solCreatorBuyIntent?:SolCreatorBuyIntent|null;walletFormat?:"compact"|"static"}):Promise<PreparedLaunch>{
 assertTokenCreationEnabled(input.quoteAsset==='SOL'?CLASSIC_SOL_MODE:'rewards');
 if(!input.mintKeypair)throw Error("Generate a grn mint address before preparing this launch.");
 assertMintSuffix(input.mintKeypair.publicKey.toBase58());
 (globalThis as unknown as {Buffer:typeof Buffer}).Buffer??=Buffer;
 const connection=rpc(input.network);await assertNetwork(connection,input.network);
 if(input.network!=="mainnet-beta")throw Error("Rewards launches are mainnet-only.");
 const owner=new PublicKey(input.owner),maxLamports=solToLamports(input.maxCost);
 if(maxLamports<=BigInt("0"))throw Error("Set a maximum launch cost before preparing the transaction.");
 const quote=quoteAsset(input.quoteAsset);
 if(quote.symbol==='SOL')return prepareClassicSol(input);
 if(quote.symbol!=='wXMR')throw Error('Holder reward launches must be paired with wXMR.');
 if(!isLaunchTaxBps(input.taxBps))throw Error('Choose a transfer tax from 1.0% to 3.0% in 0.1% steps.');
 if(isPreviousOfficialMint(input.mintKeypair.publicKey.toBase58()))throw Error('The official GRAIN purchase route needs a separate reviewed configuration.');
 const {platformId,platform,config,collector}=await readRewardsIssuanceState(connection);
 const mint=input.mintKeypair;
 if(mint.publicKey.equals(owner)||await connection.getAccountInfo(mint.publicKey))throw Error("Mint address is already in use. Use a fresh mint-only key, never your wallet key.");
 const sol=input.creatorBuyCurrency==='SOL'&&solCreatorBuyLamports(input.creatorBuyAmount??'')!=='0';
 if(input.creatorBuyCurrency==='SOL'&&!sol&&input.solCreatorBuyIntent)throw Error('Creator buy differs from the signed atomic purchase intent.');
 if(sol&&(!input.solCreatorBuyIntent||input.solCreatorBuyIntent.amountIn!==solCreatorBuyLamports(input.creatorBuyAmount??'')))throw Error('Sign the SOL creator buy in your launch metadata before preparing.');
 const solPlan=sol?await prepareSolCreatorBuy(connection,{owner,mint:mint.publicKey,platformId,name:input.name,symbol:input.symbol,uri:input.uri,taxBps:input.taxBps!,signed:input.solCreatorBuyIntent}):null;
 const intent=sol?solPlan!.intent:buildPublicCreatorBuyIntent({amount:input.creatorBuyCurrency==='SOL'?'':input.creatorBuyAmount??'',taxBps:input.taxBps!});
 const built=solPlan?solPlan.built:buildPublicRewardsLaunch({owner,mint:mint.publicKey,platform:platformId,name:input.name,symbol:input.symbol,uri:input.uri,taxBps:input.taxBps,quoteMint:quote.mint,creatorBuy:intent});
 const walletFormat=input.walletFormat??"compact";
 const lookupTables=intent&&walletFormat==="compact"?(await loadAddressLookupTables(connection,[new PublicKey(GRAINPAD_SOL_LOOKUP_TABLE)])).tables:[];
 const latest=await connection.getLatestBlockhash('confirmed');
 const transaction=compilePublicRewardsLaunch(built,{owner,blockhash:latest.blockhash,lookupTables,walletFormat});
 const buyReview={owner:input.owner,mint:String(mint.publicKey),pool:String(built.pool),creatorBuy:solPlan?{...built.creatorBuy,wsolExists:solPlan.funding.wsolExists,wxmrExists:solPlan.funding.wxmrExists}:built.creatorBuy};
 const funding=await readPublicCreatorBuyBalance(connection,buyReview);
 const addressContext=await resolveTransactionAddresses(connection,transaction,{minContextSlot:funding?.slot??1});
 const cost=await simulationCostProof(connection,transaction,owner,{sigVerify:false,addresses:publicCreatorBuySimulationAddresses(buyReview),addressContext,minContextSlot:funding?.slot??1}),sim=cost.sim,before=cost.before,after=cost.after,fee={value:cost.fee};
 const checked=assertPublicCreatorBuySimulation(buyReview,cost,funding);
 // A SOL buy reviews its live route next to the signed intent; the SOL input itself is outside the launch-cost limit.
 const creatorBuy=solPlan&&checked?{...checked,wxmrQuotedRaw:solPlan.quote.wxmrQuotedRaw,expectedNetOutputRaw:solPlan.quote.expectedNetOutputRaw,transferFeeRaw:solPlan.quote.transferFeeRaw,totalCurveFeeRaw:solPlan.quote.totalCurveFeeRaw,curveFeesRaw:solPlan.quote.curveFeesRaw,curvePrincipalRaw:solPlan.quote.curvePrincipalRaw,quoteDecimals:9,tokenDecimals:6,tickArrays:solPlan.quote.ticks.length}:checked;
 const estimatedLamports=cost.debit,solInput=solPlan?BigInt(solPlan.intent.amountIn):0n;
 if(BigInt(estimatedLamports)-solInput>maxLamports)throw Error(`Estimated cost ${formatSOL(Number(BigInt(estimatedLamports)-solInput))} SOL${solPlan?' before the SOL creator buy':''} exceeds your limit. Nothing was sent.`);
 if(before-estimatedLamports<5000000)throw Error("NO-GO: launch would leave less than the required 0.005 SOL reserve.");
 const prepared:PreparedLaunch={creatorBuy,transactionBytes:launchPacketBytes(transaction),rewards:{taxBps:input.taxBps!,collector:String(collector)},targetAccount:mint.publicKey.toBase58(),operationKind:"launch",minimumBalanceLamports:5000000,measuredDebitLamports:Math.max(0,before-after),networkFeeLamports:fee.value,balanceBeforeLamports:before,transaction,network:input.network,owner:input.owner,mint:mint.publicKey.toBase58(),pool:built.pool.toBase58(),metadataHash:input.metadataHash,name:input.name,symbol:input.symbol,platformName:"Grainpad",quoteAsset:quote.symbol,quoteMint:quote.mint,quoteDecimals:quote.decimals,estimatedLamports,maxLamports:maxLamports+solInput,createdAt:Date.now(),lastValidBlockHeight:latest.lastValidBlockHeight,blockhash:latest.blockhash,fees:{protocol:config.tradeFeeRate.toString(),platform:platform.feeRate.toString(),creator:platform.creatorFeeRate.toString()},simulationLogs:sim.value.logs||[]};
 launchMintSigners.set(prepared,mint);return prepared;
}
async function preflightOperation(reviewed:PreparedOperation,connection:Connection,attempt:ReturnType<typeof createSigningAttempt>){
 classicSolReviews.check(reviewed);let p=reviewed;
 const refreshable=p.operationKind==='platform'||p.operationKind==='launch';
 let setupBefore:(import('@solana/web3.js').AccountInfo<Buffer>|null)[]|undefined;
 if(p.operationKind==='launch')assertTokenCreationEnabled(p.launchMode||'rewards');
 if(p.operationKind==='platform'){
  const {assertSetupSigningEnabled,assertSetupMessage,readSetup}=await import('./platform-setup.mjs');
  assertSetupSigningEnabled(p.setupStep);assertSetupMessage(p);
  await assertNetwork(connection,p.network);
  const snapshot=await readSetup(connection);setupBefore=snapshot.accounts;
  if(snapshot.state!==p.setupStep)throw Error('Setup stage changed. Refresh and review before any wallet request.');
 }
 if(!refreshable)assertReviewFresh(p);
 await assertNetwork(connection,p.network);
 if(!refreshable)assertBlockhashWindow(p.lastValidBlockHeight,await connection.getBlockHeight("confirmed"));
 if(p.targetAccount&&await connection.getAccountInfo(new PublicKey(p.targetAccount),'confirmed'))throw Error('Target already exists: creation skipped. Verify the existing account; do not create twice.');
 if(p.operationKind==='launch'){
  if(p.launchMode===CLASSIC_SOL_MODE){const state=await readClassicSolIssuanceState(connection);if((p as PreparedLaunch).quoteMint!==state.quote.mint||p.rewards||p.creatorBuy)throw Error('Classic SOL review configuration changed.');}
  else {const state=await readRewardsIssuanceState(connection);
  if(!p.rewards||p.rewards.collector!==String(state.collector)||!isLaunchTaxBps(p.rewards.taxBps))throw Error('Rewards configuration changed. Prepare a new launch review.');}
 }

 // Always simulate the exact message again immediately before the user wallet prompt.
 if(refreshable){
  attempt.update('refreshing_blockhash');
  if(p.transaction.signatures.some(signature=>signature.some(Boolean)))throw Error('Only an unsigned review can receive a fresh blockhash. Nothing was sent.');
  const latest=await connection.getLatestBlockhash('confirmed');
  const transaction=VersionedTransaction.deserialize(p.transaction.serialize());
  transaction.message.recentBlockhash=latest.blockhash;
  p={...p,transaction,...latest,createdAt:Date.now()};
  if(p.operationKind==='platform')(await import('./platform-setup.mjs')).assertSetupMessage(p);
  attempt.update('blockhash_refreshed',{blockhash:p.blockhash,lastValidBlockHeight:p.lastValidBlockHeight,reviewCreatedAt:p.createdAt});
 }
 const buyReview=p as PreparedLaunch;
 const funding=p.operationKind==='launch'?await readPublicCreatorBuyBalance(connection,buyReview):null;
 const addressContext=await resolveTransactionAddresses(connection,p.transaction,{minContextSlot:funding?.slot??p.setupSlot??1});
 const simulationAddresses=p.operationKind==='platform'?[p.owner,grainpadPlatformId().toBase58()]:p.operationKind==='launch'?publicCreatorBuySimulationAddresses(buyReview):[p.owner];
 const cost=await simulationCostProof(connection,p.transaction,new PublicKey(p.owner),{sigVerify:false,addresses:simulationAddresses,minContextSlot:funding?.slot??p.setupSlot??1,addressContext,allowPayerCredit:p.operationKind!=='platform'&&p.operationKind!=='launch'}),sim=cost.sim,before=cost.before;
 if(p.operationKind==='platform'){
  const {rpcAccount}=await import('./launch-rules.mjs');const post=rpcAccount(sim.value.accounts?.[1]);
  if(!post?.owner.equals(new PublicKey(POLICY.program)))throw Error('NO-GO: simulated platform owner changed.');
  assertGrainpadPolicy(decodePlatform(post.data));
  if(sim.value.unitsConsumed!==p.simulationUnits)throw Error('NO-GO: setup compute changed; review before signing.');
 }
 const creatorBuy=p.operationKind==='launch'?assertPublicCreatorBuySimulation(buyReview,cost,funding):p.creatorBuy;
 const after=cost.after,fee=cost.fee;
 if(after==null||fee==null)throw Error('NO-GO: simulation cost unavailable.');
 const conservativeDebit=cost.debit;
 if(p.operationKind==='platform'&&(conservativeDebit!==p.measuredDebitLamports||fee!==p.networkFeeLamports))throw Error('Setup cost changed. Stop and review before any wallet request.');
 if(conservativeDebit>p.estimatedLamports||BigInt(conservativeDebit)>p.maxLamports)throw Error('Cost changed. Prepare and review a fresh quote before signing.');
 if(after<(p.minimumBalanceLamports||0))throw Error('NO-GO: required SOL reserve would be breached.');
 const currentHeight=await connection.getBlockHeight('confirmed');
 attempt.update('preflight_verified',{currentBlockHeight:currentHeight,simulationSlot:sim.context?.slot,simulationUnits:sim.value.unitsConsumed});
 assertBlockhashWindow(p.lastValidBlockHeight,currentHeight);
 p={...p,creatorBuy,setupSlot:sim.context?.slot,simulationUnits:sim.value.unitsConsumed,simulationLogs:sim.value.logs||[],balanceBeforeLamports:before,measuredDebitLamports:conservativeDebit,networkFeeLamports:fee};
 return {p,setupBefore,sim,conservativeDebit,fee,simulationAddresses,addressContext};
}
/** Refresh and re-simulate an unsigned review without requesting a wallet. */
export async function refreshPreparedReview<T extends PreparedOperation>(reviewed:T):Promise<T>{
 if(!['platform','launch'].includes(reviewed.operationKind||''))throw Error('This operation requires a new quote.');
 const attempt=createSigningAttempt(reviewed),connection=rpc(reviewed.network);
 const {p}=await preflightOperation(reviewed,connection,attempt);
 const next={...reviewed,...p} as T,mint=launchMintSigners.get(reviewed);
 if(mint)launchMintSigners.set(next,mint);classicSolReviews.carry(reviewed,next);
 return next;
}
export async function signAndSend(reviewed:PreparedOperation,wallet:Wallet,onSignature:(s:string)=>void,onProgress?:(attempt:SigningAttempt)=>void):Promise<string>{
 const attempt=createSigningAttempt(reviewed,onProgress);
 try{
 classicSolReviews.check(reviewed);
 if(reviewed.operationKind==='launch')assertTokenCreationEnabled(reviewed.launchMode||'rewards');
 if(reviewed.operationKind==='platform')(await import('./platform-setup.mjs')).assertSetupSigningEnabled(reviewed.setupStep);
 if(wallet.publicKey?.toBase58()!==reviewed.owner)throw Error('Wallet changed. Prepare again.');
 if(reviewed.operationKind==='launch'){const mint=launchMintSigners.get(reviewed);if(!mint)throw Error('Fresh mint signer required.');await authorizePlannedLaunch({...reviewed,...(reviewed as PreparedLaunch),platformId:grainpadPlatformId().toBase58()},wallet,mint);}
 const connection=rpc(reviewed.network,attempt.get().id);
 const {p,setupBefore,sim,conservativeDebit,fee,simulationAddresses,addressContext}=await preflightOperation(reviewed,connection,attempt);
 const refreshable=p.operationKind==='platform'||p.operationKind==='launch';
 if(wallet.publicKey?.toBase58()!==p.owner)throw Error('Wallet changed. Prepare again.');
 const original=decodeReviewedTransaction(p.transaction,addressContext);
 if(!refreshable)assertReviewFresh(p);
 attempt.update('wallet_requested',{transactionBytes:p.transaction.serialize().length,lookupTableCount:p.transaction.message.addressTableLookups.length,requiredSigners:p.transaction.message.header.numRequiredSignatures,simulationSlot:sim.context?.slot,simulationUnits:sim.value.unitsConsumed,measuredDebitLamports:conservativeDebit,networkFeeLamports:fee});
 let signed:VersionedTransaction;
 if(p.operationKind==='launch'){
  const mint=launchMintSigners.get(reviewed);
  if(!mint)throw Error('Mint signer is no longer available. Prepare a fresh launch.');
  const signingRequest={transaction:p.transaction,wallet,owner:p.owner,additionalSignerPublicKeys:[mint.publicKey],addressContext,resolveReturnedAddressContext:(t:VersionedTransaction)=>resolveTransactionAddresses(connection,t,{minContextSlot:addressContext.slot}),cosign:(t:VersionedTransaction)=>t.sign([mint])};
  signed=await signWalletFirst(signingRequest);
 }else signed=await wallet.signTransaction(p.transaction);
 attempt.update('wallet_returned',{walletReturned:true,walletWaitMs:Date.now()-attempt.get().events.find((e:{stage:string})=>e.stage==='wallet_requested')!.at});
 const signedAddressContext=await resolveTransactionAddresses(connection,signed,{minContextSlot:addressContext.slot});
 const decodedDiff=inspectWalletTransaction(original,signed,signedAddressContext);
 attempt.update('post_sign_checks',{decodedDiff});
 if(!decodedDiff.valid)throw Error(`Wallet returned a different transaction outside the approved structure. ${decodedDiff.reasons.join(' ')} Nothing was sent.`);
 if(wallet.publicKey?.toBase58()!==p.owner)throw Error("Wallet changed during signing.");
 if(!refreshable)assertReviewFresh(p,true);
 const currentHeight=await connection.getBlockHeight('confirmed');
 attempt.update('post_sign_checks',{currentBlockHeight:currentHeight});
 assertBlockhashWindow(p.lastValidBlockHeight,currentHeight,true);
 if(!refreshable)assertReviewFresh(p,true);
 attempt.update('post_sign_simulation');
 const setupKeys=p.operationKind==='platform'?(await import('./platform-setup.mjs')).setupAccounts():[];
 // An instruction cannot write an account absent from its message. Request every
 // setup account included by the wallet, then overlay those results on the coherent snapshot.
 const returnedSetupIndices=setupKeys.flatMap((key:PublicKey,index:number)=>signed.message.staticAccountKeys.some(k=>k.equals(key))?[index]:[]);
 const returnedAddresses=p.operationKind==='platform'?[p.owner,...returnedSetupIndices.map(i=>setupKeys[i].toBase58())]:simulationAddresses;
 const finalFunding=p.operationKind==='launch'?await readPublicCreatorBuyBalance(connection,p as PreparedLaunch,{minContextSlot:sim.context.slot}):null;
 const finalCost=await simulationCostProof(connection,signed,new PublicKey(p.owner),{sigVerify:true,addresses:returnedAddresses,minContextSlot:finalFunding?.slot??sim.context.slot,addressContext:signedAddressContext,allowPayerCredit:p.operationKind!=='platform'&&p.operationKind!=='launch'}),finalSim=finalCost.sim,returnedFee=finalCost.fee,sendBalance=finalCost.before,sendAfter=finalCost.after,sendDebit=finalCost.debit;
 if(p.operationKind==='launch')assertPublicCreatorBuySimulation(p as PreparedLaunch,finalCost,finalFunding);
 attempt.update('post_sign_simulation',{postSignSimulationSlot:finalSim.context?.slot,postSignSimulationError:finalSim.value.err,postSignSimulationUnits:finalSim.value.unitsConsumed,postSignSimulationLogs:(finalSim.value.logs||[]).slice(-25)});
 if(p.operationKind==='platform'){
  const {rpcAccount}=await import('./launch-rules.mjs');const post=rpcAccount(finalSim.value.accounts?.[1]);
  if(!post?.owner.equals(new PublicKey(POLICY.program)))throw Error('NO-GO: post-sign simulated platform owner changed.');
  assertGrainpadPolicy(decodePlatform(post.data));
  if(!sameSimulatedAccount(sim.value.accounts?.[1],finalSim.value.accounts?.[1]))throw Error('NO-GO: returned transaction changed the exact simulated PlatformConfig state.');
  const {SETUP_CAP,SETUP_TOTAL,SETUP_DEBIT,classifySetup,readSetup}=await import('./platform-setup.mjs');
  const returnedAccounts=finalSim.value.accounts?.slice(1);
  if(!setupBefore||!returnedAccounts||returnedAccounts.length!==returnedSetupIndices.length)throw Error('NO-GO: incomplete returned setup simulation.');
  const returnedState=[...setupBefore];
  returnedSetupIndices.forEach((at,i)=>{returnedState[at]=rpcAccount(returnedAccounts[i]);});
  if(classifySetup(returnedState)!==(p.setupStep==='1a'?'1b':'complete'))throw Error('NO-GO: returned transaction changed the required setup end state.');
  if(p.setupStep==='1a'&&!returnedAccounts.every((account:Parameters<typeof rpcAccount>[0],i:number)=>sameSimulatedAccount(account,returnedSetupIndices[i]===0?sim.value.accounts?.[1]:setupBefore![returnedSetupIndices[i]])))throw Error('NO-GO: returned transaction changed simulated rule, allowlist or configuration accounts.');
  // All four rule/allowlist accounts must still be absent during guarded 1a.
  if(p.setupStep==='1a'&&(await readSetup(connection)).state!=='1a')throw Error('NO-GO: setup state changed during wallet review.');
  if(sendDebit-returnedFee!==(p.measuredDebitLamports||0)-(p.networkFeeLamports||0))throw Error('NO-GO: wallet additions changed non-fee SOL movements.');
  const combined=SETUP_TOTAL-SETUP_DEBIT[p.setupStep as '1a'|'1b']+sendDebit;
  const combinedCap=Math.min(SETUP_CAP,p.setupCostCapLamports||SETUP_CAP);
  if(combined>combinedCap)throw Error('NO-GO: returned transaction breaches the combined 0.0135 SOL setup cap.');
  attempt.update('post_sign_simulation',{returnedFeeLamports:returnedFee,combinedSetupLamports:combined,combinedCapLamports:combinedCap});
 }
 if((p.operationKind!=='platform'&&(sendDebit>p.estimatedLamports||BigInt(sendDebit)>p.maxLamports))||sendAfter<(p.minimumBalanceLamports||0))throw Error('NO-GO: post-sign cost or required SOL reserve changed.');
 // Never refresh the blockhash of a signed message. It needs a new owner review.
 const finalHeight=await connection.getBlockHeight('confirmed');
 attempt.update('post_sign_simulation',{currentBlockHeight:finalHeight});
 assertBlockhashWindow(p.lastValidBlockHeight,finalHeight,true);
 if(!refreshable)assertReviewFresh(p,true);
 attempt.update('post_sign_verified',{postSignDebitLamports:sendDebit});
 const wire=signed.serialize();
 const signature=bs58.encode(signed.signatures[0]);
 if(p.targetAccount)safeStore(`grainpad-tx-target:${signature}`,p.targetAccount);
 safeStore(`grainpad-tx-expiry:${signature}`,String(p.lastValidBlockHeight));
 // Preserve public receipt details before the RPC call, even if its response is lost.
 const submissionConnection=rpc(p.network,attempt.get().id,signature);
 return await rebroadcastSigned({connection:submissionConnection,wire,signature,lastValidBlockHeight:p.lastValidBlockHeight,onEvent:(stage:string,details:Record<string,unknown>)=>{
  attempt.update(stage,details);
  if(stage==='send_started'){try{onSignature(signature);}catch{/* Preserve the signed receipt even if UI observers fail. */}}
 }});
 }catch(error){const failure=attempt.fail(error);if((error as {retryReview?:boolean})?.retryReview)Object.assign(failure,{retryReview:true});throw failure;}
}
