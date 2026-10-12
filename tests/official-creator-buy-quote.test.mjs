import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteInitialOfficialCreatorBuy} from '../lib/official-creator-buy-quote.mjs';
import {OFFICIAL_DECLARED_CREATOR_BUY,OFFICIAL_CREATOR_BUY_SLIPPAGE_BPS} from '../lib/official-launch-policy.mjs';
test('approved 0.145 wXMR launch buy pins a net minimum and accounts for all fees',()=>{
 const q=quoteInitialOfficialCreatorBuy({amountIn:OFFICIAL_DECLARED_CREATOR_BUY.amountIn,slippageBps:OFFICIAL_CREATOR_BUY_SLIPPAGE_BPS});
 assert.equal(q.amountIn,'145000000000');assert.equal(q.minOut,OFFICIAL_DECLARED_CREATOR_BUY.minOut);
 assert.equal(q.grossOutputRaw,'21332871039206');assert.equal(q.transferFeeRaw,'426657420785');assert.equal(q.expectedNetOutputRaw,'20906213618421');
 assert.equal(q.totalCurveFeeRaw,'1812500000');assert.equal(q.curvePrincipalRaw,'143187500000');
 assert.equal(BigInt(q.curvePrincipalRaw)+BigInt(q.totalCurveFeeRaw),BigInt(q.amountIn));
 assert.equal(BigInt(q.expectedNetOutputRaw)+BigInt(q.transferFeeRaw),BigInt(q.grossOutputRaw));
 assert.equal(BigInt(q.minOut),BigInt(q.expectedNetOutputRaw)*99n/100n);
 assert.equal(q.curveFeesRaw.platformFee,'1087500000');assert.equal(q.curveFeesRaw.protocolFee,'362500000');assert.equal(q.curveFeesRaw.creatorFee,'362500000');
 assert.equal(q.simulated,false);assert.equal(q.submitted,false);
});
test('quote recomputes tax, fee and output when an owner changes the input',()=>{
 const lower=quoteInitialOfficialCreatorBuy({amountIn:'100000000000'}),higher=quoteInitialOfficialCreatorBuy({amountIn:'200000000000'}),exact=quoteInitialOfficialCreatorBuy({amountIn:'145000000000',slippageBps:0});
 assert.ok(BigInt(higher.minOut)>BigInt(lower.minOut));assert.equal(exact.minOut,exact.expectedNetOutputRaw);
 assert.notEqual(quoteInitialOfficialCreatorBuy({amountIn:'145000000000',platformRate:8000}).minOut,OFFICIAL_DECLARED_CREATOR_BUY.minOut);
 assert.notEqual(quoteInitialOfficialCreatorBuy({amountIn:'145000000000',migrateFeeRaw:'1'}).virtualB,undefined);
});
test('invalid amounts, widened output tolerance and graduation crossing cannot become a declaration',()=>{
 for(const amountIn of ['0','01','-1','1.5','18446744073709551616'])assert.throws(()=>quoteInitialOfficialCreatorBuy({amountIn}),/canonical/);
 assert.throws(()=>quoteInitialOfficialCreatorBuy({amountIn:'145000000000',slippageBps:101}),/bounds/);
 assert.throws(()=>quoteInitialOfficialCreatorBuy({amountIn:'145000000000',taxBps:10000}),/bounds/);
 assert.throws(()=>quoteInitialOfficialCreatorBuy({amountIn:'50000000000000'}),/crosses graduation/);
});
