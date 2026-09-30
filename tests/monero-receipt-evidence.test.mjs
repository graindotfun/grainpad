import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import nacl from 'tweetnacl';
import {signRecord,LAYOUT} from '../lib/monero-record.mjs';
import {receiptMonero} from '../lib/monero-index.mjs';

const key=nacl.sign.keyPair();
const mint=Buffer.alloc(32,1),metadataHash=Buffer.alloc(32,2);
const record=signRecord({mint,metadataHash,creator:Buffer.from(key.publicKey),nonce:Buffer.alloc(16,3)},key.secretKey);
const expected={creatorHex:Buffer.from(key.publicKey).toString('hex'),mintHex:mint.toString('hex'),metadataHash:metadataHash.toString('hex')};
const row={observed_at:Date.now(),status:'verified',confirmations:10,tx_hash:'ab'.repeat(32),height:100,record:record.toString('hex')};

test('receipt verification requires the actual mint and metadata hash, not just a stored status',()=>{
 assert.equal(receiptMonero(row,expected).status,'verified');
 for(const binding of [null,{...expected,mintHex:'cc'.repeat(32)},{...expected,metadataHash:'dd'.repeat(32)}]){
  const receipt=receiptMonero(row,binding);
  assert.equal(receipt.status,'rejected');
  assert.doesNotMatch(receipt.notice,/Ten Monero confirmations\. The Monero record matches/);
 }
});

test('a stale verified row cannot claim verification below ten confirmations',()=>{
 for(const confirmations of [0,9,-1,9.9,Infinity,NaN]){
  const receipt=receiptMonero({...row,confirmations},expected);
  assert.equal(receipt.status,'pending');
  assert.doesNotMatch(receipt.notice,/Ten Monero confirmations\. The Monero record matches/);
 }
 assert.equal(receiptMonero({...row,status:'pending',confirmations:12},expected).status,'pending','Receipt rendering cannot promote an index row.');
});

test('a malformed or checksum-valid forged stored record never becomes a verified public receipt',()=>{
 const forged=Buffer.from(record);forged[LAYOUT.signature]^=1;
 createHash('sha256').update(forged.subarray(0,LAYOUT.checksum)).digest().copy(forged,LAYOUT.checksum,0,2);
 for(const value of [undefined,'00',forged.toString('hex')]){
  const receipt=receiptMonero({...row,record:value},expected);
  assert.equal(receipt.status,'rejected');
  assert.equal(receipt.matchesMint,false);
  assert.equal(receipt.matchesMetadataHash,false);
 }
 assert.equal(receiptMonero(null).status,'not-published');
});

 test('expired, future, missing observation and wrong creator cannot be verified (F05)',()=>{
 for(const observed_at of [undefined,0,Date.now()+60000,Date.now()-180000])assert.equal(receiptMonero({...row,observed_at},expected).status,'stale');
 assert.equal(receiptMonero(row,{...expected,creatorHex:'ff'.repeat(32)}).status,'rejected');
 assert.equal(receiptMonero({...row,status:'unavailable'},expected).status,'unavailable');
 assert.equal(receiptMonero({...row,status:'rejected'},expected).status,'rejected');
 assert.equal(receiptMonero({...row,tx_hash:'invalid'},expected).status,'rejected');
 });
