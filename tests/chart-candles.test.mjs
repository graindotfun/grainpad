import test from 'node:test';
import assert from 'node:assert/strict';
import {chartCandles,chartPreferences,DEFAULT_CHART_PREFERENCES,candleSeconds,chartRequest} from '../lib/chart-candles.mjs';
const event=(id,time,value,slot)=>({id,time,value,slot});
test('same-second trades retain the first open, both extremes and the latest close without counting replays',()=>{
 const a=event('a',101,10,1),b=event('b',101,16,2),c=event('c',101,8,3),d=event('d',101,12,4);
 const candles=chartCandles([], [d,b,a,c,a],2,110,60);
 assert.equal(candles.filter(row=>!row.carried).length,1);assert.deepEqual([candles[0].time,candles[0].open,candles[0].high,candles[0].low,candles[0].close],[101,20,32,16,24]);
});
test('confirmed continuation updates a finalized candle once, preserving its first execution and extremes',()=>{
 const rows=[{time:100,open:10,high:12,low:9,close:11,lastTime:102,lastSlot:3,lastId:'c'}],before=JSON.stringify(rows);
 const candles=chartCandles(rows,[event('c',102,11,3),event('d',102,15,4),event('e',103,8,5)],1,110,300);
 assert.deepEqual([candles[0].open,candles[0].high,candles[0].low,candles[0].close],[10,15,8,8]);assert.equal(JSON.stringify(rows),before);
});
test('unknown periods stay empty; a partially visible real bucket remains available',()=>{
 assert.deepEqual(chartCandles([],[],1,100,60),[]);
 const row={time:95,open:2,high:3,low:1,close:2};
 assert.equal(chartCandles([row],[],1,398,300).filter(row=>!row.carried).length,1);assert.equal(chartCandles([row],[],1,400,300).filter(row=>!row.carried).length,0);
 for(const multiplier of [0,NaN,Infinity])assert.deepEqual(chartCandles([row],[],multiplier,100,60),[]);
 assert.deepEqual(chartCandles([{...row,high:1}],[],1,100,60),[]);
 assert.deepEqual(chartCandles([{time:95,open:1e308,high:1e308,low:1e308,close:1e308}],[],10,100,60),[]);
});
test('the selected duration uses real fine buckets, while external candles preserve their declared resolution',()=>{
 assert.deepEqual([60,120,300,3600,86400].map(candleSeconds),[1,1,5,60,300]);
 const events=[event('a',100,2,1),event('b',104,3,2)];
 assert.equal(chartCandles([],events,1,110,60).filter(row=>!row.carried).length,2);assert.equal(chartCandles([],events,1,110,300).filter(row=>!row.carried).length,1);
 const external={time:60,open:2,high:3,low:1,close:2};assert.equal(chartCandles([external],[],1,130,60,60).filter(row=>!row.carried).length,1);
});
test('custom up/down colors and chart mode survive storage, while malformed or executable colors are rejected',()=>{
 const selected={type:'candles',up:'#ABCDEF',down:'#123456'};
 assert.deepEqual(chartPreferences(JSON.stringify(selected)),{...selected,up:'#abcdef'});
 for(const value of [null,'{','[]',JSON.stringify({type:'unsupported',up:'url(secret)',down:'#fff'})])assert.deepEqual(chartPreferences(value),DEFAULT_CHART_PREFERENCES);
});
test('actual candle SVG uses custom directional colors, separate wicks and rounded bodies',async()=>{
 const {build}=await import('esbuild'),{createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 await build({entryPoints:['components/candlestick-market-chart.tsx'],outfile:'.test-output/candle-geometry-review.mjs',bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[{name:'chart-coordinates',setup(b){
  b.onResolve({filter:/^recharts$/},()=>({path:'chart-scales',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export const usePlotArea=()=>({x:0,y:0,width:600,height:100});export const useXAxisScale=()=>time=>time;export const useYAxisScale=()=>price=>100-price*2;export const Area=()=>null,CartesianGrid=()=>null,ComposedChart=()=>null,ReferenceLine=()=>null,ResponsiveContainer=()=>null,Tooltip=()=>null,XAxis=()=>null,YAxis=()=>null;'}));
 }}]});
 const {CandleBodies}=await import('../.test-output/candle-geometry-review.mjs');
 const candles=[{time:100,open:10,high:16,low:9,close:14},{time:105,open:14,high:15,low:8,close:9}];
 const html=renderToStaticMarkup(createElement('svg',null,createElement(CandleBodies,{candles,colors:{up:'#abcdef',down:'#fedcba'},interval:300,resolution:5})));
 assert.match(html,/y1="68" y2="82" stroke="#abcdef"/);assert.match(html,/y="72"[^>]*height="8"[^>]*rx="1\.5" fill="#abcdef"/);
 assert.match(html,/y1="70" y2="84" stroke="#fedcba"/);assert.match(html,/stroke-linecap="round"/);assert.match(html,/fill="#fedcba"/);
 const day=renderToStaticMarkup(createElement('svg',null,createElement(CandleBodies,{candles,colors:{up:'#abcdef',down:'#fedcba'},interval:86400,resolution:300})));
 const bodyWidths=[...day.matchAll(/<rect[^>]*width="([\d.]+)"[^>]*height="(?:8|10)"/g)].map(match=>Number(match[1]));assert.equal(bodyWidths.length,2);assert.ok(bodyWidths.every(width=>width>0&&width<2));
});

test('candle selectors mean minutes/hours/days per bar independently from line windows',()=>{
 for(const seconds of [60,300,3600,86400]){const spec=chartRequest(seconds,'candles');assert.equal(spec.resolution,seconds);assert.equal(spec.window,seconds*60);assert.ok(!spec.query.includes('range='));assert.equal(chartRequest(seconds,'line').window,seconds);}
 assert.deepEqual(chartRequest(0,'candles'),{query:'interval=1m&range=live',window:120,resolution:1});
});
test('real hour candles aggregate trades and carry previous close through explicitly flat periods',()=>{
 const spec=chartRequest(3600,'candles'),now=10800;
 const candles=chartCandles([], [event('a',100,10,1),event('b',3500,12,2),event('c',7300,8,3)],1,now,spec.window,spec.resolution);
 assert.deepEqual(candles.map(row=>row.time),[0,3600,7200,10800]);
 assert.deepEqual(candles.map(row=>[row.open,row.high,row.low,row.close]),[[10,12,10,12],[12,12,12,12],[12,12,8,8],[8,8,8,8]]);
 assert.equal(candles[1].carried,true);assert.equal(candles[1].trades,undefined);assert.equal(candles[1].volume,undefined);
 const anchored=chartCandles([],[],1,300,300,5,{time:0,close:4});assert.equal(anchored.length,61);assert.ok(anchored.every(row=>row.carried&&row.open===4&&row.close===4));
});

test('market module sends the complete mode-specific query without duplicating interval',async()=>{
 const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../components/market-module.tsx',import.meta.url),'utf8');
 assert.ok(source.includes('history?kind=candles&${query}'));assert.ok(!source.includes('interval=${query}'));
});
