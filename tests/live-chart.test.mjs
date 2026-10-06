import test from 'node:test';
import assert from 'node:assert/strict';
import {chartHistoryPoints,liveChartPoints} from '../lib/live-chart.mjs';
import {publicReadPolicy} from '../lib/public-read-cache.mjs';
test('partial historical gaps are broken instead of joining unknown transactions with an invented ramp',()=>{
 const rows=[{time:0,close:10},{time:300,close:12},{time:3600,close:25}];
 assert.deepEqual(chartHistoryPoints(rows,2,{partial:true,seconds:300}),[{time:0,value:20},{time:300,value:24},{time:600,value:null},{time:3600,value:50}]);
 assert.equal(chartHistoryPoints(rows,2,{partial:false}).length,3);
});
test('live window advances time but never makes up price movement, preserves actual order and dedupes trades',()=>{
 const events=[{id:'b',time:110,value:2,slot:2},{id:'a',time:100,value:1,slot:1},{id:'b',time:110,value:2,slot:2}];
 assert.deepEqual(liveChartPoints(events,10,120),[{time:100,value:10},{time:110,value:20},{time:120,value:20}]);
 assert.deepEqual(liveChartPoints(events,10,250),[{time:130,value:20},{time:250,value:20}]);
 assert.deepEqual(liveChartPoints([],1,120),[]);
});
test('day and candle resolutions cannot collide in the edge cache',()=>{
 const path='https://grainpad.fun/api/market/'+'A'.repeat(32)+'/history?interval=5m';
 assert.notEqual(publicReadPolicy(new Request(path)).url.href,publicReadPolicy(new Request(path+'&range=1d')).url.href);
});
