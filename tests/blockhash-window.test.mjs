import test from 'node:test';import assert from 'node:assert/strict';
import {blockhashCountdown,assertBlockhashWindow,WALLET_EXPIRY_MESSAGE} from '../lib/blockhash-window.mjs';
test('seconds follow the observed 2.7–3.8 blocks/s rate, not a fixed review age',()=>{
 for(const [height,rate] of [[127,2.7],[138,3.8]]){const x=blockhashCountdown(250,[{height:100,at:0},{height,at:10000}],10000);assert.equal(x.blocksPerSecond,rate);assert.equal(x.seconds,Math.floor((250-height)/rate));assert(x.ready);assert(x.observed);}
});
test('countdown estimates progress between polls and disables at the 10-block margin',()=>{
 const samples=[{height:100,at:0},{height:130,at:10000}];assert(blockhashCountdown(150,samples,10000).ready);assert.equal(blockhashCountdown(150,samples,14000).ready,false);assert.equal(blockhashCountdown(140,samples,10000).ready,false);
});
test('missing or stale height fails closed; the first reading uses a labelled estimate',()=>{
 assert.equal(blockhashCountdown(250,[],0).ready,false);const x=blockhashCountdown(250,[{height:100,at:0}],0);assert.equal(x.observed,false);assert.equal(x.seconds,37);assert.equal(blockhashCountdown(250,[{height:100,at:0}],6501).live,false);
});
test('expired and near-expiry returns retain plain retry guidance regardless of wall time',()=>{
 for(const height of [140,150,160])assert.throws(()=>assertBlockhashWindow(150,height,true),e=>e.message===WALLET_EXPIRY_MESSAGE&&e.retryReview===true);
 assert.doesNotThrow(()=>assertBlockhashWindow(150,139,true));assert.throws(()=>assertBlockhashWindow(150,140),/Refresh the review/);
});
test('malformed validity and future clock sample cannot enable review',()=>{
 assert.equal(blockhashCountdown(undefined,[{height:100,at:0}],0).ready,false);assert.equal(blockhashCountdown(250,[{height:100,at:2000}],0).ready,false);assert.throws(()=>assertBlockhashWindow(NaN,100));
});
