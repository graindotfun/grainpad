import {PublicKey} from '@solana/web3.js';
import {database} from './server-owner';
import {grainpadPlatformId} from './platform-policy';
import {nativeStats} from './native-stats.mjs';
import {displayUnits} from './token-units.mjs';
import type {ProjectRecord} from './server-project';
/** Everything a share card or page metadata needs, read only from D1 and existing caches.
 * Never spends RPC or third-party budget: a crawler must not be able to trigger chain reads. */
export type ShareToken={record:ProjectRecord;route:'curve'|'graduating'|'cpmm'|null;quote:string;progressPct:number|null;raised:string|null;target:string|null;priceQuote:number|null;marketCapQuote:number|null;usd:{price:number|null;marketCap:number|null;volume:number|null;change:number|null}|null;native:Awaited<ReturnType<typeof nativeStats>>|null;crew:{tasks:number;contributors:number;approved:number;payments:number};updatedAt:number|null};
export function validMint(value:string){try{return new PublicKey(value).toBase58()===value;}catch{return false;}}
async function cached<T>(key:string){const row=await database().prepare('SELECT value,updated_at FROM market_cache WHERE key=?').bind(key).first<{value:string|null;updated_at:number}>();if(!row?.value)return null;try{return {data:JSON.parse(row.value) as T,updatedAt:row.updated_at};}catch{return null;}}
export async function shareProject(mint:string):Promise<ProjectRecord|null>{
 if(!validMint(mint))return null;
 const platform=grainpadPlatformId().toBase58();
 const row=await database().prepare('SELECT record FROM launch_index WHERE network=? AND platform_id=? AND mint=?').bind('mainnet-beta',platform,mint).first<{record:string}>();
 if(!row)return null;const record=JSON.parse(row.record) as ProjectRecord;
 return record.mint===mint&&record.verification==='confirmed-on-chain'?record:null;
}
export async function shareToken(mint:string):Promise<ShareToken|null>{
 const record=await shareProject(mint);if(!record)return null;
 const db=database(),platform=grainpadPlatformId().toBase58();
 const market=await cached<{route:'curve'|'graduating'|'cpmm';pool:string;quote:{symbol:string;decimals:number};progress?:{raised:string;target:string};quoteStats?:{price:number|null;marketCap:number|null}|null}>(`market:v3:${platform}:${mint}`);
 const chart=market?await cached<{available:boolean;stats?:{price:number|null;marketCap:number|null;volume:number|null;change:number|null}}>(`chart:v3:${market.data.pool}`):null;
 const progress=market?.data.progress,target=progress?Number(progress.target):0;
 const crew=await db.prepare(`SELECT sum(kind='need') AS tasks,count(DISTINCT CASE WHEN kind='submission' THEN author END) AS contributors,sum(kind='approve') AS approved,sum(kind='payment') AS payments FROM room_event WHERE mint=?`).bind(mint).first<Record<string,number|null>>();
 return {record,route:market?.data.route??null,quote:market?.data.quote.symbol||record.quoteAsset||'SOL',
  progressPct:market?.data.route==='cpmm'?100:target>0?Math.min(100,Number(progress!.raised)/target*100):null,
  raised:progress&&market?displayUnits(progress.raised,market.data.quote.decimals):null,target:progress&&market?displayUnits(progress.target,market.data.quote.decimals):null,
  priceQuote:market?.data.quoteStats?.price??null,marketCapQuote:market?.data.quoteStats?.marketCap??null,
  usd:chart?.data.available&&chart.data.stats?chart.data.stats:null,native:await nativeStats(db,mint).catch(()=>null),
  crew:{tasks:Number(crew?.tasks||0),contributors:Number(crew?.contributors||0),approved:Number(crew?.approved||0),payments:Number(crew?.payments||0)},updatedAt:market?.updatedAt??null};
}
export function compact(value:number|null|undefined,prefix=''){if(value===null||value===undefined||!Number.isFinite(value))return '—';const abs=Math.abs(value);const [n,s]=abs>=1e9?[value/1e9,'B']:abs>=1e6?[value/1e6,'M']:abs>=1e3?[value/1e3,'K']:[value,''];return prefix+(abs>=1e3?n.toFixed(n>=100?0:n>=10?1:2):abs>=1?n.toFixed(2):n.toPrecision(3))+s;}
