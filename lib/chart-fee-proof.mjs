import {Buffer} from 'buffer';
import {PublicKey} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID,unpackMint,getTransferFeeConfig,getEpochFee,calculateFee,getTransferHook,getMintCloseAuthority} from '@solana/spl-token';
const proven=new WeakSet(),cache=new Map();
/** Transfer-fee updates activate two epochs later. The active fee cannot change inside this epoch.
 * This display-only proof never grants a financial parser or signer an inferred balance. */
export async function readChartFeeProof(rpc,mint,now=Date.now()){
 const saved=cache.get(mint);if(saved&&saved.expiresAt>now)return saved;
 if(await rpc('getGenesisHash',[])!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('Chart fee proof requires mainnet.');
 const epoch=await rpc('getEpochInfo',[{commitment:'finalized'}]);
 if(!Number.isSafeInteger(epoch?.epoch)||!Number.isSafeInteger(epoch.absoluteSlot)||!Number.isSafeInteger(epoch.slotIndex)||!Number.isSafeInteger(epoch.slotsInEpoch)||epoch.epoch<0||epoch.absoluteSlot<epoch.slotIndex||epoch.slotIndex<0||epoch.slotIndex>=epoch.slotsInEpoch)throw Error('Epoch receipt unavailable.');
 const first=epoch.absoluteSlot-epoch.slotIndex,last=first+epoch.slotsInEpoch-1;
 const result=await rpc('getAccountInfo',[mint,{encoding:'base64',commitment:'finalized',minContextSlot:epoch.absoluteSlot}]);
 if(!result?.value||result.value.owner!==TOKEN_2022_PROGRAM_ID.toBase58()||!Number.isSafeInteger(result.context?.slot)||result.context.slot<epoch.absoluteSlot||result.context.slot>last||result.value.data?.[1]!=='base64')throw Error('Current-epoch mint receipt unavailable.');
 const decoded=unpackMint(new PublicKey(mint),{...result.value,owner:TOKEN_2022_PROGRAM_ID,data:Buffer.from(result.value.data[0],'base64')},TOKEN_2022_PROGRAM_ID),config=getTransferFeeConfig(decoded);
 if(!decoded.isInitialized||decoded.decimals!==6||!config||getTransferHook(decoded)||getMintCloseAuthority(decoded))throw Error('Unambiguous transfer-fee mint required.');
 const fee=getEpochFee(config,BigInt(epoch.epoch));
 const proof=Object.freeze({mint,epoch:epoch.epoch,firstSlot:first,lastSlot:last,contextSlot:result.context.slot,expiresAt:now+60000,fee:Object.freeze({...fee})});proven.add(proof);cache.set(mint,proof);return proof;
}
export function chartTransferFee(proof,tx,mint,amount,now=Date.now()){
 if(!proven.has(proof)||proof.mint!==mint||proof.expiresAt<=now||!Number.isSafeInteger(tx.slot)||tx.slot<proof.firstSlot||tx.slot>proof.lastSlot)throw Error('Exact current-epoch chart fee proof required.');
 return calculateFee(proof.fee,amount);
}
