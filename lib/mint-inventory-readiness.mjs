import {PublicKey} from '@solana/web3.js';
import {MINT_ALLOCATION_REVISION} from './mint-allocation-protocol.mjs';
/** A mutable stock check is a launch gate, never a claim that search capacity is unlimited. */
export function mintInventoryReadinessErrors(value,now){
 const errors=[];
 if(!value||value.revision!==MINT_ALLOCATION_REVISION||value.publicSuffix!=='grn'||value.officialSuffix!=='grain')errors.push('Review the exact encrypted public grn / official grain inventory revision.');
 if(!Number.isSafeInteger(value?.availableMintCount)||value.availableMintCount<1||value.serviceReady!==true)errors.push('At least one unused public grn mint and its configured live allocation service must be ready.');
 let official=false;try{official=typeof value?.officialMint==='string'&&value.officialMint.endsWith('grain')&&new PublicKey(value.officialMint).toBase58()===value.officialMint&&PublicKey.isOnCurve(new PublicKey(value.officialMint).toBytes());}catch{}
 if(!official||value?.officialMintUnused!==true)errors.push('Independently prepare the exact unused lowercase grain official mint.');
 const checkedAt=Date.parse(value?.checkedAt);if(!Number.isFinite(checkedAt)||checkedAt>now+10000||now-checkedAt>300000)errors.push('Recheck mutable inventory and service within five minutes of opening.');
 if(value?.creatorBindingVerified!==true||value?.neverReissuedVerified!==true||value?.encryptedDeliveryVerified!==true||value?.restartRecoveryVerified!==true)errors.push('Verify creator binding, encrypted delivery, permanent assignment and restart recovery.');
 if(typeof value?.evidence!=='string'||!value.evidence.trim())errors.push('Attach the actual independently reviewed inventory/official preparation evidence.');
 return errors;
}
