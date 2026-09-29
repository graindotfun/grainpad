import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const mint='A'.repeat(32),pool='B'.repeat(32),quote='C'.repeat(32);
let fetched=0,loaded=0;
globalThis.marketHistoryTest={market:{pool,mint,quote:{mint:quote},chart:{available:true},stale:false},serverMarket:async()=>{loaded++;return globalThis.marketHistoryTest.market;}};
await build({entryPoints:['app/api/market/[mint]/history/route.ts'],outfile:'.test-output/market-history-route.mjs',bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'history-boundaries',setup(b){
 const stubs={
  '@/lib/server-market':'export const serverMarket=(...a)=>globalThis.marketHistoryTest.serverMarket(...a);',
  '@/lib/server-owner':'export const database=()=>({});',
  '@/lib/server-cache':'export const sharedMarketCache=async(db,key,load,options)=>{globalThis.marketHistoryTest.refresh=options.refresh;if(!options.refresh)throw Error("No visible viewer");return {data:await load(),updatedAt:123,stale:false};};',
  '@/lib/shared-market-cache.mjs':'export const takeBudget=async()=>globalThis.marketHistoryTest.budget!==false;'
 };b.onResolve({filter:/^@\/lib\//},a=>a.path in stubs?{path:a.path,namespace:'stub'}:null);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js'}));
}}]});
const {GET}=await import('../.test-output/market-history-route.mjs');
const call=(query,visible=true)=>GET(new Request('https://local.test/api/market/'+mint+'/history?'+query,{headers:visible?{'X-Grainpad-Viewer':'visible'}:{}}),{params:Promise.resolve({mint})});
test('history validates requests and pool membership before contacting the provider',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async url=>{fetched++;assert.ok(String(url).includes('/pools/'+pool+'/ohlcv/hour?aggregate=1'));return {ok:true,json:async()=>({data:{attributes:{ohlcv_list:[[100,1,3,.5,2,10]]}}})}};
 try{
  let r=await call('interval=arbitrary');assert.equal(r.status,400);assert.equal(loaded,0);assert.equal(fetched,0);
  globalThis.marketHistoryTest.serverMarket=async()=>{throw Error('Foreign platform');};r=await call('interval=1h');assert.equal(r.status,503);assert.equal(fetched,0);
  globalThis.marketHistoryTest.serverMarket=async()=>globalThis.marketHistoryTest.market;
  globalThis.marketHistoryTest.market.chart.available=false;r=await call('interval=1h');assert.equal((await r.json()).available,false);assert.equal(fetched,0);
  globalThis.marketHistoryTest.market.chart.available=true;r=await call('interval=1h',false);assert.equal(r.status,503);assert.equal(fetched,0);
  globalThis.marketHistoryTest.budget=false;r=await call('interval=1h');assert.equal(r.status,503);assert.equal(fetched,0);
  globalThis.marketHistoryTest.budget=true;r=await call('interval=1h');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const body=await r.json();assert.equal(body.pool,pool);assert.equal(body.rows[0].close,2);assert.equal(fetched,1);
 }finally{globalThis.fetch=original;}
});
