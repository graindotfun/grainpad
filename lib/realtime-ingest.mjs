/** Request-driven catch-up. No always-on websocket is provisioned. */
import {POLICY} from './platform-policy.mjs';
import {parseChainEvents} from './chain-events.mjs';

export const LAUNCH_LATENCY={
 priceMarketCapLiquidityProgress:'Curve and CPMM reserves are read from the launch accounts. A Grainpad launch is registered after those accounts finalize, typically within about 12–20 seconds of the transaction. A visible token page refreshes that shared snapshot about every 15 seconds. Dexscreener and GeckoTerminal are not on this path.',
 firstTrades:'A visible token page subscribes to confirmed pool logs over WebSocket and reads each successful trade for the Live chart. Reconnection replays recent confirmed trades. The historical fallback still caches its short catch-up for 8 seconds. Confirmed observations are separate from finalized indexed history.',
 homepageTape:'The homepage tape refreshes about every 15 seconds from the cached Grainpad snapshot and the quote-asset USD price. It does not call Dexscreener.',
 notProvisioned:'Background subscriptions and provider webhooks are not running. Visible token pages now open fixed-pool logsSubscribe connections, close them when hidden, and reconnect after a bounded lifetime. The regular finalized indexer remains on its existing schedule.',
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
/** @param {*} rpc @param {*} record @param {*} known @param {*} [cpConfig] @param {{signatures?:number,transactions?:number,decode?:(...args:any[])=>any}} [options] */
export async function confirmedCatchup(rpc,record,known,cpConfig=POLICY.cpConfig,{signatures=5,transactions=3,decode=parseChainEvents}={}){
 if(!record?.pool||!record?.mint)return [];
 const page=await rpc('getSignaturesForAddress',[record.pool,{limit:signatures,commitment:'confirmed'}]);
 const fresh=selectNewSignatures(page,known,transactions);
 const events=[];
 for(const signature of fresh){
  try{
   const tx=await rpc('getTransaction',[signature,{encoding:'json',commitment:'confirmed',maxSupportedTransactionVersion:1}]);
   if(!tx||tx.meta?.err)continue;
   events.push(...(await decode(tx,signature,[record],cpConfig,record.platformId)).filter(event=>event.kind==='buy'||event.kind==='sell').map(event=>({...event,provisional:true})));
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
