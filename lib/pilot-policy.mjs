/** Browser-safe pilot approval policy. No SDK, wallet, transaction or network imports. */
// One owner-approved admin GRAINU creation only. Public activation remains closed.
// The mint key stays in the signing browser; preview keys remain non-executable.
export const PILOT_MAX_COST_LAMPORTS=10_000_000;
export function assertPilotCost(debit){
 if(!Number.isSafeInteger(debit)||debit<0||debit>PILOT_MAX_COST_LAMPORTS)throw Error('Pilot cost exceeds the approved 0.010 SOL cap or could not be verified. Nothing was sent.');
}
export const PILOT_SIGNING_ENABLED=true;
export function assertPilotSigningEnabled(){if(!PILOT_SIGNING_ENABLED)throw Error('Pilot signing is locked pending a separate owner decision.');}
/** The one pilot the relay and page accept: symbol and tax rate are pinned; one launch only.
 * Omer approves these values in the same flag-only commit that sets PILOT_SIGNING_ENABLED. */
export const PILOT_APPROVED=Object.freeze({symbol:'GRAINU',taxBps:Object.freeze([100]),launches:1});
export function assertApprovedPilot({symbol,taxBps}){
 if(symbol!==PILOT_APPROVED.symbol)throw Error(`Only the approved ${PILOT_APPROVED.symbol} pilot can be launched here.`);
 if(!PILOT_APPROVED.taxBps.includes(taxBps))throw Error(`The pilot tax must be the approved ${PILOT_APPROVED.taxBps.map(b=>(b/100).toFixed(1)+'%').join(' or ')}.`);
}
