import {takeBudget} from './shared-market-cache.mjs';
import {findLaunchEvent,findGraduationEvent} from './launch-events.mjs';
import {PREVIOUS_OFFICIAL_MINTS} from './previous-official-mints.mjs';
const RETRY_MS=6*3_600_000,CALLS_PER_RUN=60;
const checkKey=(kind,mint)=>`${kind}-time-check:v1:${mint}`;
async function mark(db,kind,mint,status,now){
 await db.prepare('INSERT INTO market_cache(key,value,updated_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,expires_at=excluded.expires_at').bind(checkKey(kind,mint),JSON.stringify({status}),now,now+RETRY_MS).run();
}
/** Fill verified launch and graduation times into the directory index, a few tokens per call.
 * Times come only from `findLaunchEvent` / `findGraduationEvent`; an unresolved token is retried later and shows no timing meanwhile.
 * Written to the index row only; the stored launch record is untouched and `indexLaunch` carries the times across re-indexing. */
export async function backfillEventTimes({db,platform,chain,now=Date.now(),limit=2}){
 if(!await takeBudget(db,`launch-time-backfill:v1:${platform}`,1,1,30_000,now))return {state:'shared-budget-held',launch:0,graduation:0};
 let calls=0;
 const bounded=async(method,params)=>{if(++calls>CALLS_PER_RUN)throw Error('Event lookup budget reached.');return chain(method,params);};
 const archived=PREVIOUS_OFFICIAL_MINTS.map(row=>row.mint),skip=`l.mint NOT IN (${archived.map(()=>'?').join(',')})`;
 const launches=(await db.prepare(`SELECT l.mint,l.pool,l.platform_id FROM launch_index l LEFT JOIN market_cache c ON c.key=('launch-time-check:v1:'||l.mint)
  WHERE l.network='mainnet-beta' AND l.platform_id=? AND ${skip} AND json_extract(l.record,'$.launchedAt') IS NULL AND (c.updated_at IS NULL OR c.updated_at<?) ORDER BY l.created_at DESC LIMIT ?`).bind(platform,...archived,now-RETRY_MS,limit).all()).results;
 const graduations=(await db.prepare(`SELECT l.mint,l.pool,json_extract(m.value,'$.pool') AS cpmm FROM launch_index l
  JOIN market_cache m ON m.key=('market:v3:'||l.platform_id||':'||l.mint) AND json_extract(m.value,'$.route')='cpmm' AND json_extract(m.value,'$.launchPool')=l.pool
  LEFT JOIN market_cache c ON c.key=('graduation-time-check:v1:'||l.mint)
  WHERE l.network='mainnet-beta' AND l.platform_id=? AND ${skip} AND json_extract(l.record,'$.graduatedAt') IS NULL AND (c.updated_at IS NULL OR c.updated_at<?) ORDER BY l.created_at DESC LIMIT ?`).bind(platform,...archived,now-RETRY_MS,limit).all()).results;
 let launch=0,graduation=0;
 for(const row of launches){
  let event;try{event=await findLaunchEvent(bounded,{pool:row.pool,mint:row.mint,platformId:row.platform_id});}catch{event={status:'unavailable'};}
  if(event.status==='found'){await db.prepare("UPDATE launch_index SET record=json_set(record,'$.launchedAt',?,'$.launchSignature',?) WHERE network='mainnet-beta' AND mint=? AND json_extract(record,'$.launchedAt') IS NULL").bind(event.at,event.signature,row.mint).run();launch++;}
  else await mark(db,'launch',row.mint,event.status,now);
 }
 for(const row of graduations){
  let event;try{event=await findGraduationEvent(bounded,{launchPool:row.pool,cpmmPool:row.cpmm});}catch{event={status:'unavailable'};}
  if(event.status==='found'){await db.prepare("UPDATE launch_index SET record=json_set(record,'$.graduatedAt',?,'$.graduationSignature',?) WHERE network='mainnet-beta' AND mint=? AND json_extract(record,'$.graduatedAt') IS NULL").bind(event.at,event.signature,row.mint).run();graduation++;}
  else await mark(db,'graduation',row.mint,event.status,now);
 }
 return {state:'checked',launch,graduation,calls};
}
