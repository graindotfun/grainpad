import test from 'node:test';
import assert from 'node:assert/strict';
import {journalCreateProvider,chooseLaunchSubmissionRecord,launchSubmissionLocked,bindLaunchSubmissionRecords,conflictingLaunchSubmissionBindings,canClearLaunchSubmission} from '../lib/chain/launch-submission-journal.ts';
const hash='0x'+'a'.repeat(64),id='0x'+'b'.repeat(64);
test('read/simulation requests forward without creating a submission marker',async()=>{
  const writes=[];const seen=[];const provider=journalCreateProvider({request:async args=>{seen.push(args.method);return '0x1237';}},{id},async r=>writes.push(r));
  assert.equal(await provider.request({method:'eth_chainId'}),'0x1237');
  assert.deepEqual(seen,['eth_chainId']);assert.equal(writes.length,0);
});
test('actual send is preceded by durable original-launch marker and hash is saved before return',async()=>{
  const writes=[];
  const provider=journalCreateProvider({request:async()=>{assert.equal(writes[0].submissionRequested,true);assert.equal(writes[0].id,id);return hash;}},{id,draft:{name:'Original'}},async r=>writes.push(r));
  assert.equal(await provider.request({method:'eth_sendTransaction',params:[{}]}),hash);
  assert.equal(writes.length,2);assert.equal(writes[1].hash,hash);assert.equal(launchSubmissionLocked(writes[1]),true);
});
test('storage failure prevents wallet send',async()=>{
  let calls=0;const provider=journalCreateProvider({request:async()=>{calls++;return hash;}},{id},async()=>{throw Error('storage unavailable');});
  await assert.rejects(provider.request({method:'eth_sendTransaction'}),/storage/);assert.equal(calls,0);
});
test('only explicit provider 4001 clears a requested submission',async()=>{
  for(const code of [4001,-32000,4900,undefined]){
    const writes=[];const provider=journalCreateProvider({request:async()=>{throw Object.assign(Error('wallet'),{code});}},{id},async r=>writes.push(r));
    await assert.rejects(provider.request({method:'eth_sendTransaction'}));
    assert.equal(writes.at(-1).submissionRequested,code!==4001);
  }
});
test('malformed and missing hash replies preserve uncertainty rather than allowing another create',async()=>{
  for(const result of [null,undefined,'0x123','0x'+'0'.repeat(64),{hash}]){
    const writes=[];const provider=journalCreateProvider({request:async()=>result},{id},async r=>writes.push(r));
    await assert.rejects(provider.request({method:'eth_sendTransaction'}),/uncertain/);
    assert.equal(writes.at(-1).submissionRequested,true);
  }
});
test('known hash wins over stale unknown independent journal; explicit no-send drafts are unlocked',()=>{
  const unknown={id,submissionRequested:true,draft:{name:'Old'}};const known={id,hash};
  assert.equal(chooseLaunchSubmissionRecord(unknown,known),known);
  assert.equal(chooseLaunchSubmissionRecord(known,unknown),known);
  assert.equal(launchSubmissionLocked({id,submissionRequested:false,draft:{name:'Fresh'}}),false);
  assert.equal(launchSubmissionLocked({id,draft:{name:'Legacy'}}),true);
  assert.equal(launchSubmissionLocked({id,reservedHash:'0x'+'0'.repeat(64)}),true);
});
test('recovering a successful different launch of the same creator cannot erase original unknown send',()=>{
  const owner='0x'+'1'.repeat(40),idA=owner+'a'.repeat(24),idB=owner+'b'.repeat(24);
  const original={id:idA,submissionRequested:true,draft:{name:'A'}};
  const binding=bindLaunchSubmissionRecords(original);
  const verifiedOtherReceipt={launchId:idB,transactionHash:hash};
  assert.equal(canClearLaunchSubmission(binding,verifiedOtherReceipt),false);
  assert.equal(launchSubmissionLocked(original),true);
  assert.equal(canClearLaunchSubmission(binding,{launchId:idA,transactionHash:hash}),true);
  assert.throws(()=>{binding[0].id=idB;},TypeError);
});
test('different launch storage copies remain conflicting and known hash cannot hide uncertain original',()=>{
  const original={id,submissionRequested:true,draft:{name:'A'}};
  const other={id:'0x'+'c'.repeat(64),hash,submissionRequested:true};
  for(const records of [[original,other],[other,original]]){
    assert.equal(chooseLaunchSubmissionRecord(...records),original);
    const bindings=bindLaunchSubmissionRecords(...records);
    assert.equal(conflictingLaunchSubmissionBindings(bindings),true);
    assert.equal(canClearLaunchSubmission(bindings,{launchId:other.id,transactionHash:hash}),false);
    assert.equal(canClearLaunchSubmission(bindings,{launchId:id,transactionHash:hash}),false);
    assert.equal(original.submissionRequested,true);assert.equal(other.hash,hash);
  }
});
test('original known hash must match independently recovered outcome and same-id conflicting hashes stay locked',()=>{
  const bindings=bindLaunchSubmissionRecords({id,hash});
  assert.equal(canClearLaunchSubmission(bindings,{launchId:id,transactionHash:'0x'+'d'.repeat(64)}),false);
  assert.equal(canClearLaunchSubmission(bindings,{launchId:id,transactionHash:hash}),true);
  assert.equal(canClearLaunchSubmission(bindLaunchSubmissionRecords({id,hash},{id,hash:'0x'+'e'.repeat(64)}),{launchId:id,transactionHash:hash}),false);
  assert.equal(canClearLaunchSubmission(bindLaunchSubmissionRecords({submissionRequested:true}),{launchId:id,transactionHash:hash}),false);
});
