import {database} from './server-owner';
import {reserveRpcBudget} from './shared-market-cache.mjs';
import {env} from "cloudflare:workers";
import {NETWORKS,type Network} from "./site-config";

type RequestBody={jsonrpc:"2.0";id:string|number|null;method:string;params?:unknown[]};
type RpcResponse={jsonrpc:"2.0";id:RequestBody["id"];result?:any;error?:{code:number;message:string;data?:unknown}};
const inFlight=new Map<string,Promise<RpcResponse>>();
export function hasPrivateRpc(){return Boolean((env as unknown as {SOLANA_RPC_URL?:string}).SOLANA_RPC_URL);}
function endpoints(network:Network){
 const privateUrl=(env as unknown as {SOLANA_RPC_URL?:string}).SOLANA_RPC_URL;
 if(network==="mainnet-beta"&&privateUrl){const u=new URL(privateUrl);if(u.protocol!=="https:")throw Error("Invalid RPC configuration.");return [privateUrl];}
 return network==="mainnet-beta"?[NETWORKS[network].rpc,"https://api.mainnet-beta.solana.com"]:[NETWORKS[network].rpc];
}
export async function forwardRpc(network:Network,body:RequestBody):Promise<RpcResponse>{
 const read=body.method!=="sendTransaction"&&body.method!=="simulateTransaction";
 const key=JSON.stringify([network,body.method,body.params]);
 async function execute(){
  const urls=endpoints(network);
  for(let i=0;i<(read?urls.length:1);i++){
   if(!await reserveRpcBudget(database(),body.method))return {jsonrpc:"2.0" as const,id:body.id,error:{code:-32005,message:"Shared RPC limit reached. Wait before retrying. Check any submitted signature first."}};
   try{
    const r=await fetch(urls[i],{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
    if(!r.ok){await r.body?.cancel();continue;}
    const data=await r.json() as RpcResponse;
    if(data.error?.code===-32005&&read)continue;
    return {...data,id:body.id};
   }catch{/* Never log provider URLs or API keys. Never retry a send. */}
  }
  return {jsonrpc:"2.0" as const,id:body.id,error:{code:-32005,message:"Network connection unavailable. Check any submitted signature before trying again."}};
 }
 if(!read)return execute();
 let task=inFlight.get(key);
 if(!task){task=execute();inFlight.set(key,task);void task.finally(()=>inFlight.delete(key));}
 return {...await task,id:body.id};
}
export async function chain(network:Network,method:string,params:unknown[]=[]){
 const data=await forwardRpc(network,{jsonrpc:"2.0",id:1,method,params});
 if(data.error)throw Error("Chain verification is temporarily unavailable. Please retry.");
 return data.result;
}
