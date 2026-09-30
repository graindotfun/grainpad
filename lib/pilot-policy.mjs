/** Browser-safe pilot approval policy. No SDK, wallet, transaction or network imports. */
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
