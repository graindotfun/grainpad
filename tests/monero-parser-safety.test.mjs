import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {decodeExtraField,encodeRecord,encodeExtraField,verifyRecord} from '../lib/monero-record.mjs';
const digest=b=>createHash('sha256').update(b).digest();
const key=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),digest(Buffer.from('GRAINPAD OFFLINE AUDIT FIXTURE ONLY'))]),format:'der',type:'pkcs8'});
const fields={version:1,mint:Buffer.alloc(32,1),metadataHash:digest(Buffer.from('audit metadata 1')),creator:createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32),nonce:Buffer.alloc(16,1),flags:0};
const msg=Buffer.concat([Buffer.from('grainpad.monero-record.v1\0'),Buffer.from('47524e310100','hex'),fields.mint,fields.metadataHash,fields.creator,fields.nonce,Buffer.from([0])]);
const record=encodeRecord({...fields,signature:sign(null,msg,key)}),extra=encodeExtraField(record);
test('independent signed audit fixture preserves v1 bytes',()=>{assert.equal(digest(record).toString('hex'),'c803293e0149e8eed0dfd9a100ec13ffe80d50a39ec1a508d56f157f07fd05ec');assert.equal(record.length,185);assert.equal(extra.length,189);assert.deepEqual(verifyRecord(record).mint,fields.mint);assert.deepEqual(decodeExtraField(Buffer.concat([Buffer.from([1]),Buffer.alloc(32),extra,Buffer.from([4,1]),Buffer.alloc(32)])),[record]);});
test('nonminimal, oversized, truncated and trailing malformed fields rejected',()=>{
 for(const hex of ['02ba81007f'+record.toString('hex'),'028002'+'00'.repeat(256),'0280','01','04','0401','04ffffffff0f','03','00'.repeat(1061)])assert.throws(()=>decodeExtraField(Buffer.from(hex,'hex')),hex.slice(0,20));
 assert.throws(()=>decodeExtraField(Buffer.concat([extra,Buffer.from([1])])));
 assert.throws(()=>decodeExtraField(Buffer.concat([extra,extra])));
});
test('overflow and randomized input terminate in isolated process',()=>{
 const moduleUrl=new URL('../lib/monero-record.mjs',import.meta.url).href;
 const script=`import {decodeExtraField} from ${JSON.stringify(moduleUrl)}; import assert from 'node:assert/strict'; for(const h of ['02faffffff0f','02ffffffff07','02ffffffff0f','04ffffffff0f']) assert.throws(()=>decodeExtraField(Buffer.from(h,'hex'))); let s=7; for(let n=0;n<5000;n++){const b=Buffer.alloc(n%1100);for(let i=0;i<b.length;i++){s=(Math.imul(s,1664525)+1013904223)>>>0;b[i]=s>>>24;}try{decodeExtraField(b);}catch{}}`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{timeout:5000,encoding:'utf8'});assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
});
