import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
globalThis.readConnectionCalls=[];
await build({entryPoints:['lib/server-chain-connection.ts'],outfile:'.test-output/read-connection.mjs',bundle:true,packages:'external',platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'forward-stub',setup(b){
 b.onResolve({filter:/server-rpc$/},()=>({path:'server-rpc',namespace:'stub'}));
 b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:`export function forwardRpc(network,body,options){globalThis.readConnectionCalls.push({network,method:body.method,lane:options?.lane??'display'});return {jsonrpc:'2.0',id:body.id,result:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'};}`,loader:'js'}));
}}]});
const {readConnection}=await import('../.test-output/read-connection.mjs');
test('readConnection forwards mainnet reads on the default display lane and rejects devnet',async()=>{
 globalThis.readConnectionCalls=[];
 assert.equal(await readConnection('mainnet-beta').getGenesisHash(),'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');
 assert.equal(await readConnection().getGenesisHash(),'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');
 assert.deepEqual(globalThis.readConnectionCalls.map(call=>[call.network,call.method,call.lane]),[['mainnet-beta','getGenesisHash','display'],['mainnet-beta','getGenesisHash','display']]);
 assert.throws(()=>readConnection('devnet'),/mainnet/);
 assert.equal(globalThis.readConnectionCalls.length,2);
});
