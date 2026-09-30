import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const mint='A'.repeat(32),pool='B'.repeat(32),quote='C'.repeat(32);
let fetched=0,loaded=0;
globalThis.marketHistoryTest={market:{pool,mint,quote:{mint:quote,symbol:'SOL'},chart:{available:false},stale:false,activity:'unknown',updatedAt:123},serverMarket:async()=>{loaded++;return globalThis.marketHistoryTest.market;},native:{rows:[],events:[],coverage:{status:'not-indexed',notice:'Trade history is not indexed yet. That is not the same as no trades.'}}};
await build({entryPoints:['app/api/market/[mint]/history/route.ts'],outfile:'.test-output/market-history-route.mjs',bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'history-boundaries',setup(b){
 const stubs={
  '@/lib/server-market':'export const serverMarket=(...a)=>globalThis.marketHistoryTest.serverMarket(...a);',
  '@/lib/server-owner':'export const database=()=>({});',
  '@/lib/server-cache':'export const sharedMarketCache=async(db,key,load,options)=>{globalThis.marketHistoryTest.refresh=options.refresh;if(!options.refresh)throw Error("No visible viewer");return {data:await load(),updatedAt:123,stale:false};};',
  '@/lib/shared-market-cache.mjs':'export const takeBudget=async()=>globalThis.marketHistoryTest.budget!==false;',
  '@/lib/native-history.mjs':'export const readNativeHistory=async()=>globalThis.marketHistoryTest.native;export const geckoFallbackAllowed=(createdAt,coverage,rowCount,now)=>!(rowCount>0||coverage?.status==="no-trades"||coverage?.status==="indexed");',
  '@/lib/realtime-ingest.mjs':'export const confirmedCatchup=async()=>[];export const mergeIndexedAndConfirmed=(indexed=[])=>indexed;',
  '@/lib/server-rpc':'export const chain=async()=>[];',
  '@/lib/platform-policy':'export const grainpadPlatformId=()=>({toBase58:()=>"platform"});'
 };b.onResolve({filter:/^@\/lib\//},a=>a.path in stubs?{path:a.path,namespace:'stub'}:null);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js'}));
}}]});
const {GET}=await import('../.test-output/market-history-route.mjs');
const call=(query,visible=true)=>GET(new Request('https://local.test/api/market/'+mint+'/history?'+query,{headers:visible?{'X-Grainpad-Viewer':'visible'}:{}}),{params:Promise.resolve({mint})});
test('native candles are served without GeckoTerminal, which remains a fallback only',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async url=>{fetched++;assert.ok(String(url).includes('/pools/'+pool+'/ohlcv/hour?aggregate=1'));return {ok:true,json:async()=>({data:{attributes:{ohlcv_list:[[100,1,3,.5,2,10]]}}})}};
 try{
  let r=await call('interval=arbitrary');assert.equal(r.status,400);assert.equal(loaded,0);assert.equal(fetched,0);
  globalThis.marketHistoryTest.serverMarket=async()=>{throw Error('Foreign platform');};r=await call('interval=1h');assert.equal(r.status,503);assert.equal(fetched,0);
  globalThis.marketHistoryTest.serverMarket=async()=>globalThis.marketHistoryTest.market;
  globalThis.marketHistoryTest.native={rows:[{time:100,open:1,high:1,low:1,close:1,volume:2,trades:1,sources:['curve']}],events:[],coverage:{status:'indexed',notice:'Finalized trades indexed by Grainpad. Empty periods are not filled in.'}};
  r=await call('interval=1h');assert.equal(r.status,200);const native=await r.json();assert.equal(native.source,'grainpad');assert.equal(native.rows[0].close,1);assert.equal(fetched,0);
  globalThis.marketHistoryTest.native={rows:[],events:[],coverage:{status:'no-trades',notice:'No trades yet. The launch account shows creation only.'}};
  r=await call('interval=1h');assert.equal((await r.json()).coverage.status,'no-trades');assert.equal(fetched,0);
  globalThis.marketHistoryTest.native={rows:[],events:[],coverage:{status:'not-indexed',notice:'Trade history is not indexed yet. That is not the same as no trades.'}};
  r=await call('interval=1h',false);assert.equal(r.status,200);const missed=await r.json();assert.equal(missed.source,'grainpad');assert.equal(missed.coverage.status,'not-indexed');assert.deepEqual(missed.rows,[]);assert.equal(fetched,0);
  globalThis.marketHistoryTest.budget=false;r=await call('interval=1h');assert.equal(r.status,200);assert.equal((await r.json()).coverage.status,'not-indexed');assert.equal(fetched,0);
  globalThis.fetch=async()=>{fetched++;throw Error('GeckoTerminal down');};
  globalThis.marketHistoryTest.budget=true;r=await call('interval=1h');assert.equal(r.status,200);const down=await r.json();assert.equal(down.source,'grainpad');assert.equal(down.coverage.status,'not-indexed');assert.equal(down.rows.length,0);assert.equal(fetched,1);
  globalThis.fetch=async url=>{fetched++;assert.ok(String(url).includes('/pools/'+pool+'/ohlcv/hour?aggregate=1'));return {ok:true,json:async()=>({data:{attributes:{ohlcv_list:[[100,1,3,.5,2,10]]}}})}};
  r=await call('interval=1h');assert.equal(r.status,200);const body=await r.json();assert.equal(body.source,'geckoterminal');assert.equal(body.rows[0].close,2);
 }finally{globalThis.fetch=original;}
});
