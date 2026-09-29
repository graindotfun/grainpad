import {chartAvailability} from './chart-identity.mjs';
import {quoteAsset} from './quote-assets.mjs';
import {PublicKey} from '@solana/web3.js';
import {bucket} from './server-utils';
import {database} from './server-owner';
import {chain} from './server-rpc';
import {POLICY,grainpadPlatformId} from './platform-policy';
import {NETWORKS} from './site-config';
import {sharedMarketCache} from './server-cache';
import {takeBudget} from './shared-market-cache.mjs';
import {readMarketSnapshot} from './market-snapshot.mjs';
import {creationOnly} from './trade-activity.mjs';
import {isOwnPlatform} from './launch-identity.mjs';

export type MarketView={quote:{symbol:string;mint:string;decimals:number;native:boolean};mint:string;pool:string;launchPool:string;route:string;rates:Record<string,string>;name:string;symbol:string;image:string;official:boolean;activity:'none'|'seen'|'unknown';chart:{available:boolean;pool:string;stale?:boolean;reason?:string};updatedAt:number;stale:boolean;slot:number};
export async function serverMarket(address:string):Promise<MarketView>{
 const mint=new PublicKey(address).toBase58(),platform=grainpadPlatformId().toBase58(),db=database();
 // Unregistered/foreign mints cannot create cache entries or spend RPC budget.
 const object=await bucket().get(`launches/mainnet-beta/${mint}`);
 const record=object?await object.json<{mint:string;platformId:string;verification:string;quoteAsset?:string;name:string;symbol:string;image:string}>():null;
 if(!record||record.mint!==mint||record.verification!=='confirmed-on-chain'||!isOwnPlatform(record.platformId,platform))throw Error('This token is not a registered Grainpad launch.');
 const cached=await sharedMarketCache(db,`market:v3:${platform}:${mint}`,async(previous:MarketView|null)=>{
  const network=await sharedMarketCache(db,'mainnet-genesis',()=>chain('mainnet-beta','getGenesisHash'),{ttl:86_400_000,maxStale:86_400_000});
  if(network.data!==NETWORKS['mainnet-beta'].genesis)throw Error('Network mismatch.');
  const snapshot=await readMarketSnapshot((method:string,params:unknown[])=>chain('mainnet-beta',method,params),mint,platform,quoteAsset(record.quoteAsset).config);
  let activity:'none'|'seen'|'unknown'=snapshot.activityObserved||previous?.activity==='seen'?'seen':'unknown';
  if(activity==='unknown'){
   // Only a pristine, creation-only history earns the "No trades yet" state.
   // This bounded probe is not a trade indexer and never mistakes a sell-back for no trades.
   try{
    const signatures=await chain('mainnet-beta','getSignaturesForAddress',[snapshot.launchPool,{limit:2,commitment:'confirmed',minContextSlot:snapshot.slot}]);
    if(signatures.length===1&&!signatures[0].err){
     const proof=await sharedMarketCache(db,`creation:${snapshot.launchPool}`,()=>chain('mainnet-beta','getTransaction',[signatures[0].signature,{encoding:'json',commitment:'confirmed',maxSupportedTransactionVersion:0}]),{ttl:86_400_000,maxStale:86_400_000});
     if(creationOnly(proof.data,POLICY.program,snapshot.launchPool))activity='none';
    }
   }catch{/* History unavailable is unknown, never zero. */}
  }
  return {...snapshot,activity};
 });
 let chart:{available:boolean;pool:string;stale?:boolean;reason?:string}={available:false,pool:cached.data.pool,stale:false};
 try{
  const result=await sharedMarketCache(db,`chart:v2:${cached.data.pool}`,async()=>{
   if(!await takeBudget(db,'gecko-minute',1,10,60_000))throw Error('Chart provider limit.');
   const r=await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${cached.data.pool}`,{signal:AbortSignal.timeout(6000)});
   if(r.status===404)return {available:false,pool:cached.data.pool};
   if(!r.ok)throw Error('Chart provider unavailable.');
   const body=await r.json() as {data?:{id:string;attributes:{address:string};relationships:{base_token:{data:{id:string}};quote_token:{data:{id:string}}}}};
   return chartAvailability(body,cached.data.pool,mint,cached.data.quote.mint);
  },{ttl:60_000,maxStale:300_000});
  chart={...result.data,stale:result.stale};
 }catch{chart.stale=true;}
 const official=await db.prepare('SELECT mint FROM official_token WHERE id=1').first<{mint:string}>();
 return {...cached.data,name:record.name,symbol:record.symbol,image:record.image,official:official?.mint===mint,chart,updatedAt:cached.updatedAt,stale:cached.stale};
}
