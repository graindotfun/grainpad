import test from 'node:test';import assert from 'node:assert/strict';
import {priorityPolicy,selectPriorityFee,estimatePriorityFee} from '../lib/priority-fee.mjs';
test('recent p75 is clamped to explicit floor and cap, with integer lamport review cost',()=>{
 const policy=priorityPolicy();const sample=n=>({prioritizationFee:n});
 assert.equal(selectPriorityFee([0,20000,40000,80000].map(sample),policy,300000).microLamports,40000);
 assert.equal(selectPriorityFee([0].map(sample),policy,300000).microLamports,10000);
 const bounded=selectPriorityFee([200000].map(sample),policy,600000);assert.equal(bounded.microLamports,100000);assert.equal(bounded.lamports,60000);
 assert.equal(selectPriorityFee([NaN,-1,Infinity].map(sample),policy,300000).source,'floor-no-samples');
 assert.throws(()=>priorityPolicy({PRIORITY_FEE_FLOOR_MICROLAMPORTS:200,PRIORITY_FEE_CAP_MICROLAMPORTS:100}));
});
test('samples use writable accounts only; provider outage uses a labelled floor',async()=>{
 const key=x=>({toBase58:()=>x}),write=key('write'),read=key('read');
 const instructions=[{keys:[{isWritable:true,pubkey:write},{isWritable:false,pubkey:read}]}];
 const connection={getRecentPrioritizationFees:async params=>{assert.deepEqual(params.lockedWritableAccounts,[write]);return [{prioritizationFee:15000}];}};
 assert.equal((await estimatePriorityFee(connection,instructions,priorityPolicy(),300000)).lamports,4500);
 connection.getRecentPrioritizationFees=async()=>{throw Error('offline');};assert.equal((await estimatePriorityFee(connection,instructions,priorityPolicy(),300000)).source,'floor-provider-unavailable');
});
