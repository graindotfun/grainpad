import {sessionRpcFetch} from "./browser-rpc-session.mjs";
import {rebroadcastSigned} from './rebroadcast.mjs';
import './browser-buffer.mjs';
import { Buffer } from "buffer";
import { Connection, PublicKey, Keypair, VersionedTransaction, TransactionMessage, ComputeBudgetProgram } from "@solana/web3.js";
import {quoteAsset} from "./quote-assets.mjs";
import {buildLaunchInstruction} from "./launch-instructions.mjs";
import {expectedRuleAccounts,assertRuleAccounts} from "./launch-rules.mjs";
import { NETWORKS, type Network } from "./site-config";
import {assertMintSuffix} from "./vanity-suffix";
import {POLICY,grainpadPlatformId,decodePlatform,assertGrainpadPolicy} from "./platform-policy";

import {assertTokenCreationEnabled} from './platform-settings.mjs';
import {decodeReviewedTransaction,inspectWalletTransaction,sameSimulatedAccount} from './wallet-transaction-policy.mjs';
import {assertBlockhashWindow} from './blockhash-window.mjs';
import {createSigningAttempt,assertReviewFresh,safeStore,type SigningAttempt} from './signing-attempt.mjs';
const launchMintSigners=new WeakMap<object,Keypair>();

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
export type PreparedLaunch={setupCostCapLamports?:number;setupStep?:"1a"|"1b";setupSlot?:number;setupTotalLamports?:number;remainingSetupLamports?:number;transactionBytes?:number;simulationUnits?:number;transaction:VersionedTransaction;network:Network;owner:string;mint:string;pool:string;metadataHash:string;name:string;symbol:string;platformName:string;quoteAsset:string;quoteMint:string;quoteDecimals:number;estimatedLamports:number;maxLamports:bigint;createdAt:number;lastValidBlockHeight:number;blockhash:string;fees:{protocol:string;platform:string;creator:string};simulationLogs:string[];targetAccount?:string;operationKind?:"platform"|"launch";minimumBalanceLamports?:number;measuredDebitLamports?:number;networkFeeLamports?:number;balanceBeforeLamports?:number};
export type PreparedOperation=Pick<PreparedLaunch,"setupCostCapLamports"|"transaction"|"network"|"owner"|"estimatedLamports"|"maxLamports"|"createdAt"|"lastValidBlockHeight"|"blockhash"|"targetAccount"|"operationKind"|"minimumBalanceLamports"|"measuredDebitLamports"|"networkFeeLamports"|"balanceBeforeLamports"|"setupStep"|"setupSlot"|"setupTotalLamports"|"remainingSetupLamports"|"transactionBytes"|"simulationUnits"> & {simulationLogs?:string[];priorityFee?:{microLamports:number;floor:number;cap:number;lamports:number;source:string}};
/** Only release a pending UI after finality or provable blockhash expiry. */
export async function resolveSubmitted(signature:string){
 const connection=rpc('mainnet-beta',undefined,signature);await assertNetwork(connection,'mainnet-beta');
 const status=(await connection.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];
 if(status?.confirmationStatus==='finalized')return status.err?'failed':'finalized';
 const raw=localStorage.getItem(`grainpad-tx-expiry:${signature}`),expiry=raw?Number(raw):NaN;
 const target=localStorage.getItem(`grainpad-tx-target:${signature}`);
 if(!status&&target&&await connection.getAccountInfo(new PublicKey(target),'finalized'))throw Error('Target account exists. Do not recreate it. Verify the existing platform or mint before proceeding.');
 if(!status&&Number.isSafeInteger(expiry)&&await connection.getBlockHeight('finalized')>expiry){
  const again=(await connection.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];
  if(!again)return 'expired';
 }
 throw Error('Transaction is still pending or its expiry cannot be verified. Check the explorer before retrying.');
}
export const DEVNET_PLATFORM="";
export async function prepareLaunch(input:{network:Network;owner:string;name:string;symbol:string;uri:string;metadataHash:string;maxCost:string;mintKeypair:Keypair;quoteAsset?:string}):Promise<PreparedLaunch>{
 assertTokenCreationEnabled();
 if(!input.mintKeypair)throw Error("Generate a grn mint address before preparing this launch.");
 assertMintSuffix(input.mintKeypair.publicKey.toBase58());
 (globalThis as unknown as {Buffer:typeof Buffer}).Buffer??=Buffer;
 const sdk=await import("@raydium-io/raydium-sdk-v2");
 const connection=rpc(input.network);await assertNetwork(connection,input.network);
 const owner=new PublicKey(input.owner);const maxLamports=solToLamports(input.maxCost);
 if(maxLamports<=BigInt("0"))throw Error("Set a maximum launch cost before preparing the transaction.");
 const program=input.network==="devnet"?sdk.DEVNET_PROGRAM_ID.LAUNCHPAD_PROGRAM:sdk.LAUNCHPAD_PROGRAM;
 if(input.network==="devnet"&&!DEVNET_PLATFORM)throw Error("Devnet launch setup is pending. The Monero test report is available in the research tab.");
 const quote=quoteAsset(input.quoteAsset);
 if(input.mintKeypair.publicKey.toBase58()==='Db91fm8AxxfoFySAp6Jg3KVcfZHUTAR7bJDJb5WLMgrn'&&quote.symbol!=='SOL')throw Error('Official GRAIN must stay paired with SOL.');
 const ownId=grainpadPlatformId();
 const ownAccount=input.network==="mainnet-beta"?await connection.getAccountInfo(ownId,"finalized"):null;
 if(input.network==="mainnet-beta"&&!ownAccount)throw Error("Grainpad is awaiting owner activation. Open Platform settings first. No launch was prepared and nothing was sent.");
 if(ownAccount){if(!ownAccount.owner.equals(program))throw Error("Unexpected platform owner.");assertGrainpadPolicy(decodePlatform(ownAccount.data));}
 const platformId=input.network==="devnet"?new PublicKey(DEVNET_PLATFORM):ownId;
 const configId=new PublicKey(quote.config);
 assertRuleAccounts(ownId,await connection.getMultipleAccountsInfo(expectedRuleAccounts(ownId),'finalized'));
 const [configAccount,platformAccount]=await connection.getMultipleAccountsInfo([configId,platformId]);
 if(!configAccount||!platformAccount||!configAccount.owner.equals(program)||!platformAccount.owner.equals(program))throw Error("LaunchLab configuration is unavailable on this network.");
 const config=sdk.LaunchpadConfig.decode(configAccount.data);const platform=sdk.PlatformConfig.decode(platformAccount.data);
 if(ownAccount&&config.tradeFeeRate.toString()!==String(POLICY.protocolRate))throw Error("Protocol fees changed. Review the published launch policy first.");
 const mint=input.mintKeypair;
 if(mint.publicKey.equals(owner)||await connection.getAccountInfo(mint.publicKey))throw Error("Mint address is already in use. Use a fresh mint-only key, never your wallet key.");
 const built=buildLaunchInstruction({owner,mint:mint.publicKey,platform:platformId,symbol:quote.symbol,name:input.name,tokenSymbol:input.symbol,uri:input.uri});
 const transaction=new VersionedTransaction(new TransactionMessage({payerKey:owner,recentBlockhash:(await connection.getLatestBlockhash('confirmed')).blockhash,instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:600000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}),built.instruction]}).compileToV0Message());
 const latest=await connection.getLatestBlockhash("confirmed");transaction.message.recentBlockhash=latest.blockhash;
 const before=await connection.getBalance(owner,"confirmed");
 const sim=await connection.simulateTransaction(transaction,{sigVerify:false,commitment:"confirmed",accounts:{encoding:"base64",addresses:[owner.toBase58()]}});
 if(sim.value.err)throw Error(`Simulation failed. Your wallet may need SOL for account creation. ${JSON.stringify(sim.value.err)}`);
 const after=sim.value.accounts?.[0]?.lamports;if(after===undefined||after===null)throw Error("Could not estimate wallet cost.");
 const fee=await connection.getFeeForMessage(transaction.message,"confirmed");if(fee.value===null)throw Error("Fee quote expired. Prepare again.");
 // RPC simulation debits the fee; use the observed debit exactly once.
 const estimatedLamports=Math.max(0,before-after);
 if(BigInt(estimatedLamports)>maxLamports)throw Error(`Estimated cost ${formatSOL(estimatedLamports)} SOL exceeds your limit. Nothing was sent.`);
 if(before-estimatedLamports<5000000)throw Error("NO-GO: launch would leave less than the required 0.005 SOL reserve.");
 const prepared:PreparedLaunch={targetAccount:mint.publicKey.toBase58(),operationKind:"launch",minimumBalanceLamports:5000000,measuredDebitLamports:Math.max(0,before-after),networkFeeLamports:fee.value,balanceBeforeLamports:before,transaction,network:input.network,owner:input.owner,mint:mint.publicKey.toBase58(),pool:built.pool.toBase58(),metadataHash:input.metadataHash,name:input.name,symbol:input.symbol,platformName:"Grainpad",quoteAsset:quote.symbol,quoteMint:quote.mint,quoteDecimals:quote.decimals,estimatedLamports,maxLamports,createdAt:Date.now(),lastValidBlockHeight:latest.lastValidBlockHeight,blockhash:latest.blockhash,fees:{protocol:config.tradeFeeRate.toString(),platform:platform.feeRate.toString(),creator:platform.creatorFeeRate.toString()},simulationLogs:sim.value.logs||[]};
 launchMintSigners.set(prepared,mint);return prepared;
}
async function preflightOperation(reviewed:PreparedOperation,connection:Connection,attempt:ReturnType<typeof createSigningAttempt>){
 let p=reviewed;
 const refreshable=p.operationKind==='platform'||p.operationKind==='launch';
 let setupBefore:(import('@solana/web3.js').AccountInfo<Buffer>|null)[]|undefined;
 if(p.operationKind==='launch')assertTokenCreationEnabled();
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
  const account=await connection.getAccountInfo(grainpadPlatformId(),'finalized');
  if(!account?.owner.equals(new PublicKey(POLICY.program)))throw Error('NO-GO: platform creation must be finalized and verified before issuance.');
  assertGrainpadPolicy(decodePlatform(account.data));
  assertRuleAccounts(grainpadPlatformId(),await connection.getMultipleAccountsInfo(expectedRuleAccounts(grainpadPlatformId()),'finalized'));
 }
 // Always simulate the exact message again immediately before the user wallet prompt.
 const before=await connection.getBalance(new PublicKey(p.owner),'confirmed');
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
 const simulationAddresses=p.operationKind==='platform'?[p.owner,grainpadPlatformId().toBase58()]:[p.owner];
 const sim=await connection.simulateTransaction(p.transaction,{sigVerify:false,commitment:'confirmed',accounts:{encoding:'base64',addresses:simulationAddresses}});
 if(sim.value.err)throw Error(`NO-GO: fresh simulation failed. ${JSON.stringify(sim.value.err)}`);
 if(p.operationKind==='platform'){
  const {rpcAccount}=await import('./launch-rules.mjs');const post=rpcAccount(sim.value.accounts?.[1]);
  if(!post?.owner.equals(new PublicKey(POLICY.program)))throw Error('NO-GO: simulated platform owner changed.');
  assertGrainpadPolicy(decodePlatform(post.data));
  if(sim.value.unitsConsumed!==p.simulationUnits)throw Error('NO-GO: setup compute changed; review before signing.');
 }
 const after=sim.value.accounts?.[0]?.lamports,fee=(await connection.getFeeForMessage(p.transaction.message,'confirmed')).value;
 if(after==null||fee==null)throw Error('NO-GO: simulation cost unavailable.');
 const conservativeDebit=Math.max(0,before-after);
 if(p.operationKind==='platform'&&(conservativeDebit!==p.measuredDebitLamports||fee!==p.networkFeeLamports))throw Error('Setup cost changed. Stop and review before any wallet request.');
 if(conservativeDebit>p.estimatedLamports||BigInt(conservativeDebit)>p.maxLamports)throw Error('Cost changed. Prepare and review a fresh quote before signing.');
 if(after<(p.minimumBalanceLamports||0))throw Error('NO-GO: required SOL reserve would be breached.');
 const currentHeight=await connection.getBlockHeight('confirmed');
 attempt.update('preflight_verified',{currentBlockHeight:currentHeight,simulationSlot:sim.context?.slot,simulationUnits:sim.value.unitsConsumed});
 assertBlockhashWindow(p.lastValidBlockHeight,currentHeight);
 p={...p,setupSlot:sim.context?.slot,simulationUnits:sim.value.unitsConsumed,simulationLogs:sim.value.logs||[],balanceBeforeLamports:before,measuredDebitLamports:conservativeDebit,networkFeeLamports:fee};
 return {p,setupBefore,sim,conservativeDebit,fee,simulationAddresses};
}
/** Refresh and re-simulate an unsigned review without requesting a wallet. */
export async function refreshPreparedReview<T extends PreparedOperation>(reviewed:T):Promise<T>{
 if(!['platform','launch'].includes(reviewed.operationKind||''))throw Error('This operation requires a new quote.');
 const attempt=createSigningAttempt(reviewed),connection=rpc(reviewed.network);
 const {p}=await preflightOperation(reviewed,connection,attempt);
 const next={...reviewed,...p} as T,mint=launchMintSigners.get(reviewed);
 if(mint)launchMintSigners.set(next,mint);
 return next;
}
export async function signAndSend(reviewed:PreparedOperation,wallet:Wallet,onSignature:(s:string)=>void,onProgress?:(attempt:SigningAttempt)=>void):Promise<string>{
 const attempt=createSigningAttempt(reviewed,onProgress);
 try{
 if(reviewed.operationKind==='launch')assertTokenCreationEnabled();
 if(reviewed.operationKind==='platform')(await import('./platform-setup.mjs')).assertSetupSigningEnabled(reviewed.setupStep);
 if(wallet.publicKey?.toBase58()!==reviewed.owner)throw Error('Wallet changed. Prepare again.');
 const connection=rpc(reviewed.network,attempt.get().id);
 const {p,setupBefore,sim,conservativeDebit,fee,simulationAddresses}=await preflightOperation(reviewed,connection,attempt);
 const refreshable=p.operationKind==='platform'||p.operationKind==='launch';
 if(wallet.publicKey?.toBase58()!==p.owner)throw Error('Wallet changed. Prepare again.');
 const original=decodeReviewedTransaction(p.transaction);
 if(!refreshable)assertReviewFresh(p);
 attempt.update('wallet_requested',{simulationSlot:sim.context?.slot,simulationUnits:sim.value.unitsConsumed,measuredDebitLamports:conservativeDebit,networkFeeLamports:fee});
 let signed:VersionedTransaction;
 if(p.operationKind==='launch'){
  const mint=launchMintSigners.get(reviewed);
  if(!mint)throw Error('Mint signer is no longer available. Prepare a fresh launch.');
  const {signWalletFirst}=await import('./wallet-signing.mjs');
  signed=await signWalletFirst({transaction:p.transaction,wallet,owner:p.owner,additionalSignerPublicKeys:[mint.publicKey],cosign:(t:VersionedTransaction)=>t.sign([mint])});
 }else signed=await wallet.signTransaction(p.transaction);
 attempt.update('wallet_returned',{walletReturned:true,walletWaitMs:Date.now()-attempt.get().events.find((e:{stage:string})=>e.stage==='wallet_requested')!.at});
 const decodedDiff=inspectWalletTransaction(original,signed);
 attempt.update('post_sign_checks',{decodedDiff});
 if(!decodedDiff.valid)throw Error(`Wallet returned a different transaction outside the approved structure. ${decodedDiff.reasons.join(' ')} Nothing was sent.`);
 if(wallet.publicKey?.toBase58()!==p.owner)throw Error("Wallet changed during signing.");
 if(!refreshable)assertReviewFresh(p,true);
 const currentHeight=await connection.getBlockHeight('confirmed');
 attempt.update('post_sign_checks',{currentBlockHeight:currentHeight});
 assertBlockhashWindow(p.lastValidBlockHeight,currentHeight,true);
 if(!refreshable)assertReviewFresh(p,true);
 attempt.update('post_sign_simulation');
 const returnedFee=(await connection.getFeeForMessage(signed.message,'confirmed')).value;
 if(returnedFee==null)throw Error('Returned transaction fee is unavailable.');
 const sendBalance=await connection.getBalance(new PublicKey(p.owner),'confirmed');
 const setupKeys=p.operationKind==='platform'?(await import('./platform-setup.mjs')).setupAccounts():[];
 // An instruction cannot write an account absent from its message. Request every
 // setup account included by the wallet, then overlay those results on the coherent snapshot.
 const returnedSetupIndices=setupKeys.flatMap((key:PublicKey,index:number)=>signed.message.staticAccountKeys.some(k=>k.equals(key))?[index]:[]);
 const returnedAddresses=p.operationKind==='platform'?[p.owner,...returnedSetupIndices.map(i=>setupKeys[i].toBase58())]:simulationAddresses;
 const finalSim=await connection.simulateTransaction(signed,{sigVerify:true,commitment:'confirmed',accounts:{encoding:'base64',addresses:returnedAddresses}});
 attempt.update('post_sign_simulation',{postSignSimulationSlot:finalSim.context?.slot,postSignSimulationError:finalSim.value.err,postSignSimulationUnits:finalSim.value.unitsConsumed,postSignSimulationLogs:(finalSim.value.logs||[]).slice(-25)});
 if(finalSim.value.err)throw Error(`NO-GO: post-sign simulation failed. ${JSON.stringify(finalSim.value.err)}`);
 const sendAfter=finalSim.value.accounts?.[0]?.lamports;
 if(sendAfter==null)throw Error('NO-GO: post-sign simulation cost unavailable.');
 const sendDebit=Math.max(0,sendBalance-sendAfter);
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
  if(p.setupStep==='1a'&&!returnedAccounts.every((account,i)=>sameSimulatedAccount(account,returnedSetupIndices[i]===0?sim.value.accounts?.[1]:setupBefore![returnedSetupIndices[i]])))throw Error('NO-GO: returned transaction changed simulated rule, allowlist or configuration accounts.');
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
