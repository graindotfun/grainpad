/** The first official burn is a successful finalized buy-and-burn of the pinned mint.
 * A class label or a bare signature does not satisfy it. This module does not fetch or submit. */
import {Buffer} from 'buffer';
import {OFFICIAL_LAUNCH_PINS} from './official-launch-policy.mjs';
const LAUNCH='LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';
const CPMM='CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const GRAINU_REHEARSAL_MINT='FGrHB6tEqXNfMBXZ4xNoa6hKwjWCjjxwijeB5uKLvgrn';
function burnedAmount(tx,mint){
 let amount=0n;
 for(const ix of tx?.instructions??[]){
  if(![TOKEN,TOKEN_2022].includes(ix?.program))continue;
  const data=Buffer.from(ix.data??[]);
  if((data[0]!==8&&data[0]!==15)||data.length<9||ix.accounts?.[1]!==mint)continue;
  const value=data.readBigUInt64LE(1);if(value>0n)amount+=value;
 }
 return amount;
}
/** Returns an error string, or null when this evidence may satisfy the check. */
export function officialBurnEvidenceError(evidence,{pinnedMint=OFFICIAL_LAUNCH_PINS.mint}={}){
 if(evidence?.checks?.grainBuybackBurnFinalized!==true)return null;
 const burn=evidence?.officialBurn??{};
 if(burn.class==='grainu-rehearsal'||burn.class==='prelaunch-rehearsal'||burn.rehearsal===true||burn.mint===GRAINU_REHEARSAL_MINT)return 'GRAINU rehearsal evidence cannot satisfy grainBuybackBurnFinalized. The first burn must be the official GRAIN token.';
 if(typeof pinnedMint!=='string'||!pinnedMint||pinnedMint===GRAINU_REHEARSAL_MINT)return 'grainBuybackBurnFinalized requires the pinned official mint. A class label is not that pin.';
 if(burn.mint!==pinnedMint)return 'Burn evidence does not name the pinned official mint.';
 const tx=burn.finalizedTransaction;
 if(!tx||tx.confirmationStatus!=='finalized'||tx.err!=null||tx.meta?.err!=null||tx.signature!==burn.signature||typeof burn.signature!=='string'||burn.signature.length<8)return 'The burn requires a successful finalized transaction. A signature string is not enough.';
 const bought=(tx.instructions??[]).some(ix=>ix?.program===LAUNCH||ix?.program===CPMM);
 if(!bought||burnedAmount(tx,pinnedMint)<=0n)return 'The finalized transaction must buy and burn the pinned official mint.';
 return null;
}
