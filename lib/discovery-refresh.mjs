import {takeBudget} from './shared-market-cache.mjs';
import {PREVIOUS_OFFICIAL_MINTS} from './previous-official-mints.mjs';

/** A visible directory warms a bounded oldest-first batch, independent of its filters.
 * Per-market shared leases and the display RPC budget remain in serverMarket.
 */
export async function refreshDiscoveryMarkets({db,platform,readMarket,now=Date.now()}){
 if(!await takeBudget(db,`discovery-refresh:v1:${platform}`,1,1,30_000,now))return {state:'shared-budget-held',checked:0};
 const archived=PREVIOUS_OFFICIAL_MINTS.map(row=>row.mint);
 const result=await db.prepare(`SELECT l.mint FROM launch_index l
 LEFT JOIN market_cache m ON m.key=('market:v3:'||l.platform_id||':'||l.mint)
 WHERE l.network='mainnet-beta' AND l.platform_id=?
 AND l.mint NOT IN (${archived.map(()=>'?').join(',')})
 AND (m.value IS NULL OR m.updated_at<?)
 AND (m.lease_until IS NULL OR m.lease_until<=?)
 ORDER BY MAX(COALESCE(m.updated_at,0),COALESCE(m.expires_at,0)-30000),l.created_at,l.mint LIMIT 8`).bind(platform,...archived,now-60_000,now).all();
 const rows=result.results;let next=0,ready=0,failed=0;
 async function worker(){while(next<rows.length){const row=rows[next++];try{await readMarket(row.mint);ready++;}catch{failed++;}}}
 await Promise.all([worker(),worker()]);
 return {state:'checked',checked:rows.length,ready,failed};
}
