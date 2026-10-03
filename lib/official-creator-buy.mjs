/** Owner-approved separate creator buy; this is navigation, never a transaction builder. */
import {OFFICIAL_LAUNCH_PINS} from './official-launch-policy.mjs';
import {PLATFORM_SETTINGS} from './platform-settings.mjs';
export const OFFICIAL_CREATOR_BUY=Object.freeze({inputSol:'1',inputLamports:1000000000,maximumDebitSol:'1.003',maximumDebitLamports:1003000000});
export function officialCreatorBuyCutover({owner,publishedMint}={}){
 const ready=owner===PLATFORM_SETTINGS.admin&&publishedMint===OFFICIAL_LAUNCH_PINS.mint&&!!publishedMint;
 return {...OFFICIAL_CREATOR_BUY,ready,href:ready?`/token/${OFFICIAL_LAUNCH_PINS.mint}`:null};
}
