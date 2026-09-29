import {serverMarket} from '@/lib/server-market';
import {database} from '@/lib/server-owner';
import {sharedMarketCache} from '@/lib/server-cache';
import {takeBudget} from '@/lib/shared-market-cache.mjs';
import {parseCandles,parseTrades} from '@/lib/market-display';
export const dynamic='force-dynamic';
const intervals:Record<string,{timeframe:string;aggregate:number}>={'1m':{timeframe:'minute',aggregate:1},'5m':{timeframe:'minute',aggregate:5},'1h':{timeframe:'hour',aggregate:1},'1d':{timeframe:'day',aggregate:1}};
export async function GET(request:Request,{params}:{params:Promise<{mint:string}>}){
 const headers={'Cache-Control':'no-store'};
 try{
  const {mint}=await params,url=new URL(request.url),kind=url.searchParams.get('kind')||'candles',interval=url.searchParams.get('interval')||'5m';
  if(!['candles','trades'].includes(kind)||!intervals[interval])return Response.json({error:'Unsupported history request.'},{status:400,headers});
  const viewer=request.headers.get('X-Grainpad-Viewer')==='visible';
  const market=await serverMarket(mint,{viewer});
  if(!market.chart.available)return Response.json({rows:[],available:false,stale:false,pool:market.pool},{headers});
  const db=database(),period=intervals[interval];
  const result=await sharedMarketCache(db,`history:v1:${market.pool}:${mint}:${kind}:${kind==='candles'?interval:'recent'}`,async()=>{
   if(!await takeBudget(db,'gecko-minute',1,10,60_000))throw Error('Market provider is busy. Please retry shortly.');
   const path=kind==='trades'?'trades':`ohlcv/${period.timeframe}?aggregate=${period.aggregate}&limit=240&currency=usd&token=base`;
   const response=await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${market.pool}/${path}`,{signal:AbortSignal.timeout(7000)});
   if(!response.ok)throw Error('Market history is temporarily unavailable.');
   const body=await response.json();return kind==='trades'?parseTrades(body,mint,market.quote.mint):parseCandles(body);
  },{ttl:60_000,maxStale:300_000,refresh:viewer});
  return Response.json({rows:result.data,available:true,stale:result.stale||market.stale||market.chart.stale,updatedAt:result.updatedAt,pool:market.pool},{headers});
 }catch{return Response.json({error:'Market history is temporarily unavailable. Please try again shortly.'},{status:503,headers});}
}
