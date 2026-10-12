/** One atomic SQLite statement, shared by every Worker. Replays do not grant new work. */
export async function consumeRequestBudget(db,key,limit,{windowMs=60_000,now=Date.now()}={}){
 const window=Math.floor(now/windowMs);
 const row=await db.prepare(`INSERT INTO rpc_budget (key,window,used) VALUES (?,?,1)
 ON CONFLICT(key) DO UPDATE SET window=excluded.window,used=CASE WHEN rpc_budget.window=excluded.window THEN rpc_budget.used+1 ELSE 1 END
 WHERE rpc_budget.window<excluded.window OR (rpc_budget.window=excluded.window AND rpc_budget.used<?)
 RETURNING used`).bind(key,window,limit).first();
 return Boolean(row);
}
/** Distinct sends only: replaying identical bytes must remain possible after a lost response. */
export async function consumeSendBudget(db,client,signature,limit,now=Date.now()){
 const window=Math.floor(now/60_000);
 const row=await db.prepare(`INSERT INTO rpc_client_submissions(client,signature,window)
 SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM rpc_client_submissions WHERE client=?1 AND signature=?2 AND window=?3)
 OR (SELECT count(*) FROM rpc_client_submissions WHERE client=?1 AND window=?3)<?4
 ON CONFLICT(client,signature) DO UPDATE SET window=excluded.window WHERE rpc_client_submissions.window<=excluded.window
 RETURNING signature`).bind(client,signature,window,limit).first();
 return Boolean(row);
}
