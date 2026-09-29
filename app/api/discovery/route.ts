import {PublicKey} from '@solana/web3.js';
import {database} from '@/lib/server-owner';
import {bucket} from '@/lib/server-utils';
import {sharedMarketCache} from '@/lib/server-cache';
import {grainpadPlatformId} from '@/lib/platform-policy';
import {readLaunchRecords} from '@/lib/launch-records';
import {discoverLaunches} from '@/lib/launch-discovery.mjs';
import {getLaunchProof} from '@/lib/launch-proof.mjs';
import {readConnection} from '@/lib/server-chain-connection';
import {chain} from '@/lib/server-rpc';
import {enrichDiscovery,discoveryPage,type CacheRow,type DiscoveryFilter,type DiscoverySort} from '@/lib/token-discovery';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const headers={'Cache-Control':'no-store'};
 try{
  const params=new URL(request.url).searchParams,search=params.get('q')||'',filter=params.get('filter')||'all',sort=params.get('sort')||'newest',page=Number(params.get('page')||1);
  if(search.length>128||!['all','new','near','graduated'].includes(filter)||!['newest','oldest','market-cap','volume'].includes(sort)||!Number.isSafeInteger(page)||page<1)return Response.json({error:'Invalid directory request.'},{status:400,headers});
  const db=database(),platform=grainpadPlatformId().toBase58(),now=Date.now();
  const [registry,official,cache]=await Promise.all([
   sharedMarketCache(db,`discovery:registry:v2:${platform}`,async()=>{
    try{await discoverLaunches({storage:bucket(),chain:(method:string,params:unknown[]=[])=>chain('mainnet-beta',method,params),prove:(mint:PublicKey,id:PublicKey)=>getLaunchProof(readConnection('mainnet-beta'),mint,id),limit:4});}catch{/* A discovery failure must not hide launches already recorded. */}
    return readLaunchRecords(bucket(),'mainnet-beta',platform);
   },{ttl:60_000,maxStale:300_000}),
   db.prepare('SELECT mint FROM official_token WHERE id=1').first<{mint:string}>(),
   db.prepare("SELECT key,value,updated_at FROM market_cache WHERE ((key>=? AND key<?) OR (key>='chart:v3:' AND key<'chart:v3;')) AND updated_at>=? AND value IS NOT NULL").bind(`market:v3:${platform}:`,`market:v3:${platform};`,now-300_000).all<CacheRow>()
  ]);
  const officialMint=official?.mint||null,rows=enrichDiscovery(registry.data,cache.results||[],platform,officialMint,now);
  return Response.json(discoveryPage(rows,{search,filter:filter as DiscoveryFilter,sort:sort as DiscoverySort,page},officialMint,registry.updatedAt,registry.stale),{headers});
 }catch{return Response.json({error:'The token directory is temporarily unavailable. Please try again.'},{status:503,headers});}
}
