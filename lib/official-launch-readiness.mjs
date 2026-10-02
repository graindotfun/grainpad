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
 unavoidableGap:'The GRAIN/wXMR pool can be discovered and traded as soon as the launch transaction is included. That wait is chain confirmation, not an install. Registration, the token page and the first burn follow it. They are not one transaction and must not be described as atomic. Deployment, migration, operator setup, funding and monitoring are staged before the signature so they are not part of this gap.',
});
/** Installation that has to be finished before the signature. None of it is a post-creation deploy. */
export const OFFICIAL_PRELAUNCH_STAGING=Object.freeze([
 Object.freeze({id:'deploy',status:'not-done',waitClass:'installation',detail:'Deploy this candidate and apply migration 0027 before any official signature. The blockhash-review table has to exist first.'}),
 Object.freeze({id:'operator',status:'not-verified',waitClass:'installation',detail:'Install the operator with the pinned mint, a persistent journal, pause and bounded spending. It watches the derived GRAIN/wXMR pool before the account exists. No second deploy teaches it the mint.'}),
 Object.freeze({id:'funding',status:'not-verified',waitClass:'installation',detail:'Fund the collector float and the admin wallet inside the separate official-launch cap before signing.'}),
 Object.freeze({id:'monitoring',status:'not-verified',waitClass:'installation',detail:'Arm alerts for inclusion, registration, the pinned pool and the burn before the pool exists.'}),
]);
/** Post-creation deploys that the staging above removes. The burn and public-admission commits stay. */
export const OFFICIAL_POSTCREATION_ELIMINATED=Object.freeze([
 'A deploy or config change whose only job is to tell the operator the mint it was already pinned to watch.',
 'A deploy to publish the token page. Registration writes the existing index, and the page is the next read.',
 'Applying the launch-review migration after the pool exists. It is applied before the signature.',
]);
/** What remains after those deploys are moved. These are not installation delays. */
export const OFFICIAL_REMAINING_GAPS=Object.freeze([
 'From inclusion until finality the pool can be traded, including with wXMR, while the token page is not registered yet. That is a chain-confirmation gap.',
 'SOL buy and sell can be built from the pinned SOL/wXMR CLMM pool and the verified LaunchLab or CPMM pool without a Jupiter quote, once a Grainpad-controlled lookup table exists. The third-party table is refused. Jupiter remains when that builder cannot read the pool. Trading wXMR on the verified pool is not SOL trading from launch. SOL_TRADING_ENABLED stays off. No Grainpad pool has graduated, so the CPMM hop was not live-simulated. An earlier GRAINU curve simulation used the refused table and is not this route.',
 'The first official-token burn still has to finalize after the pool exists. GRAINU evidence cannot fill grainBuybackBurnFinalized.',
 'activation-review, REWARDS_OPERATIONAL and TOKEN_CREATION_ENABLED stay separate commits after that burn. The launch does not turn them on.',
]);
/** Every action after inclusion, with the wait that applies and what to do when it fails. */
export const OFFICIAL_LAUNCH_CUTOVER=Object.freeze([
 Object.freeze({id:'C1',waitClass:'chain-confirmation',action:'Watch the submitted signature until Solana reports it finalized, then register that exact mint, creator and metadata hash. The indexer repeats that registration without an owner click.',after:'inclusion',latency:'Wait for finalized status. Rooting is on the order of 32 slots, about 13 seconds. Registration is one server request after that status, not after processed or confirmed. This is not a deploy.',failure:'Pending, processed, confirmed or a timeout keeps the reservation. A finalized error can be replaced only after the failed transaction is found, the mint account is absent, and a finalized height is past the server-reviewed expiry. If registration fails after the reservation is marked registered, retry registration only. The scheduled indexer does that retry.'}),
 Object.freeze({id:'C2',waitClass:'runtime',action:'The token page appears from that registration. The operator, already watching the pinned pool, sees the account on its next read.',after:'registration and the pool account',latency:'The page is the next index read. The operator cycle is the next configured interval. Explorers can show the pool earlier. No process is installed at this step.',failure:'A missing page is a registration retry. It is not another launch submission. An operator that cannot see the pool yet waits for the next read and does not submit.'}),
 Object.freeze({id:'C3',waitClass:'chain-confirmation',action:'Run the first buy-and-burn only when the official mint and rewards policy are approved, the reserved wXMR covers the conversion minimum, and the official pool is readable. Evidence is a successful finalized transaction that burns the pinned official mint. A class label or a signature string is not that evidence.',after:'a funded burn plan and a readable pool',latency:'The operator may attempt the burn on a later cycle only after planFirstOfficialBurn reports funded. A reserve below the threshold is underfunded and is not described as the next cycle. This is not inside the launch transaction.',failure:'Do not promise a burn the reserve cannot pay. GRAINU rehearsal evidence, including its conversion cap, cannot fill this gate. Public admission stays closed until this burn is finalized.'}),
 Object.freeze({id:'C4',waitClass:'policy-commit',action:'Only after that burn, and after the other release gates, consider activation-review and the creation unlock.',after:'finalized official-token burn and the remaining release evidence',latency:'Separate flag-only commits and a separate owner signature. These commits are not removed. They are not the launch transaction and they are not an emergency deploy.',failure:'Do not open public admission to paper over a missing burn. The launch reservation is not a deferral of grainBuybackBurnFinalized.'}),
 Object.freeze({id:'C5',waitClass:'runtime',action:'Replace an expired attempt, or a finalized failure whose transaction is present and whose mint is absent, only after a finalized height is past the server-reviewed expiry. Submit that same signed replacement through the relay.',after:'a finalized block height above the server-reviewed lastValidBlockHeight',latency:'A new server blockhash review, a browser co-signature only if signing is enabled, then one relay submission of those exact bytes. The renewal request itself does not submit.',failure:'Renewal is refused while the mint exists, the failed transaction is not found, the height is not past expiry, or the status is pending, processed, confirmed or timed out. The previous attempt stays in history. Identity cannot change. A locked gate does not submit.'}),
 Object.freeze({id:'C6',waitClass:'runtime',action:'Publish the official contract address through the owner publish-ca path and verify that same mint. Retrying the same mint is idempotent.',after:'finalized registration',latency:'One owner request after verification passes. A repeat of the same mint returns the stored page. This is not another launch.',failure:'A different mint is refused. A failed verification leaves the contract address unpublished. Retry the same mint after the check passes; do not replace a published mint from this step.'}),
]);
/** Transferable checks that must be finished on GRAINU, or on fixtures, before any official signature. None are marked done here. */
export const OFFICIAL_PRELAUNCH_CHECKS=Object.freeze([
 Object.freeze({id:'grainu-trading',status:'not-recorded',detail:'GRAINU is registered. Buy, sell, curve and graduated trading evidence is not in the repository. Record steps 3, 4, 19 and 20 before signing.'}),
 Object.freeze({id:'grainu-rewards',status:'not-recorded',detail:'Collection, wXMR conversion, snapshot, payout, duplicate rejection and restart recovery are GRAINU steps 5–14. No evidence file is recorded.'}),
 Object.freeze({id:'grainu-burn-reserve',status:'not-recorded',detail:'Step 22 can show the reserved share. It cannot be the official burn. grainBuybackBurnFinalized stays unsatisfied.'}),
 Object.freeze({id:'operator',status:'not-verified',detail:'Before any signature, check-config.mjs --live must print configurationReady:true with the pinned mint, and check-operational.mjs (RPC, funding, journal, publication, heartbeat, service) must report no blockers with the operator already watching that pool.'}),
 Object.freeze({id:'funding',status:'not-verified',detail:'Before any signature, fund the collector float and the admin SOL for the separate official-launch cap.'}),
 Object.freeze({id:'monitoring',status:'not-verified',detail:'Before any signature, arm launch, registration, pool and burn alerts. They are not verified against production in this review.'}),
 Object.freeze({id:'token-page',status:'blocked-on-mint',detail:'The official token page needs the approved mint. The page path for a registered Grainpad mint already exists; this mint is not pinned.'}),
 Object.freeze({id:'sol-wxmr',status:'blocked-on-lookup',detail:'The direct route refuses the third-party lookup table. A Grainpad table requires an owner signature before official-token creation and is not created here. No Grainpad pool has graduated, so the CPMM hop was not live-simulated. SOL_TRADING_ENABLED stays off. This is not an official-launch acceptance.'}),
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
export {officialBurnEvidenceError} from './official-burn-evidence.mjs';
