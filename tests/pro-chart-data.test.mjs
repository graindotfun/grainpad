import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeBars,withLiveTrades,seriesRows,minMoveFor,utcLabel,withAlpha,pageCursor,chartLifetimeBar,BAR_OPTIONS,RANGE_OPTIONS} from '../lib/pro-chart-data.mjs';
const bar=(time,close,extra={})=>({time,open:close,high:close,low:close,close,volume:1,...extra});
test('pages merge by bar time, newest read wins, invalid bars are dropped',()=>{
 const merged=mergeBars([bar(60,1),bar(120,2)],[bar(120,3),bar(180,4),{time:240,open:0,high:1,low:1,close:1}]);
 assert.deepEqual(merged.map(b=>[b.time,b.close]),[[60,1],[120,3],[180,4]]);
});
test('live executions after the indexed tail move the last bar or start a new one, without inventing volume',()=>{
 const bars=[bar(60,1,{lastTime:100,volume:5})];
 const out=withLiveTrades(bars,[{id:'a',time:90,value:9,slot:1},{id:'b',time:110,value:2,slot:2},{id:'c',time:130,value:.5,slot:3}],60);
 assert.equal(out.length,2);assert.equal(out[0].close,2);assert.equal(out[0].high,2);assert.equal(out[0].volume,5);
 assert.deepEqual([out[1].time,out[1].open,out[1].low,out[1].close,out[1].volume],[120,2,.5,.5,0]);
 assert.equal(withLiveTrades(bars,[],60),bars);
});
test('series rows apply one multiplier, shift to the viewer clock and mark volume direction',()=>{
 const {candles,volumes}=seriesRows([{time:60,open:1,high:2,low:.5,close:1.5,volume:3},{time:120,open:1.5,high:1.5,low:1,close:1,volume:2}],{multiplier:10,volumeMultiplier:100,shift:3600});
 assert.deepEqual(candles[0],{time:3660,open:10,high:20,low:5,close:15});assert.deepEqual(volumes.map(v=>[v.value,v.up]),[[300,true],[200,false]]);
});
test('tiny prices get a fine scale step; labels and colors format for the engine',()=>{
 assert.equal(minMoveFor([3.98e-8,4.1e-8]),1e-12);assert.equal(minMoveFor([]),0.01);
 assert.equal(utcLabel(180),'UTC+3');assert.equal(utcLabel(-270),'UTC−4:30');assert.equal(utcLabel(0),'UTC');
 assert.equal(withAlpha('#ff6600',.5),'rgba(255,102,0,0.5)');assert.equal(withAlpha('rgba(16, 16, 16, .6)',.2),'rgba(16,16,16,0.2)');assert.equal(withAlpha('red',.2),'red');
 assert.deepEqual(BAR_OPTIONS.map(([l])=>l),['1s','1m','5m','15m','1h','4h','1d']);assert.deepEqual(RANGE_OPTIONS.map(([l])=>l),['1D','1W','1M','3M','1Y','All']);
});
test('history pages by time window: a short or empty page is not the end, only reaching the first trade is',()=>{
 assert.deepEqual(pageCursor(null,{first:1000,window:{start:50000}}),{cursor:50000,exhausted:false});
 assert.deepEqual(pageCursor(50000,{first:1000,window:{start:20000}}),{cursor:20000,exhausted:false});
 assert.deepEqual(pageCursor(20000,{first:1000,window:{start:900}}),{cursor:900,exhausted:true});
 assert.deepEqual(pageCursor(20000,{first:1000,window:{start:30000}}),{cursor:20000,exhausted:false},'a newer poll never moves the cursor forward');
 assert.equal(pageCursor(null,{first:null,window:{start:5}}).exhausted,true,'no trades at all');
 assert.deepEqual(pageCursor(7,{first:1}),{cursor:7,exhausted:true},'a page without a window cannot be continued');
});

test('default whole-life bars show quiet pre-migration tokens instead of an empty last day',()=>{const now=2000000,first=now-5*86400;const seconds=chartLifetimeBar(first,300,now);assert.equal(seconds,3600);assert.ok(now-first<seconds*300);assert.equal(chartLifetimeBar(now-60,300,now),300);assert.equal(chartLifetimeBar(null,300,now),300);});
