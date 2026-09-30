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
export async function backfillStoredLaunches(db,storage,network,platform,{verify=async row=>row,limit=10,retryErrors=false}={}){
 // Revalidate older records after creator-declaration attribution changed.
 const key=r2BackfillKey(network,platform)+(retryErrors?':cron-resumable':''),state=await db.prepare('SELECT cursor,coverage FROM indexer_state WHERE key=?').bind(key).first();
 if(['complete','complete-with-gaps'].includes(state?.coverage))return {complete:state.coverage==='complete',indexed:0,coverage:state.coverage};
 const page=await storage.list({prefix:`launches/${network}/`,limit,...(state?.cursor?{cursor:state.cursor}:{})});let indexed=0;
 for(const object of page.objects){const errorKey='r2-error:'+object.key;try{const value=await storage.get(object.key);if(!value)throw Error('Stored record disappeared.');const row=JSON.parse(await value.text());if(row.platformId!==platform||row.network!==network)continue;await indexLaunch(db,await verify(row));await db.prepare('DELETE FROM indexer_state WHERE key=?').bind(errorKey).run();indexed++;}catch(error){if(retryErrors)throw error;await db.prepare('INSERT INTO indexer_state(key,updated_at,coverage,error) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET updated_at=excluded.updated_at,error=excluded.error').bind(errorKey,Date.now(),'gap','Stored launch could not be indexed. Review and retry R2 backfill.').run();}}
 const gaps=await db.prepare("SELECT count(*) AS n FROM indexer_state WHERE key>='r2-error:' AND key<'r2-error;' AND error IS NOT NULL").first();
 const coverage=page.truncated?'partial':gaps.n?'complete-with-gaps':'complete';
 await db.prepare('INSERT INTO indexer_state(key,cursor,updated_at,coverage) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET cursor=excluded.cursor,updated_at=excluded.updated_at,coverage=excluded.coverage,error=NULL').bind(key,page.truncated?page.cursor:null,Date.now(),coverage).run();
 return {complete:coverage==='complete',indexed,coverage};
}
