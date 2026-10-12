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
 assert.deepEqual(liveChartPoints(events,10,120),[{time:100,value:10},{time:109.75,value:10},{time:110,value:20},{time:120,value:20}]);
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
 assert.deepEqual(minute,[{time:940,value:10},{time:942,value:10},{time:943,value:12},{time:980,value:12},{time:981,value:9},{time:989,value:9},{time:990,value:11},{time:1000,value:11}]);
 assert.deepEqual(rollingChartPoints([],[],2,1000,300,{time:500,close:7}),[{time:700,value:14},{time:1000,value:14}]);
 assert.deepEqual(rollingChartPoints([],[],1,1000,60),[]);
 assert.deepEqual(rollingChartPoints([{time:981,close:9}],[{time:981,value:10},{time:1001,value:20}],1,1000,60),[{time:981,value:9},{time:981,value:10},{time:1000,value:10}]);
});
test('rounded spline joins have continuous tangents, exact endpoints and no values outside the observed range',()=>{
 const points=[{x:0,y:10},{x:1,y:20},{x:2,y:12},{x:3,y:18}],segments=smoothChartSegments(points);
 assert.equal(segments[0].x1,0);assert.equal(segments[0].y1,10);assert.equal(segments.at(-1).x,3);assert.equal(segments.at(-1).y,18);
 for(let i=0;i<segments.length;i++){
  const s=segments[i];for(const y of [s.y1,s.y2,s.y])assert(y>=10&&y<=20);
  if(i+1<segments.length){const next=segments[i+1];assert(Math.abs((s.x-s.x2)-(next.x1-s.x))<1e-12);assert(Math.abs((s.y-s.y2)-(next.y1-s.y))<1e-12);}
 }
 assert.deepEqual(smoothChartSegments([{x:0,y:1}]),[]);
});
test('a quiet hour keeps the last price flat instead of redrawing it as a gradual hour-long move',()=>{
 const points=rollingChartPoints([{time:100,close:10},{time:3600,close:20}],[],1,3700,3600,{time:0,close:10});
 assert.deepEqual(points,[{time:100,value:10},{time:3540,value:10},{time:3600,value:20},{time:3700,value:20}]);
});
