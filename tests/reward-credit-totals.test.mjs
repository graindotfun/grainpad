import test from 'node:test';
import assert from 'node:assert/strict';
import {rewardCreditTotals,mergeCreditPages,exactCreditUnits,groupedCreditUnits,creditShare} from '../lib/reward-credit-totals.mjs';
const lot=(lotId,earnedRaw,verifiedPaidRaw,unpaidRaw,cancelledRaw='0')=>({lotId,sourceId:lotId,earnedRaw,verifiedPaidRaw,unpaidRaw,cancelledRaw});
test('BigInt sums retain atomic units beyond Number precision and preserve the invariant',()=>{
 const totals=rewardCreditTotals([lot('a','9007199254740993003','1','9007199254740993002'),lot('b','5','2','2','1')]);
 assert.equal(totals.earnedRaw,9007199254740993008n);assert.equal(totals.unpaidRaw,9007199254740993004n);
 assert.equal(totals.earnedRaw,totals.verifiedPaidRaw+totals.unpaidRaw+totals.cancelledRaw);
 assert.throws(()=>rewardCreditTotals([lot('bad','4','1','4')]),/inconsistent/);
 assert.throws(()=>rewardCreditTotals([lot('bad','0','1','-1')]),/inconsistent/);
});
test('multi-page merge keeps latest observation and deduplicates lots without dropping distinct kinds',()=>{
 const a={mint:'mint',lots:[lot('a','3','1','2')],observedAt:20,nextCursor:{sourceId:'b'}},b={mint:'mint',lots:[a.lots[0],lot('b','4','0','4')],observedAt:10,nextCursor:null};
 const merged=mergeCreditPages(a,b);assert.equal(merged.lots.length,2);assert.equal(merged.observedAt,20);assert.equal(merged.nextCursor,null);assert.equal(rewardCreditTotals(merged.lots).unpaidRaw,6n);
 assert.throws(()=>mergeCreditPages(a,{...b,mint:'other'}),/match/);
});
test('retired token keeps historical accrual, verified payment and owner cancellation separate',()=>{
 const totals=rewardCreditTotals([lot('legacy','100','20','0','80')]);assert.equal(totals.unpaidRaw,0n);assert.equal(totals.verifiedPaidRaw,20n);assert.equal(totals.cancelledRaw,80n);assert.equal(creditShare(totals.cancelledRaw,totals.earnedRaw),80);
});
test('full 12-decimal formatting never rounds atomic units',()=>{
 assert.equal(exactCreditUnits('0'),'0.000000000000');assert.equal(groupedCreditUnits('1035561041'),'0.001\u2009035\u2009561\u2009041');assert.equal(exactCreditUnits('1'),'0.000000000001');assert.equal(exactCreditUnits('1000000000000'),'1.000000000000');assert.equal(creditShare(1n,3n),33.33);
});
