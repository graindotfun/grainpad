import {currentIndexerExecution} from './indexer-execution.mjs';
import {InvalidStoredLaunch} from './stored-launch-policy.mjs';
export {InvalidStoredLaunch} from './stored-launch-policy.mjs';
import {PublicKey} from '@solana/web3.js';
/** DB feed is ordered by recorded registration time, never presented as chain launch time. */
export async function indexLaunch(db,row,now=Date.now()){
 if(!['mainnet-beta','devnet'].includes(row.network)||row.verification!=='confirmed-on-chain'||!row.platformId||!row.creator||!row.pool||!Number.isFinite(Date.parse(row.createdAt)))throw Error('Incomplete verified launch record.');
 await db.prepare(`INSERT INTO launch_index(network,mint,platform_id,creator,pool,created_at,record,indexed_at) VALUES(?,?,?,?,?,?,?,?)
 ON CONFLICT(network,mint) DO UPDATE SET record=excluded.record,indexed_at=excluded.indexed_at
 WHERE launch_index.platform_id=excluded.platform_id AND launch_index.creator=excluded.creator AND launch_index.pool=excluded.pool`)
 .bind(row.network,row.mint,row.platformId,row.creator,row.pool,row.createdAt,JSON.stringify(row),now).run();
}
/** @param {string|null} cursor @param {string|null} creator */
export async function indexedLaunchPage(db,network,platform,cursor=null,creator=null){
 let after=null;
 if(cursor){if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(cursor))throw Error('Invalid directory cursor.');after=await db.prepare('SELECT created_at,mint FROM launch_index WHERE network=? AND platform_id=? AND mint=?').bind(network,platform,cursor).first();if(!after)throw Error('Directory cursor not found.');}
 const filters='network=? AND platform_id=?'+(creator?' AND creator=?':'');const bindings=[network,platform,...(creator?[creator]:[])];
 const count=await db.prepare(`SELECT count(*) AS total FROM launch_index WHERE ${filters}`).bind(...bindings).first();
 const page=await db.prepare(`SELECT record FROM launch_index WHERE ${filters}${after?' AND (created_at<? OR (created_at=? AND mint<?))':''} ORDER BY created_at DESC,mint DESC LIMIT 31`).bind(...bindings,...(after?[after.created_at,after.created_at,after.mint]:[])).all();
 const rows=[];for(const saved of page.results){try{const parsed=JSON.parse(saved.record);if(parsed?.mint)rows.push(parsed);}catch{/* One corrupt record does not fail the directory. */}}const launches=rows.slice(0,30);
 return {launches,total:Number(count?.total||0),nextCursor:rows.length>30?launches.at(-1).mint:null};
}
/** Bounded migration of previously verified R2 records; resumable after process loss. */
/** Current R2 backfill state key. Bump the version to revalidate every stored record. */
export const r2BackfillKey=(network,platform)=>'r2:v3:'+network+':'+platform;
export const MAX_STORED_LAUNCH_BYTES=262144;
async function storedLaunchText(value){
 if(Number.isFinite(value.size)&&value.size>MAX_STORED_LAUNCH_BYTES){await value.body?.cancel?.();throw new InvalidStoredLaunch('Stored launch exceeds size limit.');}
 if(value.body?.getReader){
  const reader=value.body.getReader(),parts=[];let total=0;const execution=currentIndexerExecution();
  const abort=()=>{reader.cancel().catch(()=>{});};execution?.signal.addEventListener('abort',abort,{once:true});
  try{for(;;){const {done,value:chunk}=await (execution?execution.wait(reader.read()):reader.read());if(done)break;total+=chunk.byteLength;if(total>MAX_STORED_LAUNCH_BYTES)throw new InvalidStoredLaunch('Stored launch exceeds size limit.');parts.push(chunk);}}
  catch(error){try{await reader.cancel();}catch{}throw error;}finally{execution?.signal.removeEventListener('abort',abort);reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of parts){bytes.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder().decode(bytes);
 }
 // Compatibility adapters without streaming: still reject before JSON parsing.
 const text=await value.text();if(new TextEncoder().encode(text).byteLength>MAX_STORED_LAUNCH_BYTES)throw new InvalidStoredLaunch('Stored launch exceeds size limit.');return text;
}

export async function backfillStoredLaunches(db,storage,network,platform,{verify=async row=>row,limit=10,retryErrors=false}={}){
 const key=r2BackfillKey(network,platform)+(retryErrors?':cron-resumable':''),state=await db.prepare('SELECT cursor,coverage FROM indexer_state WHERE key=?').bind(key).first();
 if(['complete','complete-with-gaps'].includes(state?.coverage))return {complete:state.coverage==='complete',indexed:0,coverage:state.coverage};
 const page=await storage.list({prefix:`launches/${network}/`,limit,...(state?.cursor?{cursor:state.cursor}:{})});let indexed=0,quarantined=0;
 for(const object of page.objects){
  const errorKey='r2-error:'+object.key;
  const previous=await db.prepare('SELECT cursor FROM indexer_state WHERE key=?').bind(errorKey).first();
  let prior=null;try{prior=previous?.cursor?JSON.parse(previous.cursor):null;}catch{/* Legacy gap rows had no item ledger. */}
  if(retryErrors&&prior?.status==='quarantined'){quarantined++;continue;}
  const attempt={status:'pending',attempts:(Number.isSafeInteger(prior?.attempts)?prior.attempts:0)+1,lastAttemptAt:Date.now()};
  const record=async(status,reason=null)=>db.prepare('INSERT INTO indexer_state(key,cursor,updated_at,coverage,error) VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET cursor=excluded.cursor,updated_at=excluded.updated_at,coverage=excluded.coverage,error=excluded.error').bind(errorKey,JSON.stringify({...attempt,status}),Date.now(),reason?'gap':status==='verified'||status==='foreign'?'complete':'partial',reason).run();
  await record('pending');
  try{
   const value=await storage.get(object.key);if(!value)throw Error('Stored record unavailable.');
   let row;try{row=JSON.parse(await storedLaunchText(value));}catch(error){if(error instanceof SyntaxError)throw new InvalidStoredLaunch('Stored launch JSON is malformed.');throw error;}
   if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.network!=='string'||typeof row.platformId!=='string')throw new InvalidStoredLaunch('Stored launch identity is malformed.');
   if(row.platformId!==platform||row.network!==network){await record('foreign');continue;}
   if(typeof row.mint!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(row.mint))throw new InvalidStoredLaunch('Stored launch mint is malformed.');
   try{if(new PublicKey(row.mint).toBase58()!==row.mint)throw Error();}catch{throw new InvalidStoredLaunch('Stored launch mint is not a canonical public key.');}
   const verified=await verify(row);await indexLaunch(db,verified);await record('verified');indexed++;
  }catch(error){
   const permanent=error instanceof InvalidStoredLaunch;
   await record(permanent?'quarantined':'retry',permanent?error.message:'Stored launch temporarily unavailable; retry pending.');
   if(retryErrors&&!permanent)throw error;
   if(permanent)quarantined++;
  }
 }
 const gaps=await db.prepare("SELECT count(*) AS n FROM indexer_state WHERE key>='r2-error:' AND key<'r2-error;' AND error IS NOT NULL").first();
 const coverage=page.truncated?'partial':gaps.n?'complete-with-gaps':'complete';
 await db.prepare('INSERT INTO indexer_state(key,cursor,updated_at,coverage) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET cursor=excluded.cursor,updated_at=excluded.updated_at,coverage=excluded.coverage,error=NULL').bind(key,page.truncated?page.cursor:null,Date.now(),coverage).run();
 return {complete:coverage==='complete',indexed,quarantined,coverage};
}
