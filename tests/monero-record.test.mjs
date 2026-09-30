import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import nacl from 'tweetnacl';
import {advance,confirmationsFor,emptyIndex,extraFromDaemonTransaction,observeTransaction,readDaemon} from '../lib/monero-index.mjs';
import {BROADCAST_LOCKED,broadcastPublication,publicationProposal} from '../lib/monero-publish.mjs';
import {CONFIRMATIONS_REQUIRED,DOMAIN,FEE_CAP_PICONERO,LAYOUT,MAGIC,RECORD_BYTES,decodeExtraField,decodeRecord,encodeExtraField,encodeNonce,encodeRecord,signRecord,verifyRecord} from '../lib/monero-record.mjs';

const key=nacl.sign.keyPair();
const mint=Buffer.alloc(32,1),hash=Buffer.alloc(32,2),nonce=Buffer.alloc(16,3);
const fields={mint,metadataHash:hash,creator:Buffer.from(key.publicKey),nonce};
const tx=(n)=>(n.toString(16).padStart(64,'0'));
function packed(){return signRecord(fields,key.secretKey);}
function extraOf(record){return Buffer.concat([Buffer.from([0x01]),Buffer.alloc(32,9),encodeExtraField(record)]);}

test('encode then decode then verify one packed record',()=>{
  const record=packed();
  assert.equal(record.length,RECORD_BYTES);
  assert.equal(record.subarray(0,4).toString(),'GRN1');
  assert.deepEqual(verifyRecord(record).mint,mint);
  const extra=extraOf(record);
  assert.equal(decodeExtraField(extra).length,1);
  assert.deepEqual(decodeRecord(decodeExtraField(extra)[0]).metadataHash,hash);
  const proposal=publicationProposal({record:{...fields,signature:record.subarray(LAYOUT.signature,LAYOUT.nonce)}});
  assert.equal(proposal.broadcast,false);
  assert.equal(proposal.recordBytes,185);
  assert.ok(proposal.extraBytes<255+3);
  assert.equal(proposal.feeCapPiconero,FEE_CAP_PICONERO.toString());
});
test('malformed magic, checksum, version, flags and truncated records fail',()=>{
  const record=packed();
  const bad=Buffer.from(record);bad[0]=0;
  assert.throws(()=>decodeRecord(bad),/magic/);
  const sum=Buffer.from(record);sum[LAYOUT.checksum]=sum[LAYOUT.checksum]^0xff;
  assert.throws(()=>decodeRecord(sum),/checksum/);
  const version=Buffer.from(record);version[LAYOUT.version]=9;
  assert.throws(()=>decodeRecord(version),/checksum|version/);
  assert.throws(()=>encodeRecord({...fields,version:1,flags:1,signature:record.subarray(LAYOUT.signature,LAYOUT.nonce)}),/flags/);
  assert.throws(()=>decodeRecord(record.subarray(0,10)),/185/);
});
test('a bad signature, the wrong mint and the wrong metadata hash are rejected',()=>{
  const record=packed();
  const bad=Buffer.from(record);bad[LAYOUT.signature]=bad[LAYOUT.signature]^0xff;bad[LAYOUT.checksum]=0;bad[LAYOUT.checksum+1]=0;
  // checksum no longer matches, which is the first failure. A checksum-valid wrong signature is built below.
  assert.throws(()=>verifyRecord(bad),/checksum|signature/);
  const other=nacl.sign.keyPair();
  const forged=signRecord({...fields,creator:Buffer.from(other.publicKey)},other.secretKey);
  const index=emptyIndex();
  const wrongMint=observeTransaction(index,{txHash:tx(1),extra:extraOf(forged),inBlock:true,height:1,chainHeight:20,expectedMint:Buffer.alloc(32,9)});
  assert.equal(wrongMint.status,'rejected');
  const wrongHash=observeTransaction(index,{txHash:tx(2),extra:extraOf(forged),inBlock:true,height:1,chainHeight:20,expectedMint:forged.subarray(LAYOUT.mint,LAYOUT.hash),expectedHash:Buffer.alloc(32,9)});
  assert.equal(wrongHash.status,'rejected');
  const flipped=signRecord(fields,key.secretKey);
  flipped[LAYOUT.signature]^=0xff;
  createHash('sha256').update(flipped.subarray(0,LAYOUT.checksum)).digest().copy(flipped,LAYOUT.checksum,0,2);
  assert.throws(()=>verifyRecord(flipped),/signature/);
});
test('duplicates, nine confirmations and an oversized nonce are rejected',async()=>{
  const record=packed();
  const index=emptyIndex();
  const first=observeTransaction(index,{txHash:tx(3),extra:extraOf(record),inBlock:true,height:100,chainHeight:109,expectedMint:mint,expectedHash:hash,expectedCreator:fields.creator});
  assert.equal(first.status,'pending');
  assert.equal(first.confirmations,9);
  assert.equal(CONFIRMATIONS_REQUIRED,10);
  assert.equal(confirmationsFor(100,109),9);
  const again=observeTransaction(index,{txHash:tx(4),extra:extraOf(record),inBlock:true,height:100,chainHeight:120});
  assert.equal(again.status,'duplicate');
  const same=observeTransaction(index,{txHash:tx(3),extra:extraOf(record),inBlock:true,height:100,chainHeight:120});
  assert.equal(same.status,'duplicate');
  assert.equal(advance(index,tx(3),100,110).status,'verified');
  assert.throws(()=>encodeNonce(Buffer.alloc(255)),/255/);
  assert.equal(DOMAIN[0],103);
  assert.ok(!MAGIC.equals(Buffer.from('XMR2')));
});
test('the publisher cannot relay, even with an approval object',()=>{
  const record=packed();
  const proposal=publicationProposal({record:{...fields,signature:record.subarray(LAYOUT.signature,LAYOUT.nonce)},feeAddress:null,feePiconero:1n});
  assert.equal(BROADCAST_LOCKED,true);
  assert.throws(()=>broadcastPublication(proposal,{phrase:'APPROVE GRAINPAD MONERO RECORD',approver:'omer',recordSha256:proposal.recordSha256,extraHex:proposal.extraHex,feeAddress:null}),/locked/);
  assert.throws(()=>publicationProposal({record:{...fields,signature:record.subarray(LAYOUT.signature,LAYOUT.nonce)},feePiconero:FEE_CAP_PICONERO+1n}),/cap/);
});
test('the daemon client refuses wallet methods and reads extra from daemon json',async()=>{
  await assert.rejects(readDaemon('http://127.0.0.1:1','transfer',{}),/read-only/);
  const record=packed();
  const extra=extraOf(record).toString('hex');
  const parsed=extraFromDaemonTransaction({as_json:JSON.stringify({extra})});
  assert.equal(decodeExtraField(parsed).length,1);
});
