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
 Object.freeze({id:'deploy',status:'recorded',waitClass:'installation',detail:'The launch-review migrations and reviewed application were deployed. Before signing, verify that /api/version matches the reviewed main commit. The recorded deployment is not a live readiness check.'}),
 Object.freeze({id:'operator',status:'live-check-required',waitClass:'installation',detail:'The bounded operator is installed and running with owner approval, the pinned GRAIN mint and its original persistent journal. Verify a fresh prelaunch-live report before signing; a running service alone does not prove progress.'}),
 Object.freeze({id:'funding',status:'funded-recheck-required',waitClass:'installation',detail:'Collector and admin funding were verified. Daily cost reservations can still stop work; recheck available operating allowance and the separate 0.012 SOL creation and 1.25 SOL creator-buy caps before signing.'}),
 Object.freeze({id:'monitoring',status:'partially-verified',waitClass:'installation',detail:'Supervisor, heartbeat and local checks are installed. External alert delivery and recurring off-host backups have not been verified. Local logs do not establish notification delivery.'}),
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
 'SOL buy and sell are enabled in production after protected-RPC unsigned buy/sell simulations using the verified Grainpad lookup table GdrHQNhwy7veVC9evQ6YtSwrrjjkqKuHtaV4mfE1X7je passed on 2026-10-03. The builder uses the pinned SOL/wXMR CLMM pool and verified token pool without waiting for Jupiter indexing. The third-party table remains refused. Trading wXMR on the verified pool is not SOL trading from launch. Local real-program route rehearsals cover curve and CPMM; no migrated Grainpad mainnet CPMM pool exists, so graduated mainnet execution and full official-launch acceptance are not established by those proofs.',
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
 Object.freeze({id:'C6',waitClass:'runtime',action:'Automatically publish the pinned official contract address after finalized registration and full official verification. The owner confirmation and scheduled retry use the same idempotent publication path.',after:'finalized registration',latency:'No second owner signature. The pending header checks every 30 seconds while visible and on return to the page; it stops after the published address is verified. This is not another launch.',failure:'A different mint is refused. A failed verification leaves the contract address unpublished. Retry the same mint after the check passes; do not replace a published mint from this step.'}),
]);
/** Recorded observations and remaining checks. These do not authorize signing or replace a fresh live report. */
export const OFFICIAL_PRELAUNCH_CHECKS=Object.freeze([
 Object.freeze({id:'grainu-trading',status:'partial-evidence',detail:'GRAINU live unsigned curve buy and sell simulations and local real-program curve/CPMM rehearsals are recorded. No graduated Grainpad mainnet pool exists. Local execution is not a mainnet graduated trade or a physical-wallet rehearsal.'}),
 Object.freeze({id:'grainu-rewards',status:'finalized-receipts-recorded',detail:'Finalized GRAINU conversion, holder payout and platform payment records are published in the rewards receipt feed. That feed is the current transaction record; this page does not freeze a receipt count or imply that every queued payment has completed. Local recovery tests remain separate, and the complete release-bound rehearsal package remains incomplete.'}),
 Object.freeze({id:'grainu-burn-reserve',status:'reserved-awaiting-official-pool',detail:'The approved 15% GRAIN allocation is reserved in the durable journal. It waits for the official pool and sufficient operating allowance. A reserve is not a burn; grainBuybackBurnFinalized stays unsatisfied until a real official-token burn finalizes.'}),
 Object.freeze({id:'operator',status:'live-check-required',detail:'Before signing, check-config.mjs --live must report configurationReady:true, and check-operational.mjs --prelaunch-live must report prelaunchReady:true without blockers or alerts. Only the absent pinned official mint may be deferred; this report does not enable public creation or authorize signing.'}),
 Object.freeze({id:'funding',status:'funded-recheck-required',detail:'Funding was verified on 2026-10-03. The operator daily ceiling remains 0.025 SOL, including conservative unresolved cost reservations. A queued operation must wait when its reviewed maximum does not fit. A new UTC budget window does not reconcile outstanding attempts or establish profitability. Reviewed actual-cost reconciliation support is separate from its installation and verified operation on the server; this page does not attest either. Recheck the live journal, settled costs and available allowance before signing.'}),
 Object.freeze({id:'monitoring',status:'partially-verified',detail:'The server has a supervisor, fresh heartbeats and local checks. External alert delivery and recurring off-host backups remain unverified; see the server readiness report for the current limits.'}),
 Object.freeze({id:'token-page',status:'awaiting-finalized-creation',detail:'The approved Db91 mint and metadata URI/hash are pinned. The metadata publication was independently verified. The token page and official contract publication still require finalized creation and registration.'}),
 Object.freeze({id:'sol-wxmr',status:'curve-live-verified',detail:'The Grainpad table GdrHQNhwy7veVC9evQ6YtSwrrjjkqKuHtaV4mfE1X7je exists and is pinned. Protected-RPC unsigned curve buy and sell simulations passed and production SOL trading is enabled. Local real-program CPMM rehearsals also passed; a graduated Grainpad mainnet pool has not been live-simulated. These proofs do not waive the remaining operator, official mint or finalized first-burn gates and are not full official-launch acceptance.'}),
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
