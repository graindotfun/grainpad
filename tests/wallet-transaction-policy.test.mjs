import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicKey,TransactionInstruction,TransactionMessage,VersionedTransaction,ComputeBudgetProgram,SystemProgram} from '@solana/web3.js';
import {buildSetupTransaction} from '../lib/platform-setup.mjs';
import {decodeReviewedTransaction,inspectWalletTransaction,LIGHTHOUSE_PROGRAM,sameSimulatedAccount} from '../lib/wallet-transaction-policy.mjs';
const original=buildSetupTransaction('1a',PublicKey.default.toBase58());
const originalSnapshot=decodeReviewedTransaction(original);
const message=()=>TransactionMessage.decompile(original.message);
const compile=m=>new VersionedTransaction(m.compileToV0Message());
const guard=()=>new TransactionInstruction({programId:new PublicKey(LIGHTHOUSE_PROGRAM),keys:[{pubkey:original.message.staticAccountKeys[0],isSigner:false,isWritable:false}],data:Buffer.from([5,0,7,0,0])});
const check=change=>{const m=message();change(m);return inspectWalletTransaction(originalSnapshot,compile(m));};
test('unchanged reviewed message passes with decoded compute settings',()=>{
 const diff=inspectWalletTransaction(originalSnapshot,original);assert(diff.valid);assert.deepEqual(diff.added,[]);assert.equal(diff.computeBefore[0].unitLimit,200000);assert.equal(diff.computeAfter[1].microLamports,'10000');
});
test('extra ComputeBudget setting and Lighthouse guards preserve every original instruction',()=>{
 const diff=check(m=>{m.instructions.splice(2,0,ComputeBudgetProgram.requestHeapFrame({bytes:32768}),guard(),guard());m.instructions.push(guard());});
 assert.equal(diff.valid,true,JSON.stringify(diff.reasons));assert.equal(diff.added.length,4);assert.equal(diff.removed.length,0);assert.equal(diff.matched.length,5);assert(diff.bytesAfter<1232);assert.equal(diff.added[0].programId,ComputeBudgetProgram.programId.toBase58());assert.equal(diff.added[1].programId,LIGHTHOUSE_PROGRAM);
 assert(diff.added[1].dataHex);assert.deepEqual(diff.added[1].accounts,originalSnapshot.keys.slice(0,1));
});
for(const [name,change,reason] of [
 ['different payer',m=>m.payerKey=PublicKey.default,/Fee payer/],
 ['different blockhash',m=>m.recentBlockhash=m.payerKey.toBase58(),/blockhash/],
 ['removed instruction',m=>m.instructions.splice(3,1),/original instruction/],
 ['changed data',m=>m.instructions[3].data[0]^=1,/original instruction/],
 ['changed program',m=>m.instructions[3].programId=SystemProgram.programId,/original instruction/],
 ['reordered instructions',m=>[m.instructions[3],m.instructions[4]]=[m.instructions[4],m.instructions[3]],/original instruction/],
 ['changed accounts',m=>m.instructions[3].keys[1].pubkey=PublicKey.default,/original instruction/],
 ['extra unapproved instruction',m=>m.instructions.push(SystemProgram.transfer({fromPubkey:m.payerKey,toPubkey:m.payerKey,lamports:0})),/unapproved program/],
 ['extra signer',m=>{const x=guard();x.keys=[{pubkey:PublicKey.default,isSigner:true,isWritable:false}];m.instructions.push(x);},/signers/],
 ['promoted original account privileges',m=>{const x=guard();x.keys=[{pubkey:original.message.staticAccountKeys[4],isSigner:false,isWritable:true}];m.instructions.push(x);},/privileges/],
 ['duplicate compute setting',m=>m.instructions.push(ComputeBudgetProgram.setComputeUnitPrice({microLamports:1})),/duplicate ComputeBudget/],
 ['changed compute price',m=>m.instructions[1]=ComputeBudgetProgram.setComputeUnitPrice({microLamports:20000}),/original instruction/],
 ['invalid compute variant',m=>m.instructions.push(new TransactionInstruction({programId:ComputeBudgetProgram.programId,keys:[],data:Buffer.from([99])})),/Invalid or duplicate/],
 ['oversize guards',m=>{const x=guard();x.data=Buffer.alloc(1000);m.instructions.push(x);},/exceed|encoding|overrun/i],
])test(`${name} rejects before a send`,()=>{const diff=check(change);assert.equal(diff.valid,false);assert.match(diff.reasons.join(' '),reason);});
test('snapshot is immutable when wallet mutates the input object',()=>{
 const t=buildSetupTransaction('1a',PublicKey.default.toBase58()),snapshot=decodeReviewedTransaction(t);t.message.compiledInstructions[3].data[0]^=1;assert.equal(inspectWalletTransaction(snapshot,t).valid,false);
});
test('full account comparison catches data, owner, lamports and executable changes',()=>{
 const a={lamports:5445760,owner:'platform-program',executable:false,data:['AQI=','base64']};assert(sameSimulatedAccount(a,structuredClone(a)));for(const b of [{...a,lamports:1},{...a,owner:'other'},{...a,executable:true},{...a,data:['AQM=','base64']}])assert(!sameSimulatedAccount(a,b));assert(sameSimulatedAccount(null,{lamports:0,data:['','base64'],executable:false,owner:PublicKey.default.toBase58()}));
});
