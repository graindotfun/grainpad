/** Owner-approved separate creator buy. No signature, send or slippage authorization. */
import {OFFICIAL_LAUNCH_PINS} from './official-launch-policy.mjs';
import {PLATFORM_SETTINGS} from './platform-settings.mjs';
export const OFFICIAL_CREATOR_BUY=Object.freeze({inputSol:'1.2',inputLamports:1200000000,maximumDebitSol:'1.25',maximumDebitLamports:1250000000,routeMaximumDebitSol:'1.203',routeMaximumDebitLamports:1203000000});
// Owner completed the purchase manually. This exact mint's shortcut is permanently retired.
// Preserve reservation/review evidence; ordinary independently reviewed trades are unchanged.
export const RETIRED_CREATOR_BUY_MINT='Db91fm8AxxfoFySAp6Jg3KVcfZHUTAR7bJDJb5WLMgrn';
export function assertCreatorBuyNotRetired(mint){if(mint===RETIRED_CREATOR_BUY_MINT)throw Error('Official creator-buy shortcut permanently retired: owner already bought manually.');}
export function officialCreatorBuyCutover({owner,publishedMint}={}){
 const ready=publishedMint!==RETIRED_CREATOR_BUY_MINT&&owner===PLATFORM_SETTINGS.admin&&publishedMint===OFFICIAL_LAUNCH_PINS.mint&&!!publishedMint;
 return {...OFFICIAL_CREATOR_BUY,ready,href:ready?`/token/${OFFICIAL_LAUNCH_PINS.mint}?creatorBuy=1`:null};
}
/** Narrows the shortcut; the standard signed SOL intent still enforces these exact values. */
export function assertOfficialCreatorBuyRequest(input,{publishedMint}={}){
 assertCreatorBuyNotRetired(input?.mint);
 if(!officialCreatorBuyCutover({owner:input?.owner,publishedMint}).ready||input?.mint!==OFFICIAL_LAUNCH_PINS.mint||input.side!=='buy'||input.amount!==String(OFFICIAL_CREATOR_BUY.inputLamports)||input.maxTotalDebitLamports!==OFFICIAL_CREATOR_BUY.routeMaximumDebitLamports)throw Error('Creator buy requires the admin, verified official mint, exact 1.2 SOL input and the existing guarded route debit limit.');
 return input;
}
