import {sharedMarketCache,takeBudget} from './shared-market-cache.mjs';
/** XMR/USD spot and short history for the grainpet wall chart. Server side only: the page never calls a price provider itself.
 *  Provider: Kraken public market data (no key). This is the XMR spot price; it is never derived from the wXMR mint price. */
export const XMR_USD_SOURCE='Kraken XMR/USD';
export const XMR_USD_SOURCE_URL='https://www.kraken.com/prices/monero';
export const XMR_USD_FRESH_MS=60_000,XMR_USD_STALE_MS=6*60*60*1000;
const TICKER='https://api.kraken.com/0/public/Ticker?pair=XMRUSD';
const OHLC='https://api.kraken.com/0/public/OHLC?pair=XMRUSD&interval=60';
const finitePositive=v=>Number.isFinite(v)&&v>0;
export function parseKrakenTicker(body){
 if(!body||typeof body!=='object'||(Array.isArray(body.error)&&body.error.length))return null;
 const row=body.result&&Object.values(body.result)[0],price=Number(row?.c?.[0]);
 return finitePositive(price)?price:null;
}
/** Hourly closes, oldest first. Kraken candle: [time, open, high, low, close, vwap, volume, count]. */
export function parseKrakenOhlc(body){
 if(!body||typeof body!=='object'||(Array.isArray(body.error)&&body.error.length))return null;
 const key=Object.keys(body.result||{}).find(k=>k!=='last'),rows=key?body.result[key]:null;
 if(!Array.isArray(rows))return null;
 const closes=rows.map(r=>Number(Array.isArray(r)?r[4]:NaN));
 return closes.length>=24&&closes.every(finitePositive)?closes:null;
}
const pct=(a,b)=>+(((b-a)/a)*100).toFixed(2);
/** @returns {{usd:number,change24h:number,change7d:number,source:string,sourceUrl:string,h24:number[],d7:number[]}|null} */
export function buildXmrReading(spot,closes){
 if(!finitePositive(spot)||!closes||closes.length<25)return null;
 const hours=[...closes.slice(0,-1),spot];                 // the open candle is replaced by the spot reading
 const h24=hours.slice(-24).map(v=>+v.toFixed(2));
 const week=hours.slice(-168);
 const d7=week.filter((_,i)=>(week.length-1-i)%2===0).map(v=>+v.toFixed(2));   // every second hour, always ending on the spot
 return {usd:+spot.toFixed(2),change24h:pct(h24[0],h24[h24.length-1]),change7d:pct(d7[0],d7[d7.length-1]),source:XMR_USD_SOURCE,sourceUrl:XMR_USD_SOURCE_URL,h24,d7};
}
async function read(fetchImpl,url,signal){
 const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000);
 const response=await fetchImpl(url,{signal:requestSignal,headers:{Accept:'application/json'}});
 if(!response.ok){await response.body?.cancel();throw Error('XMR price provider unavailable.');}
 const text=await response.text();if(text.length>400_000)throw Error('XMR price response too large.');
 return JSON.parse(text);
}
export async function fetchXmrUsd(fetchImpl=fetch,{signal}={}){
 const [ticker,ohlc]=await Promise.all([read(fetchImpl,TICKER,signal),read(fetchImpl,OHLC,signal)]);
 const reading=buildXmrReading(parseKrakenTicker(ticker),parseKrakenOhlc(ohlc));
 if(!reading)throw Error('XMR price unavailable.');
 return reading;
}
/** One shared reading per minute across all visitors and Worker instances; an old reading is served (marked by its own timestamp) for up to six hours when the provider is down. */
export async function loadXmrUsd(db,{refresh=true,fetchImpl=fetch,now=()=>Date.now()}={}){
 const result=await sharedMarketCache(db,'xmr-usd:v1',async()=>{
  if(!await takeBudget(db,'xmr-usd',1,6,60_000,now()))throw Error('XMR price provider is busy.');
  return fetchXmrUsd(fetchImpl);
 },{ttl:XMR_USD_FRESH_MS,maxStale:XMR_USD_STALE_MS,refresh,now});
 return {...result.data,updated:result.updatedAt};
}
