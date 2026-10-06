import {serverMarket} from '@/lib/server-market';
import {database} from '@/lib/server-owner';
import {sharedMarketCache} from '@/lib/server-cache';
import {takeBudget} from '@/lib/shared-market-cache.mjs';
import {parseCandles,parseTrades} from '@/lib/market-display';
import {geckoFallbackAllowed,readNativeHistory} from '@/lib/native-history.mjs';
import {confirmedCatchup,mergeIndexedAndConfirmed} from '@/lib/realtime-ingest.mjs';
import {buildCandles,mergeCandleHistory,recentTradeRows} from '@/lib/native-market.mjs';
import {backfillChartTrades} from '@/lib/chart-backfill.mjs';
import {POLICY} from '@/lib/platform-policy';
import {chain,chartHistoryRead} from '@/lib/server-rpc';
import {grainpadPlatformId} from '@/lib/platform-policy';
const intervals:Record<string,number>={'1m':60,'5m':300,'1h':3600,'1d':86400};
const geckoIntervals:Record<string,{timeframe:string;aggregate:number}>={'1m':{timeframe:'minute',aggregate:1},'5m':{timeframe:'minute',aggregate:5},'1h':{timeframe:'hour',aggregate:1},'1d':{timeframe:'day',aggregate:1}};
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{mint:string}>}){
 const headers={'Cache-Control':'no-store'};
 try{
  const {mint}=await params,url=new URL(request.url),kind=url.searchParams.get('kind')||'candles',interval=url.searchParams.get('interval')||'5m';
  if(!['candles','trades'].includes(kind)||!intervals[interval])return Response.json({error:'Unsupported history request.'},{status:400,headers});
  const range=url.searchParams.get('range');
  if(range!==null&&(range!=='1d'||kind!=='candles'||interval!=='5m'))return Response.json({error:'Unsupported chart range.'},{status:400,headers});
  const viewer=request.headers.get('X-Grainpad-Viewer')==='visible';
  const market=await serverMarket(mint,{viewer});
  const db=database();
  let recovery:{processed:number;trades:number;remaining:number}|undefined;
  if(viewer){
   try{const saved=await db.prepare('SELECT record FROM launch_index WHERE network=? AND platform_id=? AND mint=?').bind('mainnet-beta',grainpadPlatformId().toBase58(),mint).first<{record:string}>();
    if(saved)recovery=(await backfillChartTrades(db,chartHistoryRead,JSON.parse(saved.record),POLICY.cpConfig)).data;
   }catch{/* Keep existing verified history available while recovery retries. */}
  }
  const native=await readNativeHistory(db,mint,{kind,seconds:intervals[interval],activity:market.activity,rangeSeconds:range==='1d'?86400:null});
  let rows=native.rows,coverage=native.coverage;
  const source='grainpad',unit='quote';
  if(viewer&&coverage.status!=='no-trades'){
   try{
    const extra=await sharedMarketCache(db,`catchup:v1:${mint}`,async()=>{
     if(!await takeBudget(db,'catchup-minute',1,20,60_000))return {events:[]};
     const saved=await db.prepare('SELECT record FROM launch_index WHERE network=? AND platform_id=? AND mint=?').bind('mainnet-beta',grainpadPlatformId().toBase58(),mint).first<{record:string}>();
     if(!saved)return {events:[]};
     const record=JSON.parse(saved.record);
     record.pool=market.pool;
     const knownRows=await db.prepare(`SELECT signature FROM chain_event WHERE mint=? AND kind IN ('buy','sell') ORDER BY slot DESC LIMIT 80`).bind(mint).all<{signature:string}>();
     const events=await confirmedCatchup((method:string,params:unknown[])=>chain('mainnet-beta',method,params),record,new Set((knownRows.results||[]).map(row=>row.signature)));
     return {events};
    },{ttl:8_000,maxStale:20_000,refresh:true});
    const events=extra.data?.events||[];
    if(events.length){
     // Recheck after catch-up: finalization may have indexed a confirmed transaction meanwhile.
     const existing=await db.prepare(`SELECT id FROM chain_event WHERE mint=? AND id IN (${events.map(()=>'?').join(',')})`).bind(mint,...events.map((event:{id:string})=>event.id)).all<{id:string}>();
     const finalized=new Set((existing.results||[]).map(row=>row.id));
     const fresh=events.filter((event:{id:string})=>!finalized.has(event.id));
     const merged=mergeIndexedAndConfirmed(native.events,fresh);
     rows=kind==='candles'?(native.aggregated?mergeCandleHistory(native.rows,fresh,intervals[interval],{start:native.start,limit:native.limit}):buildCandles(merged,intervals[interval]).candles):recentTradeRows(merged,300).trades;
     if(fresh.length)coverage={...coverage,status:'partial',notice:'Includes confirmed transactions that are not finalized in the index yet. Missing history is not shown as zero.'};
    }
  }catch{/* The indexed tape remains the answer when the short catch-up cannot run. */}
  }
  let createdAt:string|undefined;
  try{const indexed=await db.prepare('SELECT record FROM launch_index WHERE network=? AND platform_id=? AND mint=?').bind('mainnet-beta',grainpadPlatformId().toBase58(),mint).first<{record:string}>();createdAt=indexed?JSON.parse(indexed.record).createdAt:undefined;}catch{createdAt=undefined;}
  if(!rows.length&&geckoFallbackAllowed(createdAt,coverage,rows.length)){
   try{
    const result=await sharedMarketCache(db,`history:v2:${market.pool}:${mint}:${kind}:${kind==='candles'?interval:'recent'}:${range||'bars'}`,async()=>{
     if(!await takeBudget(db,'gecko-minute',1,10,60_000))throw Error('Market provider is busy. Please retry shortly.');
     const period=geckoIntervals[interval];
     const path=kind==='trades'?'trades':`ohlcv/${period.timeframe}?aggregate=${period.aggregate}&limit=${range==='1d'?289:240}&currency=usd&token=base`;
     const response=await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${market.pool}/${path}`,{signal:AbortSignal.timeout(7000)});
     if(!response.ok)throw Error('Market history is temporarily unavailable.');
     const body=await response.json();
     const parsed=kind==='trades'?parseTrades(body,mint,market.quote.mint):parseCandles(body);
     return range==='1d'?parsed.filter((row:{time:number})=>row.time>=Math.floor(Date.now()/1000)-86400):parsed;
    },{ttl:60_000,maxStale:300_000,refresh:viewer});
    if(result.data.length)return Response.json({rows:result.data,available:true,stale:result.stale,updatedAt:result.updatedAt,pool:market.pool,source:'geckoterminal',unit:'usd',coverage:{status:'external-fallback',notice:'Grainpad has not indexed these trades. This external series is a fallback, not the Grainpad record.'}},{headers});
   }catch{/* A failed external fallback is not indexed history, and it is not zero trades. */}
  }
  return Response.json({rows,available:true,stale:market.stale,updatedAt:market.updatedAt,pool:market.pool,source,unit,quote:market.quote.symbol,coverage,recovery},{headers});
 }catch{return Response.json({error:'Market history is temporarily unavailable. Please try again shortly.'},{status:503,headers});}
}
