import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import nacl from 'tweetnacl';
import {PublicKey} from '@solana/web3.js';
import {encodeRecord,decodeRecord,signRecord,verifyRecord,signedBytes,encodeExtraField,decodeExtraField,LAYOUT} from '../lib/monero-record.mjs';
import {canonicalCreatorMessage} from '../lib/monero-creator-message.mjs';
import {creatorAuthorizationTextV2} from '../lib/monero-creator-text-v2.mjs';
import {emptyIndex,observeTransaction,receiptMonero,readDaemon} from '../lib/monero-index.mjs';
import {synchronizedMainnetHeight,validatedTransactions,validatedBlock} from '../lib/monero-daemon-validation.mjs';
const key=nacl.sign.keyPair();
const fields=()=>({mint:Buffer.alloc(32,1),metadataHash:Buffer.alloc(32,2),creator:Buffer.from(key.publicKey),nonce:Buffer.alloc(16,3),flags:0});
const signed=version=>signRecord({...fields(),version},key.secretKey);
test('both GRN1 versions round-trip at exact protocol lengths',()=>{
 for(const version of [1,2]){const record=signed(version);assert.equal(record.length,185);assert.equal(encodeExtraField(record).length,189);assert.equal(verifyRecord(decodeExtraField(encodeExtraField(record))[0]).version,version);}
});
test('v2 creator review derives the same exact bytes and rejects server replacement',()=>{
 const f={...fields(),version:2},bytes=signedBytes(f),intent={mint:new PublicKey(f.mint).toBase58(),metadataHash:f.metadataHash.toString('hex'),creator:new PublicKey(f.creator).toBase58(),nonce:f.nonce.toString('hex'),creatorAuthorizationVersion:2,creatorAuthorizationFormat:'grainpad-utf8-text-v2',messageHex:bytes.toString('hex')};
 assert.equal(bytes.toString(),creatorAuthorizationTextV2(intent));
 assert.deepEqual(Buffer.from(canonicalCreatorMessage(intent,intent.mint,intent.creator)),bytes);
 assert.throws(()=>canonicalCreatorMessage({...intent,messageHex:intent.messageHex+'00'},intent.mint,intent.creator));
 assert.throws(()=>canonicalCreatorMessage(intent,new PublicKey(Buffer.alloc(32,9)).toBase58(),intent.creator));
});
test('v1 and v2 signature domains cannot be substituted',()=>{
 const f=fields(),signature=nacl.sign.detached(signedBytes({...f,version:2}),key.secretKey);
 assert.throws(()=>verifyRecord(encodeRecord({...f,version:1,signature})),/signature/);
});
test('valid checksum cannot conceal a forged signature',()=>{
 const record=signed(2);record[LAYOUT.signature]^=1;
 createHash('sha256').update(record.subarray(0,LAYOUT.checksum)).digest().copy(record,LAYOUT.checksum,0,2);
 assert.throws(()=>verifyRecord(record),/signature/);
});
test('truncation, corrupt checksum and nonzero flags fail closed',()=>{
 const record=signed(1);assert.throws(()=>decodeRecord(record.subarray(0,184)));
 record[LAYOUT.checksum]^=1;assert.throws(()=>decodeRecord(record));
 assert.throws(()=>encodeRecord({...fields(),version:1,flags:1,signature:Buffer.alloc(64)}));
});
test('duplicate records, unknown tags, oversized and nonminimal extra lengths fail closed',()=>{
 const extra=encodeExtraField(signed(1));
 for(const bytes of [Buffer.concat([extra,extra]),Buffer.from([0x80]),Buffer.alloc(1061),Buffer.from([2,0x81,0,1])])assert.throws(()=>decodeExtraField(bytes));
});
test('receipt expectations and replay protection are enforced',()=>{
 const index=emptyIndex(),extra=encodeExtraField(signed(1)),txHash='ab'.repeat(32);
 assert.equal(observeTransaction(index,{txHash,extra,expectedMint:Buffer.alloc(32,9)}).status,'rejected');
 assert.equal(observeTransaction(index,{txHash,extra,inBlock:true,height:100,chainHeight:109}).status,'pending');
 assert.equal(observeTransaction(index,{txHash:'cd'.repeat(32),extra,inBlock:true,height:100,chainHeight:110}).status,'duplicate');
});
test('expired cached receipts are never promoted to current proof',()=>{
 const f=fields(),row={record:signed(1).toString('hex'),status:'verified',confirmations:10,tx_hash:'ab'.repeat(32),height:100,observed_at:1};
 assert.equal(receiptMonero(row,{mintHex:f.mint.toString('hex'),metadataHash:f.metadataHash.toString('hex'),creatorHex:f.creator.toString('hex')},180001).status,'stale');
});
test('daemon trust and network shape checks reject incomplete evidence',()=>{
 for(const info of [{status:'OK',untrusted:true},{status:'OK',untrusted:false,height:110,mainnet:false,nettype:'stagenet',synchronized:true},{status:'OK',untrusted:false,height:110,mainnet:true,nettype:'mainnet',synchronized:false}])assert.throws(()=>synchronizedMainnetHeight(info));
 assert.throws(()=>validatedTransactions({status:'OK',untrusted:false,txs:[{tx_hash:'cd'.repeat(32),in_pool:false,block_height:100}]},['ab'.repeat(32)],110));
 assert.throws(()=>validatedBlock({status:'OK',untrusted:false,block_header:{height:100,hash:'ab'.repeat(32),prev_hash:'cd'.repeat(32),orphan_status:true},tx_hashes:[]},100,110));
});
test('read daemon refuses transfer and relay methods before issuing a request',async()=>{
 for(const method of ['transfer','send_raw_transaction','relay_tx'])await assert.rejects(readDaemon('http://127.0.0.1:1',method,{}),/read-only/);
});
