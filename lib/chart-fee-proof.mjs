import {Buffer} from 'buffer';
import {PublicKey} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID,unpackMint,getTransferFeeConfig,getEpochFee,calculateFee,getTransferHook,getMintCloseAuthority} from '@solana/spl-token';
const proven=new WeakSet(),cache=new Map();
/** Transfer-fee updates activate two epochs later. The active fee cannot change inside its epoch; a retained activation stamp can also certify the previous normal epoch.
 * This display-only proof never grants a financial parser or signer an inferred balance. */
export async function readChartFeeProof(rpc,mint,now=Date.now(),slot=null){
 const saved=cache.get(mint);if(saved&&saved.expiresAt>now&&(slot===null||(slot>=saved.firstSlot&&slot<=saved.lastSlot)))return saved;
 if(await rpc('getGenesisHash',[])!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('Chart fee proof requires mainnet.');
 const epoch=await rpc('getEpochInfo',[{commitment:'finalized'}]);
 if(!Number.isSafeInteger(epoch?.epoch)||!Number.isSafeInteger(epoch.absoluteSlot)||!Number.isSafeInteger(epoch.slotIndex)||!Number.isSafeInteger(epoch.slotsInEpoch)||epoch.epoch<0||epoch.absoluteSlot<epoch.slotIndex||epoch.slotIndex<0||epoch.slotIndex>=epoch.slotsInEpoch)throw Error('Epoch receipt unavailable.');
 const first=epoch.absoluteSlot-epoch.slotIndex,last=first+epoch.slotsInEpoch-1;
 const result=await rpc('getAccountInfo',[mint,{encoding:'base64',commitment:'finalized',minContextSlot:epoch.absoluteSlot}]);
 if(!result?.value||result.value.owner!==TOKEN_2022_PROGRAM_ID.toBase58()||!Number.isSafeInteger(result.context?.slot)||result.context.slot<epoch.absoluteSlot||result.context.slot>last||result.value.data?.[1]!=='base64')throw Error('Current-epoch mint receipt unavailable.');
 const decoded=unpackMint(new PublicKey(mint),{...result.value,owner:TOKEN_2022_PROGRAM_ID,data:Buffer.from(result.value.data[0],'base64')},TOKEN_2022_PROGRAM_ID),config=getTransferFeeConfig(decoded);
 if(!decoded.isInitialized||decoded.decimals!==6||!config||getTransferHook(decoded)||getMintCloseAuthority(decoded))throw Error('Unambiguous transfer-fee mint required.');
 const fee=getEpochFee(config,BigInt(epoch.epoch));
 // Token-2022 initializes both fee records at the current epoch and only schedules
 // replacements two epochs ahead. An active fee whose activation predates the
 // previous normal epoch is therefore exact there too. Never infer older regimes.
 // https://github.com/solana-program/token-2022/blob/main/program/src/extension/transfer_fee/processor.rs
 const previous=epoch.epoch>0&&first===epoch.epoch*epoch.slotsInEpoch&&BigInt(fee.epoch)<=BigInt(epoch.epoch-1);
 const proof=Object.freeze({mint,epoch:epoch.epoch,currentFirstSlot:first,firstSlot:previous?first-epoch.slotsInEpoch:first,lastSlot:last,contextSlot:result.context.slot,expiresAt:now+60000,fee:Object.freeze({...fee})});proven.add(proof);cache.set(mint,proof);return proof;
}
export function chartTransferFee(proof,tx,mint,amount,now=Date.now()){
 if(!proven.has(proof)||proof.mint!==mint||proof.expiresAt<=now||!Number.isSafeInteger(tx.slot)||tx.slot<proof.firstSlot||tx.slot>proof.lastSlot)throw Error('Exact retained-epoch chart fee proof required.');
 return calculateFee(proof.fee,amount);
}
