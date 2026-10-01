/** Browser-safe official GRAIN launch policy. No SDK, wallet, transaction or network imports.
 * Signing stays disabled. Production pins stay unset until a separate owner approval.
 * This path does not inherit the GRAINU pilot spending approval or its 0.010 SOL ceiling. */
export const OFFICIAL_LAUNCH_SIGNING_ENABLED=false;
/** Recorded candidate only. Not a pin, not a confirmed mint, and not a request for its private key. */
export const OFFICIAL_MINT_CANDIDATE='Db91fm8AxxfoFySAp6Jg3KVcfZHUTAR7bJDJb5WLMgrn';
export const OFFICIAL_LAUNCH_PINS=Object.freeze({mint:null,taxBps:null,metadataHash:null,metadataUri:null,maximumDebitLamports:null});
const PIN_FIELDS=['mint','taxBps','metadataHash','metadataUri','maximumDebitLamports'];
export function missingOfficialLaunchPins(pins=OFFICIAL_LAUNCH_PINS){
 const missing=[];
 if(typeof pins?.mint!=='string'||!pins.mint)missing.push('mint');
 if(!Number.isSafeInteger(pins?.taxBps))missing.push('taxBps');
 if(typeof pins?.metadataHash!=='string'||!/^[a-f0-9]{64}$/.test(pins.metadataHash))missing.push('metadataHash');
 if(typeof pins?.metadataUri!=='string'||!pins.metadataUri)missing.push('metadataUri');
 if(!Number.isSafeInteger(pins?.maximumDebitLamports)||pins.maximumDebitLamports<1)missing.push('maximumDebitLamports');
 return PIN_FIELDS.filter(field=>missing.includes(field));
}
export function assertOfficialLaunchPins(pins=OFFICIAL_LAUNCH_PINS){
 const missing=missingOfficialLaunchPins(pins);
 if(missing.length)throw Error(`Official launch preparation is locked until these production values are approved: ${missing.join(', ')}.`);
}
export function assertOfficialLaunchSigningEnabled(){if(!OFFICIAL_LAUNCH_SIGNING_ENABLED)throw Error('Official GRAIN launch signing is locked. Nothing was signed or sent.');}
/** cap is the separately approved official-launch ceiling. Null is not the pilot cap. */
export function assertOfficialLaunchDebit(debit,cap){
 if(!Number.isSafeInteger(cap)||cap<1)throw Error('Official launch spending cap is not approved. The GRAINU pilot ceiling does not apply. Nothing was sent.');
 if(!Number.isSafeInteger(debit)||debit<0||debit>cap)throw Error('Official launch cost exceeds the approved spending cap or could not be verified. Nothing was sent.');
}
