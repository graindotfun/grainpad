import test from 'node:test';
import assert from 'node:assert/strict';
import {chartHistoryPoints,liveChartPoints,rollingChartPoints,smoothChartSegments} from '../lib/live-chart.mjs';
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

test('one-minute and five-minute windows fill quiet time with the last actual price and retain within-minute trades',()=>{
 const rows=[{time:900,lastTime:905,close:10},{time:940,lastTime:943,close:12},{time:980,lastTime:981,close:9}];
 const minute=rollingChartPoints(rows,[{time:990,value:11}],1,1000,60,{time:800,close:7});
 assert.deepEqual(minute,[{time:940,value:10},{time:943,value:12},{time:981,value:9},{time:990,value:11},{time:1000,value:11}]);
 assert.deepEqual(rollingChartPoints([],[],2,1000,300,{time:500,close:7}),[{time:700,value:14},{time:1000,value:14}]);
 assert.deepEqual(rollingChartPoints([],[],1,1000,60),[]);
 assert.deepEqual(rollingChartPoints([{time:981,close:9}],[{time:981,value:10},{time:1001,value:20}],1,1000,60),[{time:981,value:9},{time:981,value:10},{time:1000,value:10}]);
});
test('rounded cubic paths preserve execution samples and keep control prices inside the segment endpoints',()=>{
 const points=[{x:0,y:10},{x:1,y:20},{x:2,y:12},{x:3,y:18}],segments=smoothChartSegments(points);
 for(let i=0;i<segments.length;i++){const segment=segments[i],a=points[i],b=points[i+1];assert.equal(segment.x,b.x);assert.equal(segment.y,b.y);assert(segment.y1>=Math.min(a.y,b.y)&&segment.y1<=Math.max(a.y,b.y));assert(segment.y2>=Math.min(a.y,b.y)&&segment.y2<=Math.max(a.y,b.y));}
 assert.equal(segments[0].y2,20);assert.equal(segments[1].y1,20);assert.deepEqual(smoothChartSegments([{x:0,y:1}]),[]);
});
