import {mainnetFactories} from '@/lib/chain/robinhood-mainnet-factories.ts';
import 'server-only';
import {database} from './server-owner';
import {grainpadPlatformId} from './platform-policy';
import {sharedMarketCache} from './server-cache';
import {chain} from './server-rpc';
import {loadSupplyBurn} from './site-stats.mjs';
import {queryDiscovery} from './discovery-index.mjs';
import {discoveryRecords,enrichDiscovery,type DiscoveryResult} from './token-discovery';

/** Read the first indexed page and persisted market snapshots; no viewer RPC or writes. */
export async function readHomepageDiscovery():Promise<DiscoveryResult>{
 const platform=grainpadPlatformId().toBase58(),now=Date.now();
 const result=await queryDiscovery(database(),{platform,robinhoodMainnetFactories:mainnetFactories().map(factory=>factory.address),now});
 const enrich=(rows:Parameters<typeof discoveryRecords>[0])=>{const data=discoveryRecords(rows,platform);return enrichDiscovery(data.records,data.cache,platform,result.officialMint,now);};
 const summary={...result};delete summary.selected;
 return {...summary,tokens:enrich(result.selected),featured:enrich(result.featured),updatedAt:now,stale:false,totalIndexed:result.total,coverage:'Indexed launches; historical completeness not yet verified.'};
}

/** GRAIN burned from the chain: LaunchLab creation supply minus current mint supply.
 * One shared finalized read per five minutes for every viewer; never a viewer RPC. */
export function readSupplyBurn(db:ReturnType<typeof database>){
 return loadSupplyBurn(db,{rpc:(method:string,params:unknown[])=>chain('mainnet-beta',method,params),cache:sharedMarketCache});
}
