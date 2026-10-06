import test from 'node:test';
import assert from 'node:assert/strict';
import {percentageUnits} from '../lib/token-units.mjs';
import {parseUnits} from '../lib/trade-core.mjs';

test('sell shortcuts preserve atomic precision for the screenshot balance',()=>{
 const balance='94505874769';
 assert.deepEqual([10,25,50,100].map(p=>percentageUnits(balance,p,6)),['9450.587476','23626.468692','47252.937384','94505.874769']);
});
test('percentages floor dust and preserve the entire balance at 100%',()=>{
 for(const balance of ['0','1','9','999999','1000000','18446744073709551615']){
  for(const percent of [10,25,50,100]){
   const result=percentageUnits(balance,percent,6);
   // parseUnits rejects zero: these are populated as zero and existing validation handles them.
   const atoms=result==='0'?0n:parseUnits(result,6);
   assert.equal(atoms,BigInt(balance)*BigInt(percent)/100n);
   assert.ok(atoms<=BigInt(balance));
  }
 }
});
test('decimal formatting works for integer and fractional token precision',()=>{
 assert.equal(percentageUnits('100',100,0),'100');
 assert.equal(percentageUnits('123456789',25,9),'0.030864197');
 assert.equal(percentageUnits('1000000',100,6),'1');
});
test('rejects invalid percentages and negative balances',()=>{
 for(const percent of [-1,101,0.5,NaN])assert.throws(()=>percentageUnits('100',percent,6));
 assert.throws(()=>percentageUnits('-1',50,6));
});
