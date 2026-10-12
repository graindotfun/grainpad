import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey, TransactionMessage, VersionedTransaction, SystemProgram } from '@solana/web3.js';
import { parseUnsignedTransaction, describeUnsignedTransaction, simulateUnsignedTransaction } from '../lib/unsigned-transaction.mjs';

function transaction() {
  return new VersionedTransaction(new TransactionMessage({payerKey:PublicKey.default, recentBlockhash:PublicKey.default.toBase58(), instructions:[SystemProgram.transfer({fromPubkey:PublicKey.default, toPubkey:new PublicKey('So11111111111111111111111111111111111111112'), lamports:42})]}).compileToV0Message());
}
const encode = tx => Buffer.from(tx.serialize()).toString('base64');
test('decodes payer, signer/writable accounts and complete instruction bytes', () => {
  const tx = parseUnsignedTransaction(encode(transaction())); const report = describeUnsignedTransaction(tx);
  assert.equal(report.unsigned,true); assert.equal(report.instructions[0].program,SystemProgram.programId.toBase58());
  assert.equal(report.instructions[0].accounts[0].signer,true); assert.equal(report.instructions[0].accounts[1].writable,true);
  assert.equal(report.instructions[0].dataHex,'020000002a00000000000000');
});
test('refuses signatures, invalid base64, trailing bytes and oversized input', () => {
  const signed=transaction(); signed.signatures[0][0]=1; assert.throws(()=>parseUnsignedTransaction(encode(signed)),/unsigned/);
  assert.throws(()=>describeUnsignedTransaction(signed),/Signed/);
  assert.throws(()=>parseUnsignedTransaction('{}'),/base64/);
  assert.throws(()=>parseUnsignedTransaction(Buffer.concat([transaction().serialize(),Buffer.from([1])]).toString('base64')),/trailing/);
  assert.throws(()=>parseUnsignedTransaction(Buffer.alloc(1233).toString('base64')),/size/);
});
test('simulation uses only simulateTransaction with signatures disabled', async () => {
  let calls=0; const connection=new Proxy({}, {get:(_,name)=>{
    assert.equal(name,'simulateTransaction'); return async(tx,options)=>{calls++;assert.deepEqual(options,{sigVerify:false,replaceRecentBlockhash:true,commitment:'finalized'});return {context:{slot:1},value:{err:null,logs:[],unitsConsumed:5}};};
  }});
  const result=await simulateUnsignedTransaction(connection,transaction()); assert.equal(calls,1); assert.equal(result.noTransactionSubmitted,true);
  const signed=transaction();signed.signatures[0][0]=1;await assert.rejects(()=>simulateUnsignedTransaction(connection,signed),/Signed/);assert.equal(calls,1);
});
