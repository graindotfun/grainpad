import {ROBINHOOD_MAINNET_V3_FACTORY_ADDRESS} from './chain/robinhood-mainnet-v3.ts';
import {ROBINHOOD_MAINNET_METADATA_FACTORY_ADDRESS} from './chain/robinhood-mainnet-v3-metadata.ts';
import {isPublicRobinhoodToken} from './robinhood-publication.mjs';
import type {LaunchRecord} from './launch-records';
import {CHAIN_RECORD_NETWORKS,chainOfNetwork,recordNetworkId,type ChainFilter,type ChainKey} from './chain-display.ts';
import type {DisplayNetworkId} from './chain-display.ts';
import {isNewLaunch,parseTimestamp} from './token-time.ts';
export type DiscoveryToken=Omit<LaunchRecord,'launchedAt'>&{marketVenue?:'uniswap-v3';networkId:DisplayNetworkId|null;chain:ChainKey|null;launchedAt:string|null;graduatedAt:string|null;state:'curve'|'graduating'|'graduated'|'unknown';lifecycle:'curve_live'|'curve_complete'|'migration_pending'|'raydium_live'|'unavailable';progress:number|null;marketCapQuote?:number|null;marketCapUsd:number|null;volume24h:number|null;change24h:number|null;marketUpdatedAt:number|null;marketStale:boolean;figuresSource:'grainpad'|'geckoterminal'|null};
export type DiscoveryFilter='all'|'new'|'near'|'graduated';
export type DiscoverySort='newest'|'oldest'|'market-cap'|'volume';
export type DiscoveryResult={chainCounts:{all:number;solana:number;robinhood:number};coverage?:string;totalIndexed?:number;tokens:DiscoveryToken[];featured:DiscoveryToken[];total:number;filteredTotal:number;page:number;pages:number;pageSize:number;counts:{all:number;new:number;near:number;graduated:number;unknown:number};officialMint:string|null;updatedAt:number;stale:boolean};
export type CacheRow={key:string;value:string;updated_at:number};
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
const nonnegative=(v:unknown)=>{const n=number(v);return n!==null&&n>=0?n:null;};
type DisplaySnapshot={mint?:string;launchPool?:string;quote?:{mint?:string;symbol?:string};route?:string;pool?:string;available?:boolean;native?:{marketCapQuote?:number|null;marketCapUsd?:number|null;volume24hUsd?:number|null;volumeCoverage?:string;change24h?:number|null;changeCoverage?:string};stats?:{marketCap?:number;volume?:number;change?:number};progress?:{raised:string;target:string};};
function parse(row:CacheRow|undefined,now:number):DisplaySnapshot|null {
 if(!row||row.updated_at<=0||row.updated_at>now)return null;
 try{const v=JSON.parse(row.value);return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}catch{return null;}
}
/** Retain last observed display snapshots with their original timestamp. Read display snapshots only. Browsing the home grid must never fan out into token-page RPC refreshes. */
export function enrichDiscovery(records:LaunchRecord[],cache:CacheRow[],platform:string,officialMint:string|null,now=Date.now()):DiscoveryToken[]{
 const byKey=new Map(cache.map(row=>[row.key,row]));
 return records.filter(record=>isPublicRobinhoodToken(recordNetworkId(record),record.mint)).map(record=>{
  const snapshotRow=byKey.get(`market:v3:${platform}:${record.mint}`),snapshot=parse(snapshotRow,now);
  const own=snapshot&&snapshot.mint===record.mint&&snapshot.launchPool===record.pool&&(record.quoteMint?snapshot.quote?.mint===record.quoteMint:(snapshot.quote?.symbol===(record.quoteAsset||'SOL')||recordNetworkId(record)==='robinhood:mainnet'&&record.quoteAsset==='ETH'&&snapshot.quote?.symbol==='WETH'&&snapshot.quote?.mint==='0x0bd7d308f8e1639fab988df18a8011f41eacad73'));
  const state=own&&snapshot.route==='cpmm'?'graduated':own&&(snapshot.route==='curve'||snapshot.route==='graduating')?snapshot.route:'unknown';
  const chartRow=own&&state!=='unknown'?byKey.get(`chart:v3:${snapshot.pool}`):undefined,chart=parse(chartRow,now);
  const native=own&&snapshot.native&&typeof snapshot.native==='object'?snapshot.native:null;
  const stats=chart?.available&&chart.pool===snapshot?.pool?chart.stats:null;
  let progress:number|null=null;
  if(own&&state!=='unknown'&&snapshot.progress&&/^\d+$/.test(snapshot.progress.raised)&&/^\d+$/.test(snapshot.progress.target)){
   const raised=BigInt(snapshot.progress.raised),target=BigInt(snapshot.progress.target);if(target>0n)progress=Math.min(100,Number(raised*10000n/target)/100);
  }
  const nativeCapQuote=nonnegative(native?.marketCapQuote),nativeCap=nonnegative(native?.marketCapUsd),nativeVolume=native?.volumeCoverage==='unavailable'?null:nonnegative(native?.volume24hUsd);
  const useNative=nativeCap!==null||nativeCapQuote!==null||nativeVolume!==null;
  const marketCapUsd=useNative?nativeCap:nonnegative(stats?.marketCap);
  const volume24h=useNative?nativeVolume:nonnegative(stats?.volume);
  const change24h=useNative?native?.changeCoverage==='24h'?number(native.change24h):null:number(stats?.change);
  const figuresSource=useNative?'grainpad':marketCapUsd!==null||volume24h!==null||change24h!==null?'geckoterminal':null;
  const marketUpdatedAt=marketCapUsd!==null||nativeCapQuote!==null||volume24h!==null?(useNative?snapshotRow!.updated_at:chartRow!.updated_at):null;
  const marketStale=Boolean(own&&now-snapshotRow!.updated_at>300_000||marketUpdatedAt!==null&&now-marketUpdatedAt>300_000);
  const shown=state==='graduated'?100:progress;
  const lifecycle=state==='graduated'?'raydium_live':state==='graduating'?'migration_pending':state==='curve'&&shown!==null&&shown>=100?'curve_complete':state==='curve'?'curve_live':'unavailable';
  const networkId=recordNetworkId(record),launchedAt=parseTimestamp(record.launchedAt)!==null?record.launchedAt as string:null;
  const recorded=(record as {graduatedAt?:unknown}).graduatedAt,graduatedAt=state==='graduated'&&parseTimestamp(recorded)!==null?recorded as string:null;
  const marketVenue=networkId==='robinhood:mainnet'&&[ROBINHOOD_MAINNET_V3_FACTORY_ADDRESS,ROBINHOOD_MAINNET_METADATA_FACTORY_ADDRESS].includes(record.platformId??'')?'uniswap-v3' as const:undefined;
  return {...record,marketVenue,networkId,chain:chainOfNetwork(networkId),launchedAt,graduatedAt,official:Boolean(officialMint&&record.mint===officialMint),state,lifecycle,progress:shown,
   marketCapQuote:nativeCapQuote,marketCapUsd,volume24h,change24h,figuresSource,marketUpdatedAt,marketStale};
 });
}
/** One bad cache or launch row must not fail the directory. */
export function discoveryRecords(rows:{record:string;market?:string|null;chart?:string|null;market_time?:number;chart_time?:number}[],platform:string){
 const cache:CacheRow[]=[];const records:LaunchRecord[]=[];
 for(const row of rows){
  let record:LaunchRecord|null=null;try{record=JSON.parse(row.record) as LaunchRecord;}catch{record=null;}
  if(!record?.mint||!isPublicRobinhoodToken(recordNetworkId(record),record.mint))continue;
  records.push(record);
  let market:DisplaySnapshot|null=null;if(row.market){try{market=JSON.parse(row.market) as DisplaySnapshot;}catch{market=null;}}
  if(market)cache.push({key:`market:v3:${platform}:${record.mint}`,value:row.market as string,updated_at:Number(row.market_time)||0});
  if(row.chart&&market?.pool)cache.push({key:`chart:v3:${market.pool}`,value:row.chart,updated_at:Number(row.chart_time)||0});
 }
 return {records,cache};
}
export function discoveryPage(allRows:DiscoveryToken[],query:{search?:string;filter?:DiscoveryFilter;sort?:DiscoverySort;page?:number;chain?:ChainFilter},officialMint:string|null,updatedAt:number,stale=false):DiscoveryResult{
 const filter=query.filter||'all',sort=query.sort||'newest',chain=query.chain||'all',search=(query.search||'').trim().normalize('NFKC').toLowerCase();
 if(!['all','new','near','graduated'].includes(filter)||!['newest','oldest','market-cap','volume'].includes(sort)||!['all',...Object.keys(CHAIN_RECORD_NETWORKS)].includes(chain))throw Error('Invalid directory filter.');
 // Chain scopes the status counts, so "Solana + Graduated" and its pill count always agree. NEW is the shared 12-hour launch rule.
 const publicRows=allRows.filter(r=>isPublicRobinhoodToken(r.networkId,r.mint)&&r.networkId!=='robinhood:testnet'&&r.networkId!=='solana:devnet');
 const rows=chain==='all'?publicRows:publicRows.filter(r=>r.chain===chain);
 const isNear=(r:DiscoveryToken)=>r.state==='curve'&&r.progress!==null&&r.progress>=80;
 const isNew=(r:DiscoveryToken)=>isNewLaunch(r.launchedAt,updatedAt);
 const counts={all:rows.length,new:rows.filter(isNew).length,near:rows.filter(isNear).length,graduated:rows.filter(r=>r.state==='graduated').length,unknown:rows.filter(r=>r.state==='unknown').length};
 const chainCounts={all:publicRows.length,solana:publicRows.filter(r=>r.chain==='solana').length,robinhood:publicRows.filter(r=>r.chain==='robinhood').length};
 const selected=rows.filter(r=>(!search||[r.name,r.symbol,r.mint].some(v=>v.normalize('NFKC').toLowerCase().includes(search)))&&(filter==='all'||filter==='new'&&isNew(r)||filter==='near'&&isNear(r)||filter==='graduated'&&r.state==='graduated'));
 const newest=(a:DiscoveryToken,b:DiscoveryToken)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.mint.localeCompare(b.mint);
 selected.sort((a,b)=>{
  if(a.official!==b.official)return a.official?-1:1;
  if(sort==='newest')return newest(a,b);if(sort==='oldest')return -newest(a,b);
  const av=sort==='market-cap'?a.marketCapUsd:a.volume24h,bv=sort==='market-cap'?b.marketCapUsd:b.volume24h;
  if(av===null&&bv!==null)return 1;if(av!==null&&bv===null)return -1;return (bv??0)-(av??0)||newest(a,b);
 });
 const pageSize=20,pages=Math.max(1,Math.ceil(selected.length/pageSize)),page=Math.max(1,Math.min(pages,Math.floor(query.page||1)));
 const featured=rows.filter(r=>r.state==='graduated').sort((a,b)=>Number(b.official)-Number(a.official)||newest(a,b)).slice(0,5);
 return {tokens:selected.slice((page-1)*pageSize,page*pageSize),featured,total:rows.length,filteredTotal:selected.length,page,pages,pageSize,counts,chainCounts,officialMint,updatedAt,stale};
}
