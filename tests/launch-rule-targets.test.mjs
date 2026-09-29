import test from 'node:test';import assert from 'node:assert/strict';import BN from 'bn.js';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import {launchConstraints} from '../lib/launch-rules.mjs';
import {quoteAsset} from '../lib/quote-assets.mjs';
const b=x=>new BN(String(x));
test('each quote fixes its graduation target and constant-product curve; lower AND higher targets fail',()=>{
 for(const symbol of ['SOL','wXMR']){
  const constraints=launchConstraints(symbol),target=b(quoteAsset(symbol).floor);
  assert.equal(constraints.find(x=>x.field===sdk.LaunchpadCurveRuleField.TotalFundRaisingB).op,sdk.LaunchpadCurveRuleOp.Eq);
  const curve=constraints.find(x=>x.field===sdk.LaunchpadCurveRuleField.CurveType);assert.equal(curve.op,sdk.LaunchpadCurveRuleOp.Eq);assert(curve.value.isZero());
  const context={curveType:0,migrateType:1,migrateCpmmFeeOn:0,supply:b('1000000000000000'),totalSellA:b('793100000000000'),totalFundRaisingB:target,totalLockedAmount:b(0),cliffPeriod:b(0),unlockPeriod:b(0),baseTokenProgram:0,unixTimestamp:b(0)};
  const accepts=delta=>sdk.checkLaunchAgainstCurveRule({rule:{groups:[{groupId:0,constraints}]},context:{...context,...delta}}).ok;
  assert(accepts({}));assert(!accepts({totalFundRaisingB:target.subn(1)}));assert(!accepts({totalFundRaisingB:target.addn(1)}));
  assert(!accepts({curveType:1}));assert(!accepts({curveType:2}));
 }
});
