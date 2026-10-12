import test from 'node:test';import assert from 'node:assert/strict';import {curveDisplayStats} from '../lib/curve-display.mjs';
test('curve spot price and market cap use token/quote decimals and are not transaction amounts',()=>{
 const pool={virtualA:2_000_000n,realA:1_000_000n,virtualB:900_000_000n,realB:100_000_000n,supply:10_000_000n};
 assert.deepEqual(curveDisplayStats(pool,6,9),{price:1,marketCap:10});assert.deepEqual(curveDisplayStats(pool,6,12),{price:.001,marketCap:.01});assert.deepEqual(curveDisplayStats({...pool,realA:2_000_000n},6,9),{price:null,marketCap:null});
});
