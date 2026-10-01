/** Pre-creation review for the official GRAIN launch. This is not a rehearsal and not an approval to sign.
 * Creating the pool is the public trading boundary: anyone can discover and trade it as soon as the
 * launch transaction is included. Signing stays disabled until the owner acknowledges this review
 * in a separate commit. This module never signs or submits. */
import {OFFICIAL_LAUNCH_SIGNING_ENABLED} from './official-launch-policy.mjs';
/** Stays false. The review below is what the owner receives; acknowledging it is a later, explicit commit. */
export const OFFICIAL_LAUNCH_READINESS_ACKNOWLEDGED=false;
export const OFFICIAL_LAUNCH_BOUNDARY=Object.freeze({
 rehearsal:false,
 publicTradingOnInclusion:true,
 atomicWithPublicActivation:false,
});
/** The launch transaction itself is one atomic chain action. Public activation is not part of it. */
export const OFFICIAL_LAUNCH_ATOMICITY=Object.freeze({
 atomicWithPublicActivation:false,
 launchTransactionAtomic:Object.freeze(['open the wXMR allowlist','initialize GRAIN against wXMR','close the wXMR allowlist']),
 notInThatTransaction:Object.freeze([
  'directory registration and the token page',
  'operator monitoring and the collector burn cycle',
  'the first official-token buy-and-burn',
  'REWARDS_OPERATIONAL',
  'activation-review (public wXMR admission)',
  'TOKEN_CREATION_ENABLED',
 ]),
 unavoidableGap:'The GRAIN/wXMR pool can be discovered and traded as soon as the launch transaction is included. Registration, the token page, monitoring, the first official burn, and public creation happen later. They are not one transaction and must not be described as atomic.',
});
/** Every action after inclusion, with the wait that applies and what to do when it fails. */
export const OFFICIAL_LAUNCH_CUTOVER=Object.freeze([
 Object.freeze({id:'C1',action:'Watch the submitted signature until Solana reports it finalized, then register that exact mint, creator and metadata hash.',after:'inclusion',latency:'Wait for finalized status. Rooting is on the order of 32 slots, about 13 seconds. Registration is one server request after that status, not after processed or confirmed.',failure:'Pending, processed, confirmed, a timeout, or a finalized error keeps the reservation. Do not build a replacement and do not submit again. If registration fails after the reservation is marked registered, retry registration only.'}),
 Object.freeze({id:'C2',action:'Confirm the token page and directory row for the new mint, and start the operator and monitoring against that mint.',after:'registration',latency:'The page is available on the next read after the index commit. Until then explorers and Raydium can already show the pool.',failure:'A missing page is a registration retry. It is not a reason to send the launch again. Monitoring that cannot see the pool waits for the next read; it does not submit.'}),
 Object.freeze({id:'C3',action:'Run the first buy-and-burn of this official mint from the reserved share, and keep its signature as official-token-burn evidence.',after:'the pool account is readable and the operator is funded',latency:'The next operator cycle after the pool is visible. This is not inside the launch transaction.',failure:'A failed or expired burn is an operator retry of the burn. GRAINU rehearsal evidence cannot fill this gate. Public admission stays closed until this burn is finalized.'}),
 Object.freeze({id:'C4',action:'Only after that burn, and after the other release gates, consider activation-review and the creation unlock.',after:'finalized official-token burn and the remaining release evidence',latency:'Separate flag-only commits and a separate owner signature. Not the launch transaction.',failure:'Do not open public admission to paper over a missing burn. The launch reservation is not a deferral of grainBuybackBurnFinalized.'}),
 Object.freeze({id:'C5',action:'If the launch blockhash expires with no mint account and no transaction, review a replacement. Do not treat expiry as a free retry while the signature is still uncertain.',after:'a finalized block height above the server-reviewed lastValidBlockHeight',latency:'A new server blockhash review, then a new signature only if signing is enabled. The old signature stays the reservation until that replacement is accepted.',failure:'Renewal is refused while the mint exists, the transaction is found, or the status is pending, processed, confirmed, timed out, or a finalized error. Identity cannot change. Nothing is submitted by the renewal review itself.'}),
]);
/** Transferable checks that must be finished on GRAINU, or on fixtures, before any official signature. None are marked done here. */
export const OFFICIAL_PRELAUNCH_CHECKS=Object.freeze([
 Object.freeze({id:'grainu-trading',status:'not-recorded',detail:'GRAINU is registered. Buy, sell, curve and graduated trading evidence is not in the repository. Record steps 3, 4, 19 and 20 before signing.'}),
 Object.freeze({id:'grainu-rewards',status:'not-recorded',detail:'Collection, wXMR conversion, snapshot, payout, duplicate rejection and restart recovery are GRAINU steps 5–14. No evidence file is recorded.'}),
 Object.freeze({id:'grainu-burn-reserve',status:'not-recorded',detail:'Step 22 can show the reserved share. It cannot be the official burn. grainBuybackBurnFinalized stays unsatisfied.'}),
 Object.freeze({id:'operator',status:'not-verified',detail:'check-config.mjs --live ready:true on the operator host is still an owner action.'}),
 Object.freeze({id:'funding',status:'not-verified',detail:'The collector operating float and the admin SOL for the separate official-launch cap are not verified here.'}),
 Object.freeze({id:'monitoring',status:'not-verified',detail:'Launch, registration, pool and burn alerts are not verified against production in this review.'}),
 Object.freeze({id:'token-page',status:'blocked-on-mint',detail:'The official token page needs the approved mint. The page path for a registered Grainpad mint already exists; this mint is not pinned.'}),
 Object.freeze({id:'sol-wxmr',status:'fixture-only',detail:'SOL and wXMR routes accept a confirmed registered Grainpad wXMR launch. That was checked with a constructed fixture. There is no captured quote for an official mint, because none is approved.'}),
]);
export function officialLaunchSigningGate({signingEnabled=OFFICIAL_LAUNCH_SIGNING_ENABLED,readinessAcknowledged=OFFICIAL_LAUNCH_READINESS_ACKNOWLEDGED}={}){
 if(!signingEnabled)return {allowed:false,reason:'Official GRAIN launch signing is locked. Nothing was signed or sent.'};
 if(readinessAcknowledged!==true)return {allowed:false,reason:'Official GRAIN creation is the public launch boundary. Signing stays locked until the owner readiness review is acknowledged. Nothing was signed or sent.'};
 return {allowed:true};
}
export function assertOfficialLaunchReadyToSign(){
 const gate=officialLaunchSigningGate();
 if(!gate.allowed)throw Error(gate.reason);
}
/** Evidence class for the release check. Rehearsal evidence is rejected. The check is not waived. */
export function officialBurnEvidenceError(evidence){
 if(evidence?.checks?.grainBuybackBurnFinalized!==true)return null;
 const burn=evidence?.officialBurn;
 if(burn?.class==='grainu-rehearsal'||burn?.class==='prelaunch-rehearsal'||burn?.rehearsal===true)return 'GRAINU rehearsal evidence cannot satisfy grainBuybackBurnFinalized. The first burn must be the official GRAIN token.';
 if(burn?.class!=='official-token-burn'||typeof burn.mint!=='string'||!burn.mint||typeof burn.signature!=='string'||!burn.signature)return 'grainBuybackBurnFinalized requires a finalized buy-and-burn of the official GRAIN mint. Rehearsal evidence does not count.';
 return null;
}
