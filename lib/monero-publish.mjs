/** Build a mainnet publication proposal. This module has no relay call. */
import {createHash} from 'node:crypto';
import {FEE_CAP_PICONERO,RECORD_BYTES,VERSION,encodeExtraField,encodeRecord} from './monero-record.mjs';
import {readDaemon} from './monero-index.mjs';

export const BROADCAST_LOCKED=true;
export const APPROVAL_PHRASE='APPROVE GRAINPAD MONERO RECORD';

export function publicationProposal({record,feeAddress=null,feePiconero=null}){
  const packed=Buffer.isBuffer(record)&&record.length===RECORD_BYTES?Buffer.from(record):encodeRecord({version:VERSION,flags:0,...record});
  const extra=encodeExtraField(packed);
  const fee=feePiconero===null||feePiconero===undefined?null:BigInt(feePiconero);
  if(fee!==null&&fee>FEE_CAP_PICONERO)throw Error('Estimated fee is above the hard cap.');
  return {record:packed,recordHex:packed.toString('hex'),extra,extraHex:extra.toString('hex'),recordBytes:packed.length,extraBytes:extra.length,feePiconero:fee===null?null:fee.toString(),feeCapPiconero:FEE_CAP_PICONERO.toString(),feeAddress,recordSha256:createHash('sha256').update(packed).digest('hex'),broadcast:false,notice:'No Monero transaction has been relayed. Broadcast stays locked until Omer approves this exact record and fee.'};
}
export async function quoteFee(rpcUrl){
  const result=await readDaemon(rpcUrl,'get_fee_estimate',{});
  const perByte=BigInt(result?.fee??result?.fees?.[0]??0);
  if(perByte<=0n)throw Error('Daemon did not return a fee estimate.');
  // A small publication is well under 3000 bytes. The cap is enforced separately.
  const estimate=perByte*3000n;
  if(estimate>FEE_CAP_PICONERO)throw Error('Estimated fee is above the hard cap.');
  return {feePiconero:estimate.toString(),perByte:perByte.toString(),assumedBytes:3000};
}
export function assertBroadcastAllowed(proposal,approval){
  if(BROADCAST_LOCKED)throw Error('Mainnet broadcast is locked. No transaction was relayed.');
  if(!approval||approval.phrase!==APPROVAL_PHRASE||approval.approver!=='omer')throw Error('Omer has not approved this broadcast.');
  if(approval.recordSha256!==proposal.recordSha256||approval.extraHex!==proposal.extraHex)throw Error('Approval does not match the serialized record.');
  if(!proposal.feeAddress||approval.feeAddress!==proposal.feeAddress)throw Error('The fee wallet does not match the dedicated Grainpad wallet.');
  if(BigInt(proposal.feePiconero)>FEE_CAP_PICONERO)throw Error('Estimated fee is above the hard cap.');
}
export function broadcastPublication(proposal,approval){
  assertBroadcastAllowed(proposal,approval);
  throw Error('Mainnet broadcast is locked. No transaction was relayed.');
}
