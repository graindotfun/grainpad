/** Request-driven catch-up. No always-on websocket is provisioned. */
import {POLICY} from './platform-policy.mjs';
import {parseChainEvents} from './chain-events.mjs';

export const LAUNCH_LATENCY={
 priceMarketCapLiquidityProgress:'Curve and CPMM reserves are read from the launch accounts. A Grainpad launch is registered after those accounts finalize, typically within about 12–20 seconds of the transaction. A visible token page refreshes that shared snapshot about every 15 seconds. Dexscreener and GeckoTerminal are not on this path.',
 firstTrades:'While a token page is open, Grainpad reads up to three new confirmed pool transactions and caches that read for 8 seconds. Those rows are labeled confirmed, not finalized. The existing one-minute indexer writes the finalized copy. Solana finalization is about 12 seconds after confirmation.',
 homepageTape:'The homepage tape refreshes about every 15 seconds from the cached Grainpad snapshot and the quote-asset USD price. It does not call Dexscreener.',
 notProvisioned:'logsSubscribe, programSubscribe, accountSubscribe and provider webhooks are not running. They would need an approved always-on connection. Cloudflare cron cannot run faster than once a minute, so the page-open read is the fast path.',
};

export function launchWatchFilter(platformId){
 if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(platformId||''))throw Error('Platform id required.');
 return {commitment:'confirmed',logs:{mentions:[platformId]},accounts:'The launch curve pool, and the CPMM pool after graduation.',note:'Subscribe only to Grainpad PlatformConfig mentions and that token’s pools. Do not subscribe to all Solana transactions.'};
}
export function selectNewSignatures(page,known,limit=3){
 if(!Array.isArray(page)||!Number.isInteger(limit)||limit<1)return [];
 const out=[];
 for(const row of page){
  if(!row||row.err||typeof row.signature!=='string'||known?.has(row.signature))continue;
  out.push(row.signature);
  if(out.length>=limit)break;
 }
 return out;
}
export async function confirmedCatchup(rpc,record,known,cpConfig=POLICY.cpConfig,{signatures=5,transactions=3}={}){
 if(!record?.pool||!record?.mint)return [];
 const page=await rpc('getSignaturesForAddress',[record.pool,{limit:signatures,commitment:'confirmed'}]);
 const fresh=selectNewSignatures(page,known,transactions);
 const events=[];
 for(const signature of fresh){
  try{
   const tx=await rpc('getTransaction',[signature,{encoding:'json',commitment:'confirmed',maxSupportedTransactionVersion:0}]);
   if(!tx||tx.meta?.err)continue;
   events.push(...parseChainEvents(tx,signature,[record],cpConfig,record.platformId).filter(event=>event.kind==='buy'||event.kind==='sell').map(event=>({...event,provisional:true})));
  }catch{/* One unparsable transaction does not erase the indexed tape. */}
 }
 return events;
}
/** A confirmed copy of a trade already stored in the finalized index must not be appended. */
export function mergeIndexedAndConfirmed(indexed,confirmed){
 const rows=indexed||[],seenIds=new Set(rows.map(event=>event?.id)),seenSignatures=new Set(rows.map(event=>event?.signature).filter(Boolean));
 return [...rows,...(confirmed||[]).filter(event=>event&&!seenIds.has(event.id)&&!seenSignatures.has(event.signature))];
}
export function latencyEstimate(){return {...LAUNCH_LATENCY};}
