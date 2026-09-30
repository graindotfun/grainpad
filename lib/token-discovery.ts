import type {LaunchRecord} from './launch-records';
export type DiscoveryToken=LaunchRecord&{state:'curve'|'graduating'|'graduated'|'unknown';lifecycle:'curve_live'|'curve_complete'|'migration_pending'|'raydium_live'|'unavailable';progress:number|null;marketCapUsd:number|null;volume24h:number|null;change24h:number|null;marketUpdatedAt:number|null;figuresSource:'grainpad'|'geckoterminal'|null};
export type DiscoveryFilter='all'|'new'|'near'|'graduated';
export type DiscoverySort='newest'|'oldest'|'market-cap'|'volume';
export type DiscoveryResult={coverage?:string;totalIndexed?:number;tokens:DiscoveryToken[];featured:DiscoveryToken[];total:number;filteredTotal:number;page:number;pages:number;pageSize:number;counts:{all:number;new:number;near:number;graduated:number;unknown:number};officialMint:string|null;updatedAt:number;stale:boolean};
export type CacheRow={key:string;value:string;updated_at:number};
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
const nonnegative=(v:unknown)=>{const n=number(v);return n!==null&&n>=0?n:null;};
type DisplaySnapshot={mint?:string;launchPool?:string;quote?:{mint?:string;symbol?:string};route?:string;pool?:string;available?:boolean;native?:{marketCapUsd?:number|null;volume24hUsd?:number|null;volumeCoverage?:string;change24h?:number|null;changeCoverage?:string};stats?:{marketCap?:number;volume?:number;change?:number};progress?:{raised:string;target:string}};
function parse(row:CacheRow|undefined,now:number):DisplaySnapshot|null {
 if(!row||row.updated_at>now||now-row.updated_at>300_000)return null;
 try{const v=JSON.parse(row.value);return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}catch{return null;}
}
/** Read display snapshots only. Browsing the home grid must never fan out into token-page RPC refreshes. */
export function enrichDiscovery(records:LaunchRecord[],cache:CacheRow[],platform:string,officialMint:string|null,now=Date.now()):DiscoveryToken[]{
 const byKey=new Map(cache.map(row=>[row.key,row]));
 return records.map(record=>{
  const snapshotRow=byKey.get(`market:v3:${platform}:${record.mint}`),snapshot=parse(snapshotRow,now);
  const own=snapshot&&snapshot.mint===record.mint&&snapshot.launchPool===record.pool&&(record.quoteMint?snapshot.quote?.mint===record.quoteMint:snapshot.quote?.symbol===(record.quoteAsset||'SOL'));
  const state=own&&snapshot.route==='cpmm'?'graduated':own&&(snapshot.route==='curve'||snapshot.route==='graduating')?snapshot.route:'unknown';
  const chartRow=own&&state!=='unknown'?byKey.get(`chart:v3:${snapshot.pool}`):undefined,chart=parse(chartRow,now);
  const native=own&&snapshot.native&&typeof snapshot.native==='object'?snapshot.native:null;
  const stats=chart?.available&&chart.pool===snapshot?.pool?chart.stats:null;
  let progress:number|null=null;
  if(own&&state!=='unknown'&&snapshot.progress&&/^\d+$/.test(snapshot.progress.raised)&&/^\d+$/.test(snapshot.progress.target)){
   const raised=BigInt(snapshot.progress.raised),target=BigInt(snapshot.progress.target);if(target>0n)progress=Math.min(100,Number(raised*10000n/target)/100);
  }
  const nativeCap=nonnegative(native?.marketCapUsd),nativeVolume=native?.volumeCoverage==='unavailable'?null:nonnegative(native?.volume24hUsd);
  const useNative=nativeCap!==null||nativeVolume!==null;
  const marketCapUsd=useNative?nativeCap:nonnegative(stats?.marketCap);
  const volume24h=useNative?nativeVolume:nonnegative(stats?.volume);
  const change24h=useNative?native?.changeCoverage==='24h'?number(native.change24h):null:number(stats?.change);
  const figuresSource=useNative?'grainpad':marketCapUsd!==null||volume24h!==null||change24h!==null?'geckoterminal':null;
  const shown=state==='graduated'?100:progress;
  const lifecycle=state==='graduated'?'raydium_live':state==='graduating'?'migration_pending':state==='curve'&&shown!==null&&shown>=100?'curve_complete':state==='curve'?'curve_live':'unavailable';
  return {...record,official:Boolean(officialMint&&record.mint===officialMint),state,lifecycle,progress:shown,
   marketCapUsd,volume24h,change24h,figuresSource,marketUpdatedAt:marketCapUsd!==null||volume24h!==null?(useNative?snapshotRow!.updated_at:chartRow!.updated_at):null};
 });
}
/** One bad cache or launch row must not fail the directory. */
export function discoveryRecords(rows:{record:string;market?:string|null;chart?:string|null;market_time?:number;chart_time?:number}[],platform:string){
 const cache:CacheRow[]=[];const records:LaunchRecord[]=[];
 for(const row of rows){
  let record:LaunchRecord|null=null;try{record=JSON.parse(row.record) as LaunchRecord;}catch{record=null;}
  if(!record?.mint)continue;
  records.push(record);
  let market:DisplaySnapshot|null=null;if(row.market){try{market=JSON.parse(row.market) as DisplaySnapshot;}catch{market=null;}}
  if(market)cache.push({key:`market:v3:${platform}:${record.mint}`,value:row.market as string,updated_at:Number(row.market_time)||0});
  if(row.chart&&market?.pool)cache.push({key:`chart:v3:${market.pool}`,value:row.chart,updated_at:Number(row.chart_time)||0});
 }
 return {records,cache};
}
export function discoveryPage(rows:DiscoveryToken[],query:{search?:string;filter?:DiscoveryFilter;sort?:DiscoverySort;page?:number},officialMint:string|null,updatedAt:number,stale=false):DiscoveryResult{
 const filter=query.filter||'all',sort=query.sort||'newest',search=(query.search||'').trim().normalize('NFKC').toLowerCase();
 if(!['all','new','near','graduated'].includes(filter)||!['newest','oldest','market-cap','volume'].includes(sort))throw Error('Invalid directory filter.');
 const isNear=(r:DiscoveryToken)=>r.state==='curve'&&r.progress!==null&&r.progress>=80;
 const counts={all:rows.length,new:rows.filter(r=>r.state==='curve'||r.state==='graduating').length,near:rows.filter(isNear).length,graduated:rows.filter(r=>r.state==='graduated').length,unknown:rows.filter(r=>r.state==='unknown').length};
 const selected=rows.filter(r=>(!search||[r.name,r.symbol,r.mint].some(v=>v.normalize('NFKC').toLowerCase().includes(search)))&&(filter==='all'||filter==='new'&&(r.state==='curve'||r.state==='graduating')||filter==='near'&&isNear(r)||filter==='graduated'&&r.state==='graduated'));
 const newest=(a:DiscoveryToken,b:DiscoveryToken)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.mint.localeCompare(b.mint);
 selected.sort((a,b)=>{
  if(a.official!==b.official)return a.official?-1:1;
  if(sort==='newest')return newest(a,b);if(sort==='oldest')return -newest(a,b);
  const av=sort==='market-cap'?a.marketCapUsd:a.volume24h,bv=sort==='market-cap'?b.marketCapUsd:b.volume24h;
  if(av===null&&bv!==null)return 1;if(av!==null&&bv===null)return -1;return (bv??0)-(av??0)||newest(a,b);
 });
 const pageSize=20,pages=Math.max(1,Math.ceil(selected.length/pageSize)),page=Math.max(1,Math.min(pages,Math.floor(query.page||1)));
 const featured=rows.filter(r=>r.state==='graduated').sort((a,b)=>Number(b.official)-Number(a.official)||newest(a,b)).slice(0,5);
 return {tokens:selected.slice((page-1)*pageSize,page*pageSize),featured,total:rows.length,filteredTotal:selected.length,page,pages,pageSize,counts,officialMint,updatedAt,stale};
}
