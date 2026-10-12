import test from 'node:test';
import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import {assemblePublicationExtra,inspectPublication,rpcTransferCannotSetExtra,WALLET_RPC_TRANSFER_ACCEPTS_ARBITRARY_EXTRA} from '../lib/monero-construct.mjs';
import {FEE_CAP_PICONERO,encodeExtraField,signRecord,verifyRecord} from '../lib/monero-record.mjs';
import {broadcastPublication,publicationProposal} from '../lib/monero-publish.mjs';

const key=nacl.sign.keyPair();
const mint=Buffer.alloc(32,4),hash=Buffer.alloc(32,5),nonce=Buffer.alloc(16,6);
const record=signRecord({mint,metadataHash:hash,creator:Buffer.from(key.publicKey),nonce},key.secretKey);
const pub=Buffer.alloc(32,8);
const feeAddress='fee-wallet-primary';
const extra=assemblePublicationExtra(pub,record);

test('stock wallet RPC cannot set the Grainpad extra',()=>{
  assert.equal(WALLET_RPC_TRANSFER_ACCEPTS_ARBITRARY_EXTRA,false);
  assert.match(rpcTransferCannotSetExtra().reason,/payment_id/);
});
test('a self-transfer with the exact extra decodes and cannot pay anyone else',()=>{
  const checked=inspectPublication({extra,inputs:[{address:feeAddress,amount:1000n}],outputs:[{address:feeAddress,amount:900n}],fee:100n,feeAddress,expectedExtra:extra});
  assert.equal(checked.relayable,false);
  assert.equal(checked.feePiconero,'100');
  assert.equal(checked.changePiconero,'900');
  assert.deepEqual(verifyRecord(record).mint,checked.record.mint);
  assert.equal(checked.outputs.length,1);
  assert.throws(()=>inspectPublication({extra,inputs:[{address:feeAddress,amount:1000n}],outputs:[{address:'other',amount:900n}],fee:100n,feeAddress}),/leaves the dedicated fee wallet/);
  assert.throws(()=>inspectPublication({extra,inputs:[{address:'other',amount:1000n}],outputs:[{address:feeAddress,amount:900n}],fee:100n,feeAddress}),/not from the dedicated fee wallet/);
  assert.throws(()=>inspectPublication({extra,inputs:[{address:feeAddress,amount:1000n}],outputs:[{address:feeAddress,amount:800n}],fee:100n,feeAddress}),/more than this transaction/);
  assert.throws(()=>inspectPublication({extra,inputs:[{address:feeAddress,amount:FEE_CAP_PICONERO+2n}],outputs:[{address:feeAddress,amount:1n}],fee:FEE_CAP_PICONERO+1n,feeAddress}),/hard cap/);
});
test('a payment id or a second extra field is rejected',()=>{
  const payment=Buffer.concat([Buffer.from([0x01]),pub,Buffer.from([0x02,0x09,0x01,0,0,0,0,0,0,0,0])]);
  assert.throws(()=>inspectPublication({extra:payment,inputs:[{address:feeAddress,amount:2n}],outputs:[{address:feeAddress,amount:1n}],fee:1n,feeAddress}),/payment id|Grainpad/);
  const foreign=Buffer.concat([extra,encodeExtraField(record)]);
  assert.throws(()=>inspectPublication({extra:foreign,inputs:[{address:feeAddress,amount:2n}],outputs:[{address:feeAddress,amount:1n}],fee:1n,feeAddress,expectedExtra:extra}),/exactly one|does not match/);
});
test('broadcast stays locked after construction checks',()=>{
  const proposal=publicationProposal({record,feeAddress,feePiconero:100n});
  assert.throws(()=>broadcastPublication(proposal,{phrase:'APPROVE GRAINPAD MONERO RECORD',approver:'omer',recordSha256:proposal.recordSha256,extraHex:proposal.extraHex,feeAddress}),/locked/);
});
