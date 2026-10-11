import test from 'node:test';
import assert from 'node:assert/strict';
import {marketMetricSeries} from '../lib/market-metric.mjs';
import {tapeLedgerRows} from '../lib/tape-ledger.mjs';
const rows=[{time:60,close:.001},{time:120,close:.002}];
const native={nativePrice:.002,nativeMarketCap:2000000,quoteUsd:{price:150,source:'fixture',freshness:'fresh'}};
test('price↔market cap transforms actual plotted axis values using current supply, preserving times',()=>{
 const price=marketMetricSeries(rows,{...native,metric:'price'}),cap=marketMetricSeries(rows,{...native,metric:'market-cap'});
 assert.deepEqual(price.points,[{time:60,value:.001},{time:120,value:.002}]);assert.equal(price.usd,false);
 assert.equal(cap.supply,1e9);assert.deepEqual(cap.points,[{time:60,value:150000000},{time:120,value:300000000}]);assert.equal(cap.usd,true);assert.equal(cap.estimatedUsd,true);
 // Refreshing currentconversion rescales the whole series; no historicUSD assertion.
 const next=marketMetricSeries(rows,{...native,metric:'market-cap',quoteUsd:{...native.quoteUsd,price:200}});assert.equal(next.points[0].value,200000000);assert.deepEqual(rows,[{time:60,close:.001},{time:120,close:.002}]);
});
test('USD history is never multiplied by quote USD a second time',()=>{
 const result=marketMetricSeries(rows,{...native,metric:'market-cap',usdSeries:true});assert.equal(result.estimatedUsd,false);assert.equal(result.usd,true);assert.equal(result.points[0].value,1000000);
});
test('missing/expired USD conversion stays in quote units; missing supply never invents cap',()=>{
 for(const quoteUsd of [null,{price:150,freshness:'expired'},{price:NaN,freshness:'fresh'}]){const cap=marketMetricSeries(rows,{...native,metric:'market-cap',quoteUsd});assert.equal(cap.estimatedUsd,false);assert.equal(cap.usd,false);assert.equal(cap.points[0].value,1000000);}
 for(const nativePrice of [null,0,NaN]){const cap=marketMetricSeries(rows,{...native,metric:'market-cap',nativePrice});assert.equal(cap.available,false);assert.deepEqual(cap.points,[]);}
});
const event=(id,signature,slot)=>({id,signature,slot});
test('zero finalized plus three confirmed yields separate truthful counts',()=>{
 const pending=[event('a','a',1),event('b','b',2),event('c','c',3)],result=tapeLedgerRows([],[],pending);assert.equal(result.finalized.length,0);assert.equal(result.confirmed.length,3);assert.deepEqual(result.confirmed,pending);
});
test('confirmed→finalized transition dedupes both current and older pages, preserving distinct finalized events',()=>{
 const a=event('a','same',10),b=event('b','older',8),c=event('fee','same',10);
 const result=tapeLedgerRows([a,c],[a,b],[event('catchup-a','same',11),event('catchup-b','older',11),event('fresh','fresh',12),event('fresh','fresh',12)]);
 assert.equal(result.finalized.length,3);assert.deepEqual(result.confirmed,[event('fresh','fresh',12)]);assert.deepEqual(result.finalized.map(x=>x.id),['fee','a','b']);
});

test('actual Tape render labels confirmed rows separately from zero finalized records',async()=>{
 const {build}=await import('esbuild'),{createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 await build({entryPoints:['components/native-tape.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.test-output/tape-count-review.mjs',logLevel:'silent'});
 const {NativeTape}=await import('../.test-output/tape-count-review.mjs');
 const pending=[0,1,2].map(i=>({id:'pending-'+i,signature:'signature-'+i,kind:i===2?'sell':'buy',source:'curve',wallet:'public-fixture-wallet',slot:100+i,blockTime:1000+i,provisional:true,display:{quote:.001,tokens:100}}));
 const html=renderToStaticMarkup(createElement(NativeTape,{mint:'fixture-mint',symbol:'GRAINU',feed:{data:{events:[],nextCursor:null,coverage:'Partial fixture',quote:'wXMR'},pending,error:'',updatedAt:1000}}));
 assert.match(html,/0 finalized · 3 confirmed/);assert.equal((html.match(/class="ledger-row /g)||[]).length,3);assert.doesNotMatch(html,/0 records/);
});

test('actual market outage render keeps verified wXMR pair and does not invent zero trades or a SOL pair',async()=>{
 const {build}=await import('esbuild'),{createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 await build({entryPoints:['components/market-module.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.test-output/market-outage-review.mjs',logLevel:'silent'});
 const {MarketModule}=await import('../.test-output/market-outage-review.mjs');
 const props={market:null,mint:'fixture-mint',quoteSymbol:'wXMR',error:'Market temporarily unavailable',seconds:300,setSeconds:()=>{}};
 const html=renderToStaticMarkup(createElement(MarketModule,props));
 assert.match(html,/on-chain · (?:<span class="gx-word">)?wXMR/);assert.match(html,/<dt>Pair<\/dt><dd>wXMR<\/dd>/);assert.match(html,/Price temporarily unavailable/);assert.doesNotMatch(html,/Price appears with the first trade|on-chain · SOL|<dd>SOL<\/dd>/);
 const unknown=renderToStaticMarkup(createElement(MarketModule,{...props,quoteSymbol:undefined}));assert.match(unknown,/<dt>Pair<\/dt><dd>—<\/dd>/);assert.doesNotMatch(unknown,/on-chain · SOL/);
});
