import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {Miniflare} from 'miniflare';
const mint='A'.repeat(32),pool='B'.repeat(32),signature='C'.repeat(88);
const result=await build({entryPoints:['lib/server-market-live.ts'],bundle:true,platform:'browser',format:'esm',write:false,logLevel:'silent',plugins:[{name:'live-boundaries',setup(b){
 const stubs={
 './server-market':`export const serverMarket=async()=>({pool:'${pool}'});`,
 './server-owner':`export const database=()=>({prepare:()=>({bind:()=>({first:async()=>({record:JSON.stringify({mint:'${mint}',platformId:'platform',verification:'confirmed-on-chain'})})})})});`,
 './server-rpc':`export const chain=async()=>({});`,
 './platform-policy':`export const POLICY={cpConfig:'config'};export const grainpadPlatformId=()=>({toBase58:()=> 'platform'});`,
 './chain-events.mjs':`export const parseChainEvents=()=>[{id:'real-trade',mint:'${mint}',kind:'buy',blockTime:100,slot:10,signature:'${signature}',baseAmount:'1000000',quoteAmount:'2000000',baseDecimals:6,quoteDecimals:6},{id:'foreign',mint:'other',kind:'buy',blockTime:100}];`,
 './shared-market-cache.mjs':'export const takeBudget=async()=>true;export const sharedMarketCache=async(db,key,load)=>({data:await load()});',
 './realtime-ingest.mjs':'export const confirmedCatchup=async()=>[];'
 };b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'stub'}:null);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js'}));
}}]});
const fake=`class TestUpstream extends EventTarget {static OPEN=1;constructor(){super();queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(raw){const body=JSON.parse(raw);if(body.method!=='logsSubscribe'||body.params[0].mentions[0]!=='${pool}'||body.params[1].commitment!=='confirmed')throw Error('Incorrect upstream subscription');queueMicrotask(()=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({id:1,result:99})})));setTimeout(()=>this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({method:'logsNotification',params:{result:{value:{signature:'${signature}',err:null}}}})})),10);}close(){}}
globalThis.WebSocket=TestUpstream;`;
const script=fake+result.outputFiles[0].text.replace(/export\s*\{\s*marketLive\s*\};?\s*$/,'')+`\nexport default {fetch:request=>marketLive(request,{SOLANA_RPC_URL:'https://rpc.example.invalid/never-public-secret'})};`;
test('actual Worker WebSocket handshake streams only verified trades with no upstream URLs or raw logs',async t=>{
 const mf=new Miniflare({modules:true,script,compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat']});t.after(()=>mf.dispose());
 const url='https://grainpad.fun/api/market/'+mint+'/live';
 let response=await mf.dispatchFetch(url);assert.equal(response.status,426);
 response=await mf.dispatchFetch(url,{headers:{Upgrade:'websocket',Origin:'https://foreign.example'}});assert.equal(response.status,403);
 response=await mf.dispatchFetch(url,{headers:{Upgrade:'websocket',Origin:'https://grainpad.fun'}});assert.equal(response.status,101);
 const socket=response.webSocket;assert.ok(socket);socket.accept();const messages=[];
 const trade=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('No live trade')),3000);socket.addEventListener('message',event=>{const body=JSON.parse(event.data);messages.push(body);if(body.type==='trade'){clearTimeout(timeout);resolve(body);}});});
 const body=await trade;assert.equal(body.value,2);assert.equal(body.commitment,'confirmed');assert.equal(body.id,'real-trade');
 assert.ok(messages.some(row=>row.type==='ready'));assert.doesNotMatch(JSON.stringify(messages),/never-public-secret|rpc.example|foreign/);socket.close();
});
