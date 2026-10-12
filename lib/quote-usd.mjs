import {currentIndexerExecution} from './indexer-execution.mjs';
/** Quote-asset USD only. Token USD is derived from Grainpad quote prices. wXMR is never priced as XMR. */
import {QUOTES} from './quote-assets.mjs';
import {sharedMarketCache,takeBudget} from './shared-market-cache.mjs';

export const QUOTE_USD_FRESH_MS=60_000;
export const QUOTE_USD_STALE_MS=600_000;
export const SOL_USD_NOTE='USD price of SOL, the quote asset. Token USD is this price times the grainpad quote price.';
export const WXMR_USD_NOTE='USD price of the wXMR mint on Solana from a public mint-price feed. It is not the XMR spot price, and grainpad does not verify bridge backing.';
const JUPITER='https://lite-api.jup.ag/price/v3?ids=';
const COINBASE='https://api.coinbase.com/v2/prices/SOL-USD/spot';

export function quoteFreshness(updatedAt,now=Date.now()){
 const age=now-updatedAt;
 if(!Number.isFinite(age)||age<0)return 'expired';
 if(age<=QUOTE_USD_FRESH_MS)return 'fresh';
 if(age<=QUOTE_USD_STALE_MS)return 'stale';
 return 'expired';
}
export function parseJupiterPrice(body,mint){
 const row=body&&typeof body==='object'?body[mint]:null;
 const price=Number(row?.usdPrice);
 if(!Number.isFinite(price)||price<=0)return null;
 return {price,source:'jupiter-lite'};
}
export function parseCoinbaseSol(body){
 const price=Number(body?.data?.amount);
 if(body?.data?.base!=='SOL'||body?.data?.currency!=='USD'||!Number.isFinite(price)||price<=0)return null;
 return {price,source:'coinbase-sol-usd'};
}
function stamp(symbol,mint,parsed,updatedAt,now){
 if(!parsed)return null;
 return {symbol,mint,...parsed,updatedAt,freshness:quoteFreshness(updatedAt,now),note:symbol==='wXMR'?WXMR_USD_NOTE:SOL_USD_NOTE};
}
export async function fetchQuoteUsd(fetchImpl=fetch,now=Date.now(),{signal=currentIndexerExecution()?.signal}={}){
 const sol=QUOTES.SOL.mint,wxmr=QUOTES.wXMR.mint;
 const check=()=>{if(signal?.aborted)throw Error('Quote USD request cancelled.');currentIndexerExecution()?.check();};
 async function read(url){
  check();const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000);
  const response=await fetchImpl(url,{signal:requestSignal});
  if(requestSignal.aborted){await response.body?.cancel();throw Error('Quote USD request cancelled.');}
  if(!response.ok){await response.body?.cancel();throw Error('Quote USD provider unavailable.');}
  const reader=response.body?.getReader();if(!reader)throw Error('Quote USD response body unavailable.');
  let bytes=0;const chunks=[];const abort=()=>{void reader.cancel().catch(()=>{});};requestSignal.addEventListener('abort',abort,{once:true});
  try{
   for(;;){check();if(requestSignal.aborted)throw Error('Quote USD request cancelled.');const chunk=await reader.read();check();if(requestSignal.aborted)throw Error('Quote USD request cancelled.');if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>65536)throw Error('Quote USD response exceeds bound.');chunks.push(chunk.value);}
   const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(joined));
  }catch(error){await reader.cancel();throw error;}finally{requestSignal.removeEventListener('abort',abort);reader.releaseLock();}
 }
 let jupiter=null;try{jupiter=await read(JUPITER+sol+','+wxmr);}catch{check();}
 check();const prices={SOL:stamp('SOL',sol,jupiter&&parseJupiterPrice(jupiter,sol),now,now),wXMR:stamp('wXMR',wxmr,jupiter&&parseJupiterPrice(jupiter,wxmr),now,now)};
 if(!prices.SOL){check();try{prices.SOL=stamp('SOL',sol,parseCoinbaseSol(await read(COINBASE)),now,now);}catch{check();}}
 check();return prices;
}
export function applyQuoteFreshness(prices,updatedAt,now=Date.now()){
 const freshness=quoteFreshness(updatedAt,now);
 const mark=row=>row?{...row,updatedAt,freshness}:null;
 return {SOL:mark(prices?.SOL),wXMR:mark(prices?.wXMR)};
}
export async function loadQuoteUsd(db,{refresh=true,fetchImpl=fetch,now=()=>Date.now()}={}){
 const result=await sharedMarketCache(db,'quote-usd:v1',async()=>{
  if(!await takeBudget(db,'quote-usd',1,6,60_000,now()))throw Error('Quote price provider is busy.');
  const prices=await fetchQuoteUsd(fetchImpl,now());
  if(!prices.SOL&&!prices.wXMR)throw Error('Quote USD prices are unavailable.');
  return prices;
 },{ttl:QUOTE_USD_FRESH_MS,maxStale:QUOTE_USD_STALE_MS,refresh,now});
 return applyQuoteFreshness(result.data,result.updatedAt,now());
}
export function quoteUsdFor(prices,symbol){return prices?.[symbol]||null;}
