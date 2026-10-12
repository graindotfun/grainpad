import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import nacl from 'tweetnacl';
import {PublicKey} from '@solana/web3.js';
import {signRecord,encodeExtraField} from '../lib/monero-record.mjs';
import {readRecord} from '../lib/read-record.mjs';
function fixture({chainHeight=110,mutate=null}={}){
 const key=nacl.sign.keyPair(),fields={version:2,mint:Buffer.alloc(32,1),metadataHash:Buffer.alloc(32,2),creator:Buffer.from(key.publicKey),nonce:Buffer.alloc(16,3)},txHash='ab'.repeat(32);
 const expected={mint:new PublicKey(fields.mint).toBase58(),creator:new PublicKey(fields.creator).toBase58(),metadataHash:fields.metadataHash.toString('hex')};
 const tx={tx_hash:txHash,in_pool:false,block_height:100,as_json:JSON.stringify({extra:[...encodeExtraField(signRecord(fields,key.secretKey))]})};
 let blockReads=0;
 const read=async(method)=>{
  let result;
  if(method==='get_info')result={status:'OK',untrusted:false,height:chainHeight,mainnet:true,nettype:'mainnet',synchronized:true};
  else if(method==='get_transactions')result={status:'OK',untrusted:false,txs:[{...tx}]};
  else if(method==='get_block'){blockReads++;result={status:'OK',untrusted:false,block_header:{height:100,hash:'cd'.repeat(32),prev_hash:'ef'.repeat(32),orphan_status:false},tx_hashes:[txHash]};}
  else throw Error('Unexpected method.');
  return mutate?mutate(method,result,blockReads):result;
 };
 return {input:{txHash,expected},read};
}
test('ten confirmations plus complete supplied identity produce receipt-matched',async()=>{const f=fixture();const r=await readRecord(f.input,f.read);assert.equal(r.status,'receipt-matched');assert.equal(r.confirmations,10);assert.equal(r.receiptMatched,true);});
test('nine confirmations remain pending',async()=>{const f=fixture({chainHeight:109});assert.equal((await readRecord(f.input,f.read)).status,'pending');});
test('signature-only inspection never claims receipt matching',async()=>{const f=fixture();delete f.input.expected;const r=await readRecord(f.input,f.read);assert.equal(r.status,'signature-valid');assert.equal(r.receiptMatched,false);});
test('supplied mint, creator and metadata are each checked',async()=>{
 for(const field of ['mint','creator','metadataHash']){const f=fixture();f.input.expected[field]=field==='metadataHash'?'00'.repeat(32):new PublicKey(Buffer.alloc(32,9)).toBase58();await assert.rejects(readRecord(f.input,f.read),/identity/);}
});
test('missing canonical inclusion, pool transaction, untrusted node and changed block are rejected',async()=>{
 const mutations=[(m,r)=>{if(m==='get_block')r.tx_hashes=[];return r;},(m,r)=>{if(m==='get_transactions')r.txs[0].in_pool=true;return r;},(m,r)=>{if(m==='get_info')r.untrusted=true;return r;},(m,r,n)=>{if(m==='get_block'&&n===2)r.block_header.hash='00'.repeat(32);return r;}];
 for(const mutate of mutations){const f=fixture({mutate});await assert.rejects(readRecord(f.input,f.read));}
});
test('CLI failures do not echo endpoint secrets or response details',()=>{
 const marker='private-endpoint-'+String(Date.now()),endpoint=new URL('https://example.invalid');endpoint.username=marker;endpoint.password='password';const url=endpoint.href;
 const r=spawnSync(process.execPath,['scripts/read-record.mjs','--tx','ab'.repeat(32)],{cwd:new URL('..',import.meta.url),env:{...process.env,MONERO_DAEMON_URL:url},encoding:'utf8'});
 assert.equal(r.status,1);assert(!r.stderr.includes(marker));assert(!r.stderr.includes('password'));assert(!r.stdout.includes(marker));
});
