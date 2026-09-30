import type {MarketStats} from './market-display';
import {quoteAsset} from './quote-assets.mjs';
import {MarketReadError,composeNative,lifecycleState} from './native-market.mjs';
import {indexedSummary} from './native-history.mjs';
import {loadQuoteUsd,quoteUsdFor} from './quote-usd.mjs';
import {PublicKey} from '@solana/web3.js';
import {database} from './server-owner';
import {chain} from './server-rpc';
import {POLICY,grainpadPlatformId} from './platform-policy';
import {NETWORKS} from './site-config';
import {sharedMarketCache} from './server-cache';
import {readMarketSnapshot} from './market-snapshot.mjs';
import {creationOnly} from './trade-activity.mjs';
import {isOwnPlatform} from './launch-identity.mjs';

export type NativeQuote={priceQuote:number|null;marketCapQuote:number|null;liquidityQuote:number|null;liquidityKind:string|null;volume24hQuote:number|null;volumeCoverage:string;change24h:number|null;changeCoverage:string;priceUsd:number|null;marketCapUsd:number|null;liquidityUsd:number|null;volume24hUsd:number|null;usd:{symbol:string;price:number;source:string;updatedAt:number;freshness:string;note:string}|null;source:'grainpad'};
export type MarketIdentity={mint:string;name:string;symbol:string;image:string;creator:string|null;createdAt:string|null;quoteSymbol:string};
export type MarketView={transferTaxBps?:number;quoteStats?:{price:number|null;marketCap:number|null}|null;liquidity?:{quote:number|null;kind:string|null};native?:NativeQuote;creator?:string;createdAt?:string|null;lifecycle?:string;progress?:{raised:string;target:string};stats?:MarketStats;quote:{symbol:string;mint:string;decimals:number;native:boolean};mint:string;pool:string;launchPool:string;route:string;rates:Record<string,string>;name:string;symbol:string;image:string;official:boolean;activity:'none'|'seen'|'unknown';chart:{available:boolean;pool:string;stale?:boolean;reason?:string;stats?:MarketStats};links?:{gecko:string;dexscreener:string};updatedAt:number;stale:boolean;slot:number};
export async function serverMarket(address:string,{viewer=false}:{viewer?:boolean}={}):Promise<MarketView>{
 const mint=new PublicKey(address).toBase58(),platform=grainpadPlatformId().toBase58(),db=database();
 // Unregistered/foreign mints cannot create cache entries or spend RPC budget.
 let indexed:{record:string}|null;
 try{indexed=await db.prepare('SELECT record FROM launch_index WHERE network=? AND platform_id=? AND mint=?').bind('mainnet-beta',platform,mint).first<{record:string}>();}
 catch{throw new MarketReadError('unavailable','Market data is temporarily unavailable.',null);}
 if(!indexed)throw new MarketReadError('not_registered','This mint is not a registered Grainpad launch.',null);
 let record:{mint:string;platformId:string;verification:string;quoteAsset?:string;name:string;symbol:string;image:string;creator?:string;createdAt?:string}|null=null;
 try{record=JSON.parse(indexed.record);}catch{record=null;}
 const identity:MarketIdentity|null=record?{mint,name:record.name,symbol:record.symbol,image:record.image,creator:record.creator||null,createdAt:record.createdAt||null,quoteSymbol:record.quoteAsset||'SOL'}:null;
 if(!record||record.mint!==mint||record.verification!=='confirmed-on-chain'||!isOwnPlatform(record.platformId,platform))throw new MarketReadError(record?'unavailable':'not_registered',record?'Launch identity could not be read.':'This mint is not a registered Grainpad launch.',record?identity:null);
 let cached;
 try{cached=await sharedMarketCache(db,`market:v3:${platform}:${mint}`,async(previous:MarketView|null)=>{
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
  let indexed={volume24hQuote:null as number|null,volumeCoverage:'unavailable',change24h:null as number|null,changeCoverage:'unavailable'};
  try{indexed=await indexedSummary(db,mint);}catch{/* Spot price still comes from the account snapshot. */}
  let usd=null;
  try{usd=quoteUsdFor(await loadQuoteUsd(db,{refresh:viewer}),snapshot.quote.symbol);}catch{usd=null;}
  return {...snapshot,activity,native:composeNative(snapshot,indexed,usd)};
 },{ttl:15_000,maxStale:300_000,refresh:viewer});
 }catch(error){
  if(error instanceof MarketReadError)throw error;
  throw new MarketReadError('unavailable','Market data is temporarily unavailable.',identity);
 }
 const chart={available:false,pool:cached.data.pool,stale:false,reason:'grainpad-native' as const};
 const official=await db.prepare('SELECT mint FROM official_token WHERE id=1').first<{mint:string}>();
 const lifecycle=lifecycleState({route:cached.data.route,raised:cached.data.progress?.raised,target:cached.data.progress?.target});
 return {...cached.data,creator:record.creator,createdAt:record.createdAt||null,name:record.name,symbol:record.symbol,image:record.image,official:official?.mint===mint,lifecycle,chart,links:{gecko:`https://www.geckoterminal.com/solana/pools/${cached.data.pool}`,dexscreener:`https://dexscreener.com/solana/${mint}`},updatedAt:cached.updatedAt,stale:cached.stale};
}
