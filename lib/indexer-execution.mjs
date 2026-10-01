import {sanitizeRpcDiagnostic} from './rpc-diagnostic.mjs';
/** One application deadline; every D1 mutation is fenced inside its transaction.
 * D1/R2 reads cannot be cancelled by this API. Their late results are discarded.
 * Platform stalls can delay HTTP delivery; a timed-out response is never a PASS.
 */
import {AsyncLocalStorage} from 'node:async_hooks';
import {InvalidStoredLaunch} from './stored-launch-policy.mjs';
const scope=new AsyncLocalStorage();
export const DB_NOW="CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)";
export const WORK_MS=20_000, RESPONSE_MS=25_000;
export class IndexerDeadline extends Error {constructor(){super('Indexer execution deadline or lease ended.');}}
export const currentIndexerExecution=()=>scope.getStore();
export function executionDatabase(db){return scope.getStore()?.database(db)??db;}
export function executionStorage(storage){return scope.getStore()?.storage(storage)??storage;}
export function createExecution(raw,{id,deadline,signal}){
 const mapped=new WeakMap();
 const check=()=>{if(signal.aborted||Date.now()>=deadline)throw new IndexerDeadline();};
 const wait=async task=>{check();let abort;try{return await Promise.race([task,new Promise((_,reject)=>{abort=()=>reject(new IndexerDeadline());signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();})]).then(result=>{check();return result;});}finally{signal.removeEventListener('abort',abort);}};
 const guard=()=>raw.prepare(`INSERT INTO indexer_execution_guard(id,valid) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM indexer_run r JOIN indexer_lease l ON l.id=1 AND l.owner=r.id WHERE r.id=? AND r.status='running' AND r.deadline_ms>${DB_NOW} AND l.until_ms>${DB_NOW}) THEN 1 ELSE 0 END)`).bind(id,id);
 const finalGuard=()=>raw.prepare(`UPDATE indexer_execution_guard SET valid=CASE WHEN EXISTS(SELECT 1 FROM indexer_run r JOIN indexer_lease l ON l.id=1 AND l.owner=r.id WHERE r.id=? AND r.deadline_ms>${DB_NOW} AND l.until_ms>${DB_NOW}) THEN 1 ELSE 0 END WHERE id=?`).bind(id,id);
 const batch=async statements=>{check();return wait(raw.batch([guard(),...statements,finalGuard(),raw.prepare('DELETE FROM indexer_execution_guard WHERE id=?').bind(id)])).then(results=>results.slice(1,-2));};
 const database=db=>{
  if(db!==raw)throw Error('Unexpected indexer database binding.');
  return {prepare(sql){
   // No caller-controlled SQL. Treat WITH/PRAGMA/unknown as mutations, fail closed.
   const read=/^\s*SELECT\b/i.test(sql);
   const wrap=statement=>{
    const invoke=async(method,args)=>{check();if(read)return wait(statement[method](...args));if(method==='raw')throw Error('Raw mutations unsupported.');const [result]=await batch([statement]);if(method==='first')return args[0]?result.results?.[0]?.[args[0]]??null:result.results?.[0]??null;if(method==='raw')throw Error('Raw mutations unsupported.');return result;};
    const value={bind(...values){return wrap(statement.bind(...values));},run(...args){return invoke('run',args);},all(...args){return invoke('all',args);},first(...args){return invoke('first',args);},raw(...args){return invoke('raw',args);}};
    mapped.set(value,statement);return value;
   };return wrap(db.prepare(sql));
  },batch(statements){return batch(statements.map(s=>{const rawStatement=mapped.get(s);if(!rawStatement)throw Error('Unfenced indexer statement.');return rawStatement;}));}};
 };
 const storage=binding=>({
  async get(key){check();
   const launch=/^launches\/(mainnet-beta)\/([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(key);
   if(launch){const indexed=await database(raw).prepare('SELECT record FROM launch_index WHERE network=? AND mint=?').bind(launch[1],launch[2]).first();if(indexed)return {text:async()=>{check();return indexed.record;},json:async()=>{check();return JSON.parse(indexed.record);}};}
   const object=await wait(binding.get(key));if(!object)return null;if(object.size>1048576)throw new InvalidStoredLaunch('Stored JSON exceeds indexer bound.');return new Proxy(object,{get(target,property){const value=Reflect.get(target,property,target);return typeof value==='function'?(...args)=>{check();return wait(value.apply(target,args));}:value;}});},
  async list(options){check();return wait(binding.list(options));},
  put(){throw Error('Scheduled indexing cannot mutate R2.');},delete(){throw Error('Scheduled indexing cannot mutate R2.');}
 });
 return {id,deadline,signal,check,wait,database,storage};
}
/** A completed row describes one bounded step, never complete historical coverage. */
export async function executeIndexer(raw,task,{workMs=WORK_MS,responseMs=RESPONSE_MS,stages=9}={}){
 const id=crypto.randomUUID(),start=Date.now(),deadline=start+workMs,controller=new AbortController();
 let timer;const expired=new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({status:'unknown',runId:id,reason:'deadline',transactionSubmitted:false});},responseMs);});
 const workTimer=setTimeout(()=>controller.abort(),workMs);
 const work=(async()=>{
  await raw.batch([
   raw.prepare(`INSERT INTO indexer_lease(id,owner,until_ms) SELECT 1,?,? WHERE ${DB_NOW}<? ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,until_ms=excluded.until_ms WHERE indexer_lease.until_ms<=${DB_NOW}`).bind(id,deadline,deadline),
   raw.prepare(`INSERT INTO indexer_run(id,started_ms,deadline_ms,status,stage) SELECT ?,${DB_NOW},?,'running',coalesce((SELECT (stage+1)%? FROM indexer_run ORDER BY started_ms DESC,rowid DESC LIMIT 1),0) WHERE EXISTS(SELECT 1 FROM indexer_lease WHERE id=1 AND owner=? AND until_ms>${DB_NOW})`).bind(id,deadline,stages,id)
  ]);
  const row=await raw.prepare('SELECT stage FROM indexer_run WHERE id=?').bind(id).first();
  if(!row)return {status:'busy',runId:id,transactionSubmitted:false};
  const context=createExecution(raw,{id,deadline,signal:controller.signal});
  try{
   const result=await scope.run(context,()=>task(context.database(raw),row.stage,id,context));context.check();if(result?.deferred||result?.failed){const error=new IndexerDeadline();error.diagnostic=sanitizeRpcDiagnostic(result.diagnostic);throw error;}
   // Completion is SQL-clock fenced; no awaited cleanup follows its acknowledgement.
   const encoded=JSON.stringify(result);if(new TextEncoder().encode(encoded).length>8000)throw Error('Indexer summary exceeds bound.');
   const done=await context.database(raw).prepare(`UPDATE indexer_run SET status='step-completed',ended_ms=${DB_NOW},result=? WHERE id=? AND status='running' RETURNING started_ms,ended_ms,deadline_ms`).bind(encoded,id).first();
   context.check();if(!done)throw new IndexerDeadline();
   return {status:'step-completed',runId:id,stage:row.stage,startedMs:done.started_ms,endedMs:done.ended_ms,deadlineMs:done.deadline_ms,result,coverage:'partial',transactionSubmitted:false};
  }catch(error){
   const diagnostic=sanitizeRpcDiagnostic(error?.diagnostic);
   // Best effort failure marker is itself fenced. Expired running rows are UNKNOWN,
   // not successes, and the lease expires without any late release mutation.
   if(!controller.signal.aborted&&Date.now()<deadline){try{await context.database(raw).prepare(`UPDATE indexer_run SET status='deferred',ended_ms=${DB_NOW},result=? WHERE id=?`).bind(diagnostic?JSON.stringify({diagnostic}):null,id).run();}catch{}}
   return {status:controller.signal.aborted?'unknown':'deferred',runId:id,stage:row.stage,transactionSubmitted:false,...(diagnostic?{diagnostic}:{})};
  }
 })().catch(()=>({status:'unknown',runId:id,transactionSubmitted:false}));
 try{return await Promise.race([work,expired]);}finally{clearTimeout(timer);clearTimeout(workTimer);controller.abort();}
}
