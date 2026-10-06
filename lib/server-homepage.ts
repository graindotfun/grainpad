import 'server-only';
import {database} from './server-owner';
import {grainpadPlatformId} from './platform-policy';
import {isPreviousOfficialMint} from './previous-official-mints.mjs';
import {queryDiscovery} from './discovery-index.mjs';
import {discoveryRecords,enrichDiscovery,type DiscoveryResult} from './token-discovery';

/** Read the first indexed page and persisted market snapshots; no viewer RPC or writes. */
export async function readHomepageDiscovery():Promise<DiscoveryResult>{
 const platform=grainpadPlatformId().toBase58(),now=Date.now();
 const result=await queryDiscovery(database(),{platform,now});
 const enrich=(rows:Parameters<typeof discoveryRecords>[0])=>{const data=discoveryRecords(rows,platform);return enrichDiscovery(data.records,data.cache,platform,result.officialMint,now);};
 const summary={...result};delete summary.selected;
 return {...summary,tokens:enrich(result.selected),featured:enrich(result.featured),updatedAt:now,stale:false,totalIndexed:result.total,coverage:'Indexed launches; historical completeness not yet verified.'};
}

/** Report only available, recent, identity-matched snapshots. Missing volume is not zero. */
export async function readOverviewVolume(db:ReturnType<typeof database>,platform:string,now=Date.now()){
 const rows=await db.prepare(`SELECT l.record,m.value AS market,m.updated_at AS market_time,c.value AS chart,c.updated_at AS chart_time
 FROM launch_index l LEFT JOIN market_cache m ON m.key=('market:v3:'||l.platform_id||':'||l.mint)
 LEFT JOIN market_cache c ON c.key=('chart:v3:'||json_extract(m.value,'$.pool'))
 WHERE l.network='mainnet-beta' AND l.platform_id=? ORDER BY l.created_at DESC,l.mint LIMIT 1001`).bind(platform).all<{record:string;market:string|null;market_time:number;chart:string|null;chart_time:number}>();
 const {records,cache}=discoveryRecords(rows.results.slice(0,1000),platform);
 const tokens=enrichDiscovery(records.filter(record=>!isPreviousOfficialMint(record.mint)),cache,platform,null,now);
 const known=tokens.filter(token=>token.volume24h!==null);
 return {volume:known.length?known.reduce((sum,token)=>sum+token.volume24h!,0):null,volumeTokens:known.length,volumeCoverage:'partial'};
}
