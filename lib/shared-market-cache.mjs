/** Database leases share refreshes across viewers AND Worker instances. No wallet/quote data belongs here. */
export async function sharedMarketCache(db,key,load,{ttl=30_000,maxStale=300_000,now=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const read=()=>db.prepare('SELECT * FROM market_cache WHERE key=?').bind(key).first();
 const usable=row=>row?.value!==null&&row?.value!==undefined&&now()-row.updated_at<=maxStale;
 const result=(row,stale)=>({data:JSON.parse(row.value),updatedAt:row.updated_at,stale});
 let row=await read();
 if(row?.value&&row.expires_at>now()&&row.updated_at+ttl>now())return result(row,false);
 await db.prepare('INSERT INTO market_cache (key) VALUES (?) ON CONFLICT(key) DO NOTHING').bind(key).run();
 const owner=crypto.randomUUID(),start=now();
 const lease=await db.prepare('UPDATE market_cache SET lease_until=?,lease_owner=? WHERE key=? AND expires_at<=? AND lease_until<=? RETURNING key').bind(start+90_000,owner,key,start,start).first();
 if(!lease){
  if(usable(row))return result(row,true);
  // Wait briefly for the one cold refresh. Never start a duplicate RPC on timeout.
  for(let n=0;n<30;n++){await sleep(Math.min(50*2**n,400));row=await read();if(usable(row))return result(row,row.updated_at+ttl<=now());if(row?.expires_at>now()&&!row?.value)break;}
  throw Error('Market data is updating. Please retry shortly.');
 }
 try{
  const data=await load(row?.value?JSON.parse(row.value):null),updatedAt=now();
  const saved=await db.prepare('UPDATE market_cache SET value=?,updated_at=?,expires_at=?,lease_until=0,lease_owner=NULL WHERE key=? AND lease_owner=? RETURNING key').bind(JSON.stringify(data),updatedAt,updatedAt+ttl,key,owner).first();
  if(!saved)throw Error('Market refresh expired.');
  return {data,updatedAt,stale:false};
 }catch(error){
  // Back off on outage/rate limit without making old data appear freshly fetched.
  await db.prepare('UPDATE market_cache SET expires_at=?,lease_until=0,lease_owner=NULL WHERE key=? AND lease_owner=?').bind(now()+30_000,key,owner).run();
  if(usable(row))return result(row,true);
  throw error;
 }
}

const rpcCost={getAccountInfo:10,getBalance:10,getGenesisHash:10,getMinimumBalanceForRentExemption:10,getRecentPrioritizationFees:10,getTokenAccountsByOwner:10,getTransaction:40,getSignaturesForAddress:40};
export function rpcComputeUnits(method){return rpcCost[method]??20;}
/** Atomic, bounded rows: a site-wide 200 CU/s ceiling plus 900k estimated CU/day. */
export async function takeBudget(db,key,amount,limit,windowMs,now=Date.now()){
 if(!Number.isSafeInteger(amount)||amount<=0||amount>limit)return false;
 const window=Math.floor(now/windowMs);
 const row=await db.prepare(`INSERT INTO rpc_budget (key,window,used) VALUES (?,?,?)
 ON CONFLICT(key) DO UPDATE SET window=excluded.window,used=CASE WHEN rpc_budget.window=excluded.window THEN rpc_budget.used+excluded.used ELSE excluded.used END
 WHERE rpc_budget.window<>excluded.window OR rpc_budget.used+excluded.used<=? RETURNING used`).bind(key,window,amount,limit).first();
 return amount<=limit&&Boolean(row);
}
export async function reserveRpcBudget(db,method,now=Date.now()){
 const cost=rpcComputeUnits(method);
 if(!await takeBudget(db,'rpc-second',cost,200,1000,now))return false;
 return takeBudget(db,'rpc-day',cost,900_000,86_400_000,now);
}
