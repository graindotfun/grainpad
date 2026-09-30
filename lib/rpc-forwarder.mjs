import {acquireResourceLease} from './resource-leases.mjs';
import {reserveRpcBudget} from './rpc-budget.mjs';
import {dailyExemption} from './rpc-submissions.mjs';
const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',DEVNET='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const reads=new Set(['getGenesisHash','getLatestBlockhash','getBlockHeight','getBalance','getAccountInfo','getMultipleAccounts','getEpochInfo','getSlot','getTokenAccountsByOwner','getMinimumBalanceForRentExemption','getFeeForMessage','getSignatureStatuses','getTransaction','getRecentPrioritizationFees','getSignaturesForAddress']);
const transient=new Set([-32005,-32004,-32007,-32009,-32016,-32603]);
function endpoint(value){try{if(new URL(value).protocol==='https:')return value;}catch{}throw Error('Invalid RPC configuration.');}
export function rpcEndpoints(network,env={}){
 const primary=endpoint(network==='mainnet-beta'?(env.SOLANA_RPC_URL||'https://solana-rpc.publicnode.com'):'https://api.devnet.solana.com');
 const fallback=network==='mainnet-beta'?endpoint(env.SOLANA_READ_RPC_URL||'https://api.mainnet-beta.solana.com'):null;
 return {primary,fallback:fallback!==primary?fallback:null};
}
export function createRpcForwarder({database,env={},fetcher=fetch,now=()=>Date.now(),reserve=reserveRpcBudget,acquire=acquireResourceLease}){
 const inFlight=new Map(),genesisChecks=new Map();
 return async function forward(network,body,{lane='display',submittedSignature,submissionValidation=false}={}){
  const read=reads.has(body.method),exempt=submissionValidation||await dailyExemption(database(),network,body,submittedSignature,now());
  const key=JSON.stringify([network,lane,exempt,body.method,body.params]);
  const error=message=>({jsonrpc:'2.0',id:body.id,error:{code:-32005,message}});
  const budget=method=>reserve(database(),method,{lane,dailyExempt:exempt,env,now});
  async function request(url,payload){
   const release=await acquire(database(),exempt?'rpc-recovery':lane==='trade'?'rpc-trade':'rpc-display',{slots:exempt?4:lane==='trade'?8:8,ttlMs:30_000,now:now()});
   if(!release)throw Error('RPC concurrency reached.');
   try{
   const r=await fetcher(url,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(12_000)});
   if(!r.ok){await r.body?.cancel();throw Error('RPC transport unavailable.');}
   const data=await r.json();
   if(data?.jsonrpc!=='2.0'||(!Object.hasOwn(data,'result')&&!data.error))throw Error('Invalid RPC response.');
   return {...data,id:body.id};
   }finally{await release();}
  }
  async function execute(){
   const {primary,fallback}=rpcEndpoints(network,env),urls=read&&fallback?[primary,fallback]:[primary];
   for(let i=0;i<urls.length;i++){
    if(i&&body.method!=='getGenesisHash'&&(genesisChecks.get(urls[i])||0)<=now()){
     if(!await budget('getGenesisHash'))return error('Shared RPC window or lane budget reached. Wait before retrying.');
     try{const check=await request(urls[i],{jsonrpc:'2.0',id:body.id,method:'getGenesisHash',params:[]});
      if(check.result!==(network==='mainnet-beta'?MAINNET:DEVNET))return error('Fallback RPC network verification failed.');
      genesisChecks.set(urls[i],now()+600_000);
     }catch{return error('Read fallback is unavailable. Check the submitted signature before retrying.');}
    }
    if(!await budget(body.method))return error('Shared RPC window or lane budget reached. Wait before retrying. Check any submitted signature first.');
    try{
     const data=await request(urls[i],body);
     if(data.error&&transient.has(data.error.code)&&read&&i+1<urls.length)continue;
     // A lagging fallback's negative answer cannot prove non-inclusion or expiry.
     // Positive status still helps after an ambiguous send; absence remains unknown.
     if(i&&((body.method==='getSignatureStatuses'&&data.result?.value?.some(value=>!value))||(body.method==='getTransaction'&&exempt&&data.result===null)))return error('Read fallback cannot yet verify this signature. Keep the receipt and check again.');
     return data;
    }catch{/* No provider URLs or keys in logs. Sends/simulations use primary only. */}
   }
   return error('Network connection unavailable. Check any submitted signature before trying again.');
  }
  if(!read)return execute();
  let task=inFlight.get(key);
  if(!task){task=execute();inFlight.set(key,task);void task.finally(()=>inFlight.delete(key)).catch(()=>{});}
  return {...await task,id:body.id};
 };
}
