/** RPC budget algorithm and validation without operational defaults (proposal; see README.md).
 * Callers must supply a complete, bounded defaults object. Nothing here is unbounded or optional. */
/** Billing CU estimates, separate from Solana transaction compute units.
 * Source: https://www.alchemy.com/docs/reference/compute-unit-costs */
const costs={getAccountInfo:10,getBalance:10,getGenesisHash:10,getMinimumBalanceForRentExemption:10,getRecentPrioritizationFees:10,getTokenAccountsByOwner:10,getTransaction:40,getSignaturesForAddress:40};
export const RPC_CAP_KEYS=Object.freeze(['RPC_WINDOW_MS','RPC_GLOBAL_WINDOW_CU','RPC_TRADE_WINDOW_CU','RPC_DISPLAY_WINDOW_CU','RPC_TRADE_DAILY_CU','RPC_DISPLAY_DAILY_CU','RPC_BUDGET_LEASE_CU','RPC_RECOVERY_DAILY_CU']);
export function rpcComputeUnits(method){return costs[method]??20;}
export function createRpcCaps(defaults){
 if(!defaults||RPC_CAP_KEYS.some(key=>!Number.isSafeInteger(defaults[key]))||Object.keys(defaults).length!==RPC_CAP_KEYS.length)throw Error('RPC cap defaults must define every cap as an integer.');
 const rpcCaps=(env={})=>{
  const config={};for(const key of RPC_CAP_KEYS){
   const value=env[key]===undefined||env[key]===''?defaults[key]:Number(env[key]);
   if(!Number.isSafeInteger(value)||value<1||value>1_000_000_000_000)throw Error(`Invalid ${key} configuration.`);
   config[key]=value;
  }
  if(config.RPC_WINDOW_MS>60_000)throw Error('RPC_WINDOW_MS must be at most 60000.');
  if(config.RPC_TRADE_WINDOW_CU+config.RPC_DISPLAY_WINDOW_CU>config.RPC_GLOBAL_WINDOW_CU)throw Error('RPC lane windows exceed the global cap.');
  // Unset means one fifth of the trade window, so custom windows keep a proportional reserve.
  const reserved=env.RPC_TRADE_RESERVED_CU===undefined||env.RPC_TRADE_RESERVED_CU===''?Math.floor(config.RPC_TRADE_WINDOW_CU/5):Number(env.RPC_TRADE_RESERVED_CU);
  if(!Number.isSafeInteger(reserved)||reserved<0)throw Error('Invalid RPC_TRADE_RESERVED_CU configuration.');
  if(reserved>=config.RPC_TRADE_WINDOW_CU)throw Error('RPC_TRADE_RESERVED_CU must be smaller than RPC_TRADE_WINDOW_CU.');
  config.RPC_TRADE_RESERVED_CU=reserved;
  return config;
 };
 rpcCaps({}); // the defaults themselves must pass every bound and cross-check
 return rpcCaps;
}

// One atomic statement reserves a batch against ALL three caps. No separate
// read/update race and no partial daily/window reservation. Unused credits are
// deliberately not refunded: Worker eviction can reduce capacity, never overspend.
const RESERVE=`WITH state AS (
 SELECT CASE WHEN window=?1 THEN trade_window ELSE 0 END AS tw,
 CASE WHEN window=?1 THEN display_window ELSE 0 END AS dw,
 CASE WHEN day=?2 THEN trade_day ELSE 0 END AS td,
 CASE WHEN day=?2 THEN display_day ELSE 0 END AS dd
 FROM (SELECT 1) LEFT JOIN rpc_budget_state ON key='global'
 WHERE rpc_budget_state.window IS NULL OR (rpc_budget_state.window<=?1 AND rpc_budget_state.day<=?2)
), allocation AS (
 SELECT *,max(0,min(?3,?4-tw-dw,?5-CASE WHEN ?6=1 THEN tw ELSE dw END,
 ?7-CASE WHEN ?6=1 THEN td ELSE dd END)) AS n FROM state
)
INSERT INTO rpc_budget_state (key,window,day,trade_window,display_window,trade_day,display_day,granted)
SELECT 'global',?1,?2,tw+CASE WHEN ?6=1 THEN n ELSE 0 END,dw+CASE WHEN ?6=0 THEN n ELSE 0 END,
td+CASE WHEN ?6=1 THEN n ELSE 0 END,dd+CASE WHEN ?6=0 THEN n ELSE 0 END,n FROM allocation WHERE n>=?8
ON CONFLICT(key) DO UPDATE SET window=excluded.window,day=excluded.day,trade_window=excluded.trade_window,
display_window=excluded.display_window,trade_day=excluded.trade_day,display_day=excluded.display_day,granted=excluded.granted
RETURNING granted`;

export function createRpcBudgetAllocator(rpcCaps){
 const databases=new WeakMap();
 return async function reserve(db,method,{lane='display',dailyExempt=false,env={},now=()=>Date.now()}={}){
  if(!['trade','display'].includes(lane))throw Error('Unknown RPC budget lane.');
  const cap=rpcCaps(env),cost=rpcComputeUnits(method);
  let buckets=databases.get(db);if(!buckets){buckets=new Map();databases.set(db,buckets);}
  const fingerprint=JSON.stringify(cap),key=lane+':'+dailyExempt;
  let bucket=buckets.get(key);
  if(!bucket){bucket={credit:0,window:-1,day:-1,fingerprint:'',pending:Promise.resolve(),denied:false,nextBatch:0};buckets.set(key,bucket);}
  // Serialize only allocation bookkeeping in this isolate, not the RPC fetch.
  const previous=bucket.pending;let unlock;bucket.pending=new Promise(r=>{unlock=r;});await previous;
  try{
   for(;;){
    const time=now(),window=Math.floor(time/cap.RPC_WINDOW_MS),day=Math.floor(time/86_400_000);
    if(bucket.window!==window||bucket.day!==day||bucket.fingerprint!==fingerprint)Object.assign(bucket,{credit:0,window,day,fingerprint,denied:false});
    if(bucket.credit>=cost){bucket.credit-=cost;return true;}
    if(bucket.denied)return false;
    const trade=lane==='trade',wanted=Math.max(cost,Math.min(cap.RPC_BUDGET_LEASE_CU,bucket.nextBatch||cost));
    // Ordinary trade reads stop short of the lane window, so sends and checks of
    // recorded submissions (the daily-exempt trade traffic) always keep this reserve.
    const laneWindow=trade?cap.RPC_TRADE_WINDOW_CU-(dailyExempt?0:cap.RPC_TRADE_RESERVED_CU):cap.RPC_DISPLAY_WINDOW_CU;
    const row=await db.prepare(RESERVE).bind(window,day,wanted,cap.RPC_GLOBAL_WINDOW_CU,
     laneWindow,trade?1:0,
     (trade?cap.RPC_TRADE_DAILY_CU:cap.RPC_DISPLAY_DAILY_CU)+(dailyExempt?cap.RPC_RECOVERY_DAILY_CU:0),cost).first();
    if(window!==Math.floor(now()/cap.RPC_WINDOW_MS)||day!==Math.floor(now()/86_400_000))continue;
    if(!row){bucket.denied=true;return false;}
    bucket.credit+=Number(row.granted);bucket.nextBatch=Math.min(cap.RPC_BUDGET_LEASE_CU,wanted*2);
   }
  }finally{unlock();}
 };
}
