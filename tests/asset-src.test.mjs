import test from 'node:test';import assert from 'node:assert/strict';
import {displayAssetSrc} from '../lib/asset-src.mjs';
const hash='ab'.repeat(32);
test('own stored artwork renders same-origin; everything else is unchanged',()=>{
 assert.equal(displayAssetSrc(`https://grainpad.fun/api/assets/${hash}`),`/api/assets/${hash}`);
 for(const src of [`https://grainpad.fun/api/assets/${hash}?v=1`,`https://evil.example/api/assets/${hash}`,`https://grainpad.fun/api/assets/short`,'https://grainpad.fun/brand/grain-token.png',`/api/assets/${hash}`,'ipfs://x'])assert.equal(displayAssetSrc(src),src);
 assert.equal(displayAssetSrc(undefined),undefined);assert.equal(displayAssetSrc(null),undefined);
});
