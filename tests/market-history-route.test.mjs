import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const mint='A'.repeat(32),pool='B'.repeat(32),quote='C'.repeat(32);
let fetched=0,loaded=0;
globalThis.marketHistoryTest={market:{pool,mint,quote:{mint:quote,symbol:'SOL'},chart:{available:false},stale:false,activity:'unknown',updatedAt:123},serverMarket:async()=>{loaded++;return globalThis.marketHistoryTest.market;},native:{rows:[],events:[],coverage:{status:'not-indexed',notice:'Trade history is not indexed yet. That is not the same as no trades.'}}};
await build({entryPoints:['app/api/market/[mint]/history/route.ts'],outfile:'.test-output/market-history-route.mjs',bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'history-boundaries',setup(b){
 const stubs={
  '@/lib/chart-trade-decoder.mjs':'export const decodeChartTrades=async()=>[];',
  '@/lib/chart-backfill.mjs':'export const backfillChartTrades=async()=>({data:{processed:0,trades:0}});',
  '@/lib/server-market':'export const serverMarket=(...a)=>globalThis.marketHistoryTest.serverMarket(...a);',
  '@/lib/server-owner':'export const database=()=>({prepare:()=>({bind:()=>({first:async()=>null})})});',
  '@/lib/server-cache':'export const sharedMarketCache=async(db,key,load,options)=>{globalThis.marketHistoryTest.refresh=options.refresh;if(!options.refresh)throw Error("No visible viewer");return {data:await load(),updatedAt:123,stale:false};};',
  '@/lib/shared-market-cache.mjs':'export const takeBudget=async()=>globalThis.marketHistoryTest.budget!==false;',
  '@/lib/native-history.mjs':'export const readNativeHistory=async(db,mint,options)=>{globalThis.marketHistoryTest.historyOptions=options;return globalThis.marketHistoryTest.native;};export const lifetimeWindow=async(db,mint,options)=>{globalThis.marketHistoryTest.lifetimeOptions=options;return {seconds:1800,range:3*86400+1800,first:1};};export const geckoFallbackAllowed=(createdAt,coverage,rowCount,now)=>!(rowCount>0||coverage?.status==="no-trades"||coverage?.status==="indexed");',
  '@/lib/realtime-ingest.mjs':'export const confirmedCatchup=async()=>[];export const mergeIndexedAndConfirmed=(indexed=[])=>indexed;',
  '@/lib/server-rpc':'export const chain=async()=>[];export const chartHistoryRead=chain;',
  '@/lib/platform-policy':'export const POLICY={cpConfig:"config"};export const grainpadPlatformId=()=>({toBase58:()=>"platform"});'
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

test('day view requests intraday resolution bounded to the past 24 hours; incompatible ranges are refused',async()=>{
 globalThis.marketHistoryTest.native={rows:[{time:100,close:1}],events:[],coverage:{status:'indexed'}};
 let response=await call('interval=5m&range=1d',false);assert.equal(response.status,200);
 assert.equal(globalThis.marketHistoryTest.historyOptions.seconds,300);assert.equal(globalThis.marketHistoryTest.historyOptions.rangeSeconds,86400);
 for(const query of ['interval=1d&range=1d','interval=5m&range=1w','kind=trades&interval=5m&range=1d']){response=await call(query,false);assert.equal(response.status,400);}
});

test('All requests the lifetime window the server picks; other lifetime shapes are refused',async()=>{
 globalThis.marketHistoryTest.native={rows:[{time:100,close:1}],events:[],coverage:{status:'indexed'}};
 const response=await call('interval=1h&range=all&bars=90',false);assert.equal(response.status,200);
 assert.equal(globalThis.marketHistoryTest.lifetimeOptions.bars,90);
 const options=globalThis.marketHistoryTest.historyOptions;assert.equal(options.lifetime,true);assert.equal(options.seconds,1800);assert.equal(options.rangeSeconds,3*86400+1800);
 assert.deepEqual((await response.json()).window,{seconds:3*86400+1800,resolution:1800});
 for(const query of ['interval=5m&range=all','interval=1h&range=all&bars=5','interval=1h&range=all&bars=999','kind=trades&interval=1h&range=all']){assert.equal((await call(query,false)).status,400,query);}
});

test('minute and five-minute buttons request the actual durations at intraminute resolution',async()=>{
 globalThis.marketHistoryTest.native={rows:[],events:[],coverage:{status:'indexed'}};
 for(const [range,seconds,duration] of [['1m',1,60],['5m',5,300],['1h',60,3600]]){
  const response=await call(`interval=${range}&range=${range}`,false);assert.equal(response.status,200);
  assert.equal(globalThis.marketHistoryTest.historyOptions.seconds,seconds);assert.equal(globalThis.marketHistoryTest.historyOptions.rangeSeconds,duration);
 }
 assert.equal((await call('interval=1m&range=5m',false)).status,400);
});


test('live candles load the entire moving two-minute window at one-second resolution',async()=>{
 globalThis.marketHistoryTest.native={rows:[],events:[],coverage:{status:'indexed'}};
 const response=await call('interval=1m&range=live',false);assert.equal(response.status,200);
 assert.equal(globalThis.marketHistoryTest.historyOptions.seconds,1);assert.equal(globalThis.marketHistoryTest.historyOptions.rangeSeconds,120);
});

test('an explicit external series has actual USD candles and declares its real candle duration',async()=>{
 const original=globalThis.fetch;globalThis.marketHistoryTest.market.chart.available=true;
 globalThis.marketHistoryTest.native={rows:[{time:100,close:.0001}],events:[],coverage:{status:'indexed'}};
 globalThis.fetch=async()=>({ok:true,json:async()=>({data:{attributes:{ohlcv_list:[[Math.floor(Date.now()/1000)-10,1,3,.5,2,10]]}}})});
 try{const response=await call('interval=1m&range=1m&source=external');const data=await response.json();assert.equal(data.source,'geckoterminal');assert.equal(data.unit,'usd');assert.equal(data.rows[0].close,2);assert.equal(data.window.resolution,60);}
 finally{globalThis.fetch=original;globalThis.marketHistoryTest.market.chart.available=false;}
});
