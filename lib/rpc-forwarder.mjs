import {blockHeightWireRequest,blockHeightCallerResponse} from './rpc-block-height.mjs';
import {sanitizeRpcDiagnostic} from './rpc-diagnostic.mjs';
import {acquireResourceLease} from './resource-leases.mjs';
import {reserveRpcBudget} from './rpc-budget.mjs';
import {dailyExemption} from './rpc-submissions.mjs';
const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',DEVNET='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const reads=new Set(['isBlockhashValid','getGenesisHash','getLatestBlockhash','getBlockHeight','getBalance','getAccountInfo','getMultipleAccounts','getEpochInfo','getSlot','getTokenAccountsByOwner','getMinimumBalanceForRentExemption','getFeeForMessage','getSignatureStatuses','getTransaction','getRecentPrioritizationFees','getSignaturesForAddress']);
const transient=new Set([-32005,-32004,-32007,-32009,-32016,-32603]);
function endpoint(value){try{if(new URL(value).protocol==='https:')return value;}catch{}throw Error('Invalid RPC configuration.');}
export function rpcEndpoints(network,env={}){
 const primary=endpoint(network==='mainnet-beta'?(env.SOLANA_RPC_URL||'https://solana-rpc.publicnode.com'):'https://api.devnet.solana.com');
 const fallback=network==='mainnet-beta'?endpoint(env.SOLANA_READ_RPC_URL||'https://api.mainnet-beta.solana.com'):null;
 return {primary,fallback:fallback!==primary?fallback:null};
}
export function createRpcForwarder({database,env={},fetcher=fetch,now=()=>Date.now(),reserve=reserveRpcBudget,acquire=acquireResourceLease}){
 const inFlight=new Map(),genesisChecks=new Map();
 return async function forward(network,body,{lane='display',submittedSignature,submissionValidation=false,primaryOnly=false,archival=false,signal=undefined,diagnostics=false}={}){
  const diagnosticAttempts=[];
  const note=(category,extra={})=>{if(diagnostics)diagnosticAttempts.push({category,...extra});};
  const attach=data=>diagnostics?{...data,diagnostic:sanitizeRpcDiagnostic({category:diagnosticAttempts.at(-1)?.category??'unknown',attempts:diagnosticAttempts})}:data;
  const read=reads.has(body.method),exempt=submissionValidation||await dailyExemption(database(),network,body,submittedSignature,now());
  const key=JSON.stringify([network,lane,exempt,primaryOnly,archival,diagnostics,body.method,body.params]);
  const error=message=>attach({jsonrpc:'2.0',id:body.id,error:{code:-32005,message}});
  if(archival&&(network!=='mainnet-beta'||lane!=='display'||exempt||primaryOnly||body.method!=='getTransaction'||body.params?.[1]?.commitment!=='finalized'))return error('Archival recovery requires a finalized mainnet display read.');
  const budget=method=>reserve(database(),method,{lane,dailyExempt:exempt,env,now});
  async function request(url,payload){
   if(signal?.aborted){note('cancelled');throw Error('RPC execution cancelled.');}
   const release=await acquire(database(),exempt?'rpc-recovery':lane==='trade'?'rpc-trade':'rpc-display',{slots:exempt?4:lane==='trade'?8:8,ttlMs:30_000,now:now()});
   if(!release){note('concurrency');throw Error('RPC concurrency reached.');}
   try{
   if(signal?.aborted){note('cancelled');throw Error('RPC execution cancelled.');}
   const r=await fetcher(url,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(blockHeightWireRequest(payload)),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(5_000)]):AbortSignal.timeout(12_000)});
   if(!r.ok){note('transport',{httpStatus:r.status});await r.body?.cancel();throw Error('RPC transport unavailable.');}
   let data;
   if(signal){const reader=r.body?.getReader();if(!reader)throw Error('Empty RPC response.');const chunks=[];let bytes=0;try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>2*1024*1024)throw Error('RPC response exceeds indexing bound.');chunks.push(chunk.value);}}catch(error){await reader.cancel();throw error;}const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}data=JSON.parse(new TextDecoder().decode(joined));}
   else data=await r.json();
   if(data?.jsonrpc!=='2.0'||(!Object.hasOwn(data,'result')&&!data.error)){note('invalid-response');throw Error('Invalid RPC response.');}
   try{data=blockHeightCallerResponse(payload,data);}catch(error){note('invalid-response');throw error;}
   if(data.error)note('provider',{providerCode:data.error.code});
   return {...data,id:body.id};
   }finally{await release();}
  }
  async function execute(){
   const {primary,fallback}=rpcEndpoints(network,env),urls=read&&fallback&&!primaryOnly?[primary,fallback]:[primary];
   for(let i=0;i<urls.length;i++){
    if(signal?.aborted){note('cancelled');return error('RPC execution cancelled.');}
    if(i&&body.method!=='getGenesisHash'&&(genesisChecks.get(urls[i])||0)<=now()){
     if(!await budget('getGenesisHash')){note('budget');return error('Shared RPC window or lane budget reached. Wait before retrying.');}
     const attemptStart=diagnosticAttempts.length;
     try{const check=await request(urls[i],{jsonrpc:'2.0',id:body.id,method:'getGenesisHash',params:[]});
      if(check.result!==(network==='mainnet-beta'?MAINNET:DEVNET)){note('fallback-network');return error('Fallback RPC network verification failed.');}
      genesisChecks.set(urls[i],now()+600_000);
     }catch{if(diagnosticAttempts.length===attemptStart)note('transport');return error('Read fallback is unavailable. Check the submitted signature before retrying.');}
    }
    if(!await budget(body.method)){note('budget');return error('Shared RPC window or lane budget reached. Wait before retrying. Check any submitted signature first.');}
    const attemptStart=diagnosticAttempts.length;
    try{
     const data=await request(urls[i],body);
     // Only chart recovery opts into an archive lookup when the primary has no receipt.
     if(archival&&!data.error&&data.result===null&&i+1<urls.length)continue;
     if(data.error&&transient.has(data.error.code)&&read&&i+1<urls.length)continue;
     // A lagging fallback's negative answer cannot prove non-inclusion or expiry.
     // Positive status still helps after an ambiguous send; absence remains unknown.
     if(i&&((body.method==='getSignatureStatuses'&&data.result?.value?.some(value=>!value))||(body.method==='getTransaction'&&exempt&&data.result===null))){note('fallback-absence');return error('Read fallback cannot yet verify this signature. Keep the receipt and check again.');}
     return attach(data);
    }catch{if(diagnosticAttempts.length===attemptStart)note('transport');/* No provider URLs or keys in logs. */}
   }
   return error('Network connection unavailable. Check any submitted signature before trying again.');
  }
  if(!read||signal)return execute();
  let task=inFlight.get(key);
  if(!task){task=execute();inFlight.set(key,task);void task.finally(()=>inFlight.delete(key)).catch(()=>{});}
  return {...await task,id:body.id};
 };
}
