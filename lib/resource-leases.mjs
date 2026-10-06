/** Atomic global slots across isolates. No waiting queue and no private data in keys. */
/** @param {{slots:number,ttlMs:number,now?:number}} options */
export async function acquireResourceLease(db,resource,{slots,ttlMs,now=Date.now()}){
 if(!/^[a-z-]+$/.test(resource)||!Number.isInteger(slots)||slots<1||slots>64||!Number.isInteger(ttlMs)||ttlMs<1)throw Error('Invalid resource lease.');
 const owner=crypto.randomUUID();
 const row=await db.prepare(`WITH RECURSIVE slots(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM slots WHERE n+1<?)
 INSERT INTO resource_lease(resource,slot,owner,until_ms)
 SELECT ?,n,?,? FROM slots WHERE NOT EXISTS(SELECT 1 FROM resource_lease WHERE resource=? AND slot=n AND until_ms>?) ORDER BY n LIMIT 1
 ON CONFLICT(resource,slot) DO UPDATE SET owner=excluded.owner,until_ms=excluded.until_ms WHERE resource_lease.until_ms<=?
 RETURNING slot`).bind(slots,resource,owner,now+ttlMs,resource,now,now).first();
 if(!row)return null;
 return async()=>{await db.prepare('DELETE FROM resource_lease WHERE resource=? AND slot=? AND owner=?').bind(resource,row.slot,owner).run();};
}
