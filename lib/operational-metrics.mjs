const names=new Set(['registration','rpc-read','rpc-simulation','rpc-send','rpc-status','upload','official-launch-reconcile']);
/** No wallet/IP/signature dimensions. Metrics cannot turn a successful operation into a failed response. */
export async function recordMetric(db,name,outcome,durationMs=0,now=Date.now()){
 if(!names.has(name)||!['success','failure','pending','finalized','chain-failed'].includes(outcome))throw Error('Invalid operational metric.');
 try{await db.prepare('INSERT INTO operational_metric(minute,name,outcome,count,duration_ms) VALUES(?,?,?,1,?) ON CONFLICT(minute,name,outcome) DO UPDATE SET count=count+1,duration_ms=duration_ms+excluded.duration_ms').bind(Math.floor(now/60_000),name,outcome,Math.min(120_000,Math.max(0,Math.floor(durationMs)))).run();}catch{console.warn('grainpad_metrics_unavailable');}
}
export async function operationalMetrics(db,now=Date.now()){
 const rows=await db.prepare('SELECT name,outcome,sum(count) AS count,sum(duration_ms) AS duration_ms FROM operational_metric WHERE minute>=? GROUP BY name,outcome').bind(Math.floor(now/60_000)-1440).all();
 return {window:'24 hours',events:rows.results,definitions:{registration:'Registration attempts, including retries; success is finalized verification plus indexing.',rpcSend:'Relay acceptance is not landing. Repeated submissions may refer to the same transaction.',rpcStatus:'Status observations, not unique transactions. Finalized and chain-failed come from RPC status evidence.',launchSuccess:'Derive unique launches from launch events and owner rehearsal; attempts are not unique launches.'}};
}
