import test from 'node:test';import assert from 'node:assert/strict';
import {solPriorityBounds,SOL_PRIORITY_MAX_LAMPORTS} from '../lib/sol-trade-prepare.mjs';
import {selectPriorityFee} from '../lib/priority-fee.mjs';
import {freshPrepareCheck,SOL_PREPARE_FRESH_MS} from '../lib/sol-trade-client.mjs';
test('SOL route priority price follows recent fees but never exceeds the lamport ceiling',()=>{
 for(const units of [200_000,600_000,1_400_000]){
  const bounds=solPriorityBounds({floor:10_000,cap:100_000},units);
  const hot=selectPriorityFee([{prioritizationFee:5_000_000}],bounds,units);
  assert.ok(hot.lamports<=SOL_PRIORITY_MAX_LAMPORTS);assert.equal(hot.microLamports,bounds.cap);
  assert.equal(selectPriorityFee([],bounds,units).microLamports,Math.min(10_000,bounds.cap));
 }
 assert.equal(selectPriorityFee([{prioritizationFee:40_000}],solPriorityBounds({floor:10_000,cap:100_000},300_000),300_000).microLamports,40_000);
 assert.throws(()=>solPriorityBounds({floor:10_000,cap:100_000},0),/compute/);
 assert.throws(()=>solPriorityBounds({floor:10_000,cap:100_000},1_400_001),/compute/);
});
test('a just-prepared review skips the second pre-wallet simulation only while fresh',()=>{
 const now=1_000_000,review={id:'a'.repeat(32),minContextSlot:50,simulationSlot:55,expiresAt:now+60_000};
 assert.deepEqual(freshPrepareCheck(review,now-1000,now),{id:review.id,ok:true,slot:55,source:'prepare'});
 assert.equal(freshPrepareCheck(review,now-SOL_PREPARE_FRESH_MS-1,now),null);
 assert.equal(freshPrepareCheck({...review,simulationSlot:undefined},now,now),null);
 assert.equal(freshPrepareCheck({...review,simulationSlot:49},now,now),null);
 assert.equal(freshPrepareCheck({...review,expiresAt:now+9_000},now,now),null);
 assert.equal(freshPrepareCheck(review,now+1,now),null);
});
