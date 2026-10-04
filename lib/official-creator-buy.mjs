/** Owner-approved separate creator buy. No signature, send or slippage authorization. */
export const OFFICIAL_CREATOR_BUY=Object.freeze({inputSol:'1.2',inputLamports:1200000000,maximumDebitSol:'1.25',maximumDebitLamports:1250000000,routeMaximumDebitSol:'1.203',routeMaximumDebitLamports:1203000000});
// Owner completed the purchase manually. This exact mint's shortcut is permanently retired.
// Preserve reservation/review evidence; ordinary independently reviewed trades are unchanged.
export const RETIRED_CREATOR_BUY_MINT='Db91fm8AxxfoFySAp6Jg3KVcfZHUTAR7bJDJb5WLMgrn';
export function assertCreatorBuyNotRetired(){throw Error('Official creator-buy shortcut is permanently retired.');}
export function officialCreatorBuyCutover(){
 return {...OFFICIAL_CREATOR_BUY,ready:false,href:null};
}
/** The separate shortcut is permanently disabled for every mint. The atomic relaunch buy is a different transaction. */
export function assertOfficialCreatorBuyRequest(){
 throw Error('Official creator-buy shortcut is permanently retired.');
}
