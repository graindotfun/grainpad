import {currentIndexerExecution} from './indexer-execution.mjs';
import {database} from './server-owner';
import {createRpcForwarder} from './rpc-forwarder.mjs';
import {env} from 'cloudflare:workers';
import type {Network} from './site-config';
import {isSubmissionValidation} from './submission-validation-context.mjs';
type RequestBody={jsonrpc:'2.0';id:string|number|null;method:string;params?:unknown[]};
type Options={lane?:'trade'|'display';submittedSignature?:string;submissionValidation?:boolean};
export function hasPrivateRpc(){return Boolean((env as unknown as {SOLANA_RPC_URL?:string}).SOLANA_RPC_URL);}
const forward=createRpcForwarder({database,env});
export function forwardRpc(network:Network,body:RequestBody,options:Options={}){const execution=currentIndexerExecution();execution?.check();return forward(network,body,{...options,signal:execution?.signal});}
/** Internal snapshots/discovery/tape never consume the trade lane. */
export async function chain(network:Network,method:string,params:unknown[]=[],submittedSignature?:string){
 const data=await forwardRpc(network,{jsonrpc:'2.0',id:1,method,params},{lane:'display',submittedSignature,submissionValidation:isSubmissionValidation()});
 if(data.error)throw Error('Chain verification is temporarily unavailable. Please retry.');
 return data.result;
}
