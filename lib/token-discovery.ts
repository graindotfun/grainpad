import type {LaunchRecord} from './launch-records';
export type DiscoveryToken=LaunchRecord&{state:'curve'|'graduating'|'graduated'|'unknown';progress:number|null;marketCapUsd:number|null;volume24h:number|null;change24h:number|null;marketUpdatedAt:number|null};
export type DiscoveryFilter='all'|'new'|'near'|'graduated';
export type DiscoverySort='newest'|'oldest'|'market-cap'|'volume';
export type DiscoveryResult={coverage?:string;totalIndexed?:number;tokens:DiscoveryToken[];featured:DiscoveryToken[];total:number;filteredTotal:number;page:number;pages:number;pageSize:number;counts:{all:number;new:number;near:number;graduated:number;unknown:number};officialMint:string|null;updatedAt:number;stale:boolean};
export type CacheRow={key:string;value:string;updated_at:number};
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
const nonnegative=(v:unknown)=>{const n=number(v);return n!==null&&n>=0?n:null;};
type DisplaySnapshot={mint?:string;launchPool?:string;quote?:{mint?:string;symbol?:string};route?:string;pool?:string;available?:boolean;stats?:{marketCap?:number;volume?:number;change?:number};progress?:{raised:string;target:string}};
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
  const stats=chart?.available&&chart.pool===snapshot?.pool?chart.stats:null;
  let progress:number|null=null;
  if(own&&state!=='unknown'&&snapshot.progress&&/^\d+$/.test(snapshot.progress.raised)&&/^\d+$/.test(snapshot.progress.target)){
   const raised=BigInt(snapshot.progress.raised),target=BigInt(snapshot.progress.target);if(target>0n)progress=Math.min(100,Number(raised*10000n/target)/100);
  }
  return {...record,official:Boolean(officialMint&&record.mint===officialMint),state,progress:state==='graduated'?100:progress,
   marketCapUsd:nonnegative(stats?.marketCap),volume24h:nonnegative(stats?.volume),change24h:number(stats?.change),marketUpdatedAt:stats?chartRow!.updated_at:null};
 });
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
