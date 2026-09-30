/** Restricted pilot review. Builds and inspects the single owner transaction that
 * opens wXMR admission, creates one pilot mint and closes admission again.
 * This module never loads a signer, requests a wallet or submits.
 */
import {Buffer} from 'buffer';
import {PublicKey,TransactionMessage,VersionedTransaction,ComputeBudgetProgram} from '@solana/web3.js';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import {PLATFORM_SETTINGS} from './platform-settings.mjs';
import {grainpadPlatformId} from './platform-policy.mjs';
import {buildRewardsLaunch,rewardsAddresses} from './rewards-launch.mjs';
import {readRewardsSetup,inspectRewardsSetup} from './rewards-setup-review.mjs';
import {setupAccounts} from './platform-setup.mjs';

// Building and reviewing is authorized. Requesting a signature or executing the
// pilot is not; that needs a separate owner decision and a reviewed code change.
// Preview reviews use a throwaway mint public key whose keypair is discarded, so
// they can never be executed. A future executable flow must generate the mint
// keypair in the signing client, keep it only in memory for that one
// transaction, co-sign with it, and re-verify the exact reviewed message; it must
// never send the mint secret to a server or reuse a preview key.
export const PILOT_SIGNING_ENABLED=false;
export function assertPilotSigningEnabled(){if(!PILOT_SIGNING_ENABLED)throw Error('Pilot signing is locked pending a separate owner decision.');}
/** The one pilot the relay and page accept: symbol and tax rate are pinned; one launch only.
 * Omer approves these values in the same flag-only commit that sets PILOT_SIGNING_ENABLED. */
export const PILOT_APPROVED=Object.freeze({symbol:'GRAINU',taxBps:Object.freeze([100]),launches:1});
export function assertApprovedPilot({symbol,taxBps}){
 if(symbol!==PILOT_APPROVED.symbol)throw Error(`Only the approved ${PILOT_APPROVED.symbol} pilot can be launched here.`);
 if(!PILOT_APPROVED.taxBps.includes(taxBps))throw Error(`The pilot tax must be the approved ${PILOT_APPROVED.taxBps.map(b=>(b/100).toFixed(1)+'%').join(' or ')}.`);
}

/** [open wXMR admission, launch pilot, close admission]. Admission never outlives this transaction. */
export function pilotInstructions({mint,draft,admin=new PublicKey(PLATFORM_SETTINGS.admin),platform=grainpadPlatformId()}){
 const a=rewardsAddresses(platform);
 const launch=buildRewardsLaunch({owner:admin,mint:new PublicKey(mint),platform,name:draft.name,symbol:draft.symbol,uri:draft.uri,taxBps:draft.taxBps});
 return {pool:launch.pool,allow:a.allow,instructions:[
  sdk.createPlatformAllowConfigIns(sdk.LAUNCHPAD_PROGRAM,admin,platform,a.config,a.allow),
  launch.instruction,
  sdk.closePlatformAllowConfigIns(sdk.LAUNCHPAD_PROGRAM,admin,platform,a.config,a.allow),
 ]};
}
export function compilePilot(instructions,blockhash,admin=new PublicKey(PLATFORM_SETTINGS.admin)){
 const transaction=new VersionedTransaction(new TransactionMessage({payerKey:admin,recentBlockhash:blockhash,instructions:[
  ComputeBudgetProgram.setComputeUnitLimit({units:200000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}),...instructions,
 ]}).compileToV0Message());
 // Exactly two signers: the admin (payer, creator, platform owner) and the new mint.
 if(transaction.message.header.numRequiredSignatures!==2||transaction.serialize().length>1232)throw Error('Pilot transaction exceeds its reviewed signer or packet limit.');
 return transaction;
}
const describe=(tx)=>({bytes:tx.serialize().length,signers:tx.message.staticAccountKeys.slice(0,tx.message.header.numRequiredSignatures).map(String),
 instructions:tx.message.compiledInstructions.map(ix=>String(tx.message.staticAccountKeys[ix.programIdIndex]))});

export function pilotPreconditions(snapshot){
 return [
  {check:'Rewards collector and wXMR rule configured on chain',passed:snapshot.currentCollector===snapshot.collector&&snapshot.rules.wXMR==='rewards'},
  {check:'SOL admission closed',passed:snapshot.admission.SOL===false},
  {check:'wXMR admission closed before the pilot',passed:snapshot.admission.wXMR===false},
  {check:'Pilot signing unlocked by owner decision',passed:PILOT_SIGNING_ENABLED},
 ];
}

/** JSON-safe setup facts the pilot depends on. */
export function pilotSetupSummary(snapshot){
 return {slot:snapshot.slot,platform:snapshot.platform,collector:snapshot.collector,currentCollector:snapshot.currentCollector,state:snapshot.state,
  admission:{SOL:!!snapshot.admission.SOL,wXMR:!!snapshot.admission.wXMR},rules:{SOL:snapshot.rules.SOL,wXMR:snapshot.rules.wXMR}};
}
/** One finalized read of the eight setup accounts, JSON-safe and independent of any
 * collector, so a server can cache it under one key. */
export async function readPilotSetupAccounts(connection){
 if(await connection.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('Mainnet is required for this review.');
 const {context,value}=await connection.getMultipleAccountsInfoAndContext(setupAccounts(),{commitment:'finalized'});
 if(!Number.isSafeInteger(context?.slot)||value.length!==8)throw Error('Incomplete setup snapshot.');
 return {slot:context.slot,accounts:value.map(a=>a?{owner:String(a.owner),lamports:a.lamports,executable:!!a.executable,data:Buffer.from(a.data).toString('base64')}:null)};
}
/** Classify a cached snapshot for one proposed collector without any RPC. */
export function pilotSummaryFromAccounts(snapshot,collector){
 const accounts=snapshot.accounts.map(a=>a?{owner:new PublicKey(a.owner),lamports:a.lamports,executable:a.executable,data:Buffer.from(a.data,'base64')}:null);
 return pilotSetupSummary({...inspectRewardsSetup(accounts,collector),slot:snapshot.slot});
}
/** Pure: no RPC. The draft-dependent part of the review. */
export function planPilotFromSummary(summary,{draft,mint}){
 const plan=pilotInstructions({mint,draft}),preview=compilePilot(plan.instructions,String(PublicKey.default));
 return {schemaVersion:1,network:'mainnet-beta',readOnly:true,signingAuthorized:PILOT_SIGNING_ENABLED,submissionAvailable:false,
  slot:summary.slot,platform:summary.platform,admin:PLATFORM_SETTINGS.admin,proposedCollector:summary.collector,collectorApproved:false,
  setupState:summary.state,ready:summary.state==='activation-review',preconditions:pilotPreconditions(summary),
  previewOnly:true,executable:false,
  previewMint:String(mint),pool:String(plan.pool),allowlist:String(plan.allow),transaction:describe(preview),
  notice:'Preview only, not executable. The mint address, pool and transaction are generated for review; no private key for the preview mint is kept, so this transaction can never be signed or sent. Signing is locked.'};
}
/** Read-only plan: uses only get* RPC calls, so it can run behind the server's read connection. */
export async function planPilot(connection,{collector,draft,mint,readSetup=readRewardsSetup}){
 return planPilotFromSummary(pilotSetupSummary(await readSetup(connection,collector)),{draft,mint});
}

/** Unsigned simulation (local CLI). Proves admission is absent after the transaction and the pool exists. */
export async function simulatePilot(connection,{collector,draft,mint,readSetup=readRewardsSetup}){
 const planned=await planPilot(connection,{collector,draft,mint,readSetup});
 if(!planned.ready)return {...planned,simulated:false,blockedBy:'Apply and finalize the reviewed rewards configuration with admission closed first.'};
 const plan=pilotInstructions({mint,draft}),admin=new PublicKey(PLATFORM_SETTINGS.admin);
 const latest=await connection.getLatestBlockhash({commitment:'confirmed',minContextSlot:planned.slot});
 const tx=compilePilot(plan.instructions,latest.blockhash);
 const before=await connection.getBalance(admin,{commitment:'confirmed',minContextSlot:planned.slot});
 const fee=await connection.getFeeForMessage(tx.message,'confirmed');
 const addresses=[String(admin),String(plan.allow),String(plan.pool)];
 const simulation=await connection.simulateTransaction(tx,{sigVerify:false,commitment:'confirmed',minContextSlot:planned.slot,accounts:{encoding:'base64',addresses}});
 if(simulation.value.err)throw Error('Unsigned pilot simulation failed. No transaction was sent.');
 const [payer,allow,pool]=simulation.value.accounts??[];
 const gone=a=>!a||(a.lamports===0&&(!a.data||Buffer.from(a.data[0]??'', 'base64').length===0));
 if(!gone(allow))throw Error('Simulation left wXMR admission open.');
 if(!pool||pool.owner!==String(sdk.LAUNCHPAD_PROGRAM))throw Error('Simulation did not create the pilot pool.');
 if(!Number.isSafeInteger(before)||!Number.isSafeInteger(payer?.lamports)||!Number.isSafeInteger(fee?.value))throw Error('Incomplete simulation or fee evidence.');
 return {...planned,simulated:true,blockhash:latest.blockhash,lastValidBlockHeight:latest.lastValidBlockHeight,
  simulation:{unitsConsumed:simulation.value.unitsConsumed??null,networkFeeLamports:fee.value,balanceBeforeLamports:before,balanceAfterLamports:payer.lamports,netDebitLamports:before-payer.lamports,admissionClosedAfter:true,poolCreated:true},
  unsignedBase64:Buffer.from(tx.serialize()).toString('base64')};
}
