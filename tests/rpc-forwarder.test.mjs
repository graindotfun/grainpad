import test from 'node:test';import assert from 'node:assert/strict';
import {createRpcForwarder} from '../lib/rpc-forwarder.mjs';
const genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const body=method=>({jsonrpc:'2.0',id:1,method,params:[]});
function fixture(){
 const calls=[],budgets=[],recorded=new Set();const primary='https://primary.invalid/',fallback='https://fallback.invalid/';
 const db={recorded,prepare:sql=>({bind:(signature)=>({first:async()=>sql.includes('rpc_budget')?{used:1}:recorded.has(signature)?{expires_at:Number.MAX_SAFE_INTEGER}:null,run:async()=>({})})})};
 const options={acquire:async()=>async()=>{},database:()=>db,env:{SOLANA_RPC_URL:primary,SOLANA_READ_RPC_URL:fallback},reserve:async(db,method,options)=>{budgets.push({method,...options});return true;},fetcher:async(url,options)=>{
  const payload=JSON.parse(options.body);calls.push({url,payload});if(url===primary)throw Error('primary offline');
  return Response.json({jsonrpc:'2.0',id:1,result:payload.method==='getGenesisHash'?genesis:42});
 }};return {calls,budgets,options,primary,fallback,recorded};
}
test('read errors use network-checked fallback with unchanged params and lane',async()=>{
 const f=fixture(),forward=createRpcForwarder(f.options),query={...body('getMultipleAccounts'),params:[['account'],{commitment:'finalized',minContextSlot:123}]};
 assert.equal((await forward('mainnet-beta',query,{lane:'display'})).result,42);
 assert.deepEqual(f.calls.map(c=>c.url),[f.primary,f.fallback,f.fallback]);assert.deepEqual(f.calls.at(-1).payload,query);
 assert(f.budgets.every(b=>b.lane==='display'));assert.equal(f.budgets.length,3);
});
test('sends and simulations NEVER reach fallback, including transport failures',async()=>{
 const f=fixture(),forward=createRpcForwarder(f.options);
 for(const method of ['sendTransaction','simulateTransaction'])assert((await forward('mainnet-beta',body(method),{lane:'trade'})).error);
 assert(f.calls.every(c=>c.url===f.primary));assert.equal(f.calls.length,2);assert.equal(f.budgets[0].dailyExempt,true);
});
test('transient provider errors trigger fallback; wrong fallback genesis fails closed',async()=>{
 const f=fixture();f.options.fetcher=async(url,options)=>{const payload=JSON.parse(options.body);f.calls.push({url,payload});return Response.json(url===f.primary?{jsonrpc:'2.0',id:1,error:{code:-32005,message:'busy'}}:{jsonrpc:'2.0',id:1,result:'wrong-network'});};
 assert.match((await createRpcForwarder(f.options)('mainnet-beta',body('getBalance'))).error.message,/network verification failed/);assert.equal(f.calls.length,2);
});
test('regular daily denial cannot be bypassed by fallback; in-flight reads share only within a lane',async()=>{
 const f=fixture();f.options.reserve=async()=>false;assert((await createRpcForwarder(f.options)('mainnet-beta',body('getBalance'))).error);assert.equal(f.calls.length,0);
 const g=fixture();g.options.fetcher=async(url)=>{g.calls.push({url});await new Promise(r=>setTimeout(r,5));return Response.json({jsonrpc:'2.0',id:1,result:1});};
 const forward=createRpcForwarder(g.options);await Promise.all([forward('mainnet-beta',body('getBalance'),{lane:'trade'}),forward('mainnet-beta',body('getBalance'),{lane:'trade'}),forward('mainnet-beta',body('getBalance'),{lane:'display'})]);assert.equal(g.calls.length,2);
});
test('only recorded submissions make trade status checks daily-exempt',async()=>{
 const f=fixture(),recorded='1'.repeat(64),stranger='2'.repeat(64);f.recorded.add(recorded);f.options.fetcher=async()=>Response.json({jsonrpc:'2.0',id:1,result:{value:[null]}});
 const forward=createRpcForwarder(f.options),status=signature=>({...body('getSignatureStatuses'),params:[[signature],{searchTransactionHistory:true}]});
 await forward('mainnet-beta',status(recorded),{lane:'trade'});await forward('mainnet-beta',status(stranger),{lane:'trade'});
 assert.deepEqual(f.budgets.map(b=>b.dailyExempt),[true,false]);
});
test('fallback absence cannot be mistaken for expiry after an ambiguous send',async()=>{
 const f=fixture();f.options.fetcher=async(url,options)=>{const payload=JSON.parse(options.body);if(url===f.primary)throw Error('offline');return Response.json({jsonrpc:'2.0',id:1,result:payload.method==='getGenesisHash'?genesis:{value:[null]}});};
 const result=await createRpcForwarder(f.options)('mainnet-beta',{...body('getSignatureStatuses'),params:[['1'.repeat(64)]]},{lane:'trade'});
 assert.match(result.error.message,/cannot yet verify/);
});
test('internal signed-send policy reads retain the display lane but bypass its daily budget',async()=>{
 const f=fixture();f.options.reserve=async(db,method,options)=>{f.budgets.push({method,...options});return options.dailyExempt;};
 f.options.fetcher=async()=>Response.json({jsonrpc:'2.0',id:1,result:42});
 const forward=createRpcForwarder(f.options);
 assert((await forward('mainnet-beta',body('getLatestBlockhash'),{lane:'display'})).error);
 assert.equal((await forward('mainnet-beta',body('getLatestBlockhash'),{lane:'display',submissionValidation:true})).result,42);
 assert.equal(f.budgets.at(-1).lane,'display');assert.equal(f.budgets.at(-1).dailyExempt,true);
});

test('primary-only recovery cannot turn fallback absence into renewal evidence',async()=>{
 const seen=[];const forward=createRpcForwarder({database:()=>({}),env:{SOLANA_RPC_URL:'https://primary.example',SOLANA_READ_RPC_URL:'https://fallback.example'},reserve:async()=>true,acquire:async()=>async()=>{},fetcher:async url=>{seen.push(url);throw Error('primary unavailable');}});
 const result=await forward('mainnet-beta',{jsonrpc:'2.0',id:1,method:'getSignatureStatuses',params:[['synthetic'],{searchTransactionHistory:true}]},{primaryOnly:true,submissionValidation:true});
 assert(result.error);assert.deepEqual(seen,['https://primary.example']);
});
test('scheduled cancellation does not share a public inflight read and cancels response body',async()=>{
 const f=fixture(),controller=new AbortController();let cancelled=false;
 f.options.fetcher=async(_url,options)=>{f.calls.push(options);if(options.signal?.aborted)throw Error('aborted');if(!options.signal||f.calls.length===1)return new Promise(resolve=>setTimeout(()=>resolve(Response.json({jsonrpc:'2.0',id:1,result:42})),30));
 return new Response(new ReadableStream({start(stream){options.signal.addEventListener('abort',()=>{cancelled=true;stream.error(Error('aborted'));},{once:true});},cancel(){cancelled=true;}}));};
 const forward=createRpcForwarder(f.options);const publicRead=forward('mainnet-beta',body('getBalance'));const scheduled=forward('mainnet-beta',body('getBalance'),{signal:controller.signal});setTimeout(()=>controller.abort(),10);
 assert.equal((await publicRead).result,42);await scheduled;assert.ok(f.calls.length>=2);assert.equal(cancelled,true);
});

test('scheduled RPC diagnostics expose bounded status/code but no provider strings',async()=>{
 const f=fixture();f.options.fetcher=async()=>new Response('secret-body',{status:429});
 const response=await createRpcForwarder(f.options)('mainnet-beta',body('getTransaction'),{primaryOnly:true,diagnostics:true});
 assert.equal(response.diagnostic.category,'transport');assert.equal(response.diagnostic.attempts[0].httpStatus,429);assert(!JSON.stringify(response.diagnostic).includes('secret-body'));
 const g=fixture();g.options.fetcher=async()=>Response.json({jsonrpc:'2.0',id:1,error:{code:-32602,message:'https://secret.example/token-secret',data:{secret:'never-copy'}}});
 const provider=await createRpcForwarder(g.options)('mainnet-beta',body('getTransaction'),{primaryOnly:true,diagnostics:true});
 assert.equal(provider.diagnostic.category,'provider');assert.equal(provider.diagnostic.attempts[0].providerCode,-32602);assert(!JSON.stringify(provider.diagnostic).includes('secret'));
});
test('budget and concurrency diagnostics remain fixed and public replies omit diagnostics',async()=>{
 const f=fixture();f.options.reserve=async()=>false;
 const forward=createRpcForwarder(f.options);
 assert.equal((await forward('mainnet-beta',body('getTransaction'),{diagnostics:true})).diagnostic.category,'budget');
 assert.equal((await forward('mainnet-beta',body('getBalance'))).diagnostic,undefined);
 const g=fixture();g.options.acquire=async()=>null;
 assert.equal((await createRpcForwarder(g.options)('mainnet-beta',body('getTransaction'),{primaryOnly:true,diagnostics:true})).diagnostic.category,'concurrency');
});

test('chart archive recovery tries verified fallback on a missing primary receipt, with every read budgeted',async()=>{
 const f=fixture(),receipt={slot:123,transaction:{}};
 f.options.fetcher=async(url,options)=>{const payload=JSON.parse(options.body);f.calls.push({url,payload});return Response.json({jsonrpc:'2.0',id:1,result:payload.method==='getGenesisHash'?genesis:url===f.primary?null:receipt});};
 const forward=createRpcForwarder(f.options),query={...body('getTransaction'),params:['synthetic',{encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:1}]};
 assert.equal((await forward('mainnet-beta',query)).result,null);assert.equal(f.calls.length,1);
 assert.deepEqual((await forward('mainnet-beta',query,{archival:true})).result,receipt);
 assert.deepEqual(f.calls.slice(1).map(c=>c.url),[f.primary,f.fallback,f.fallback]);assert.deepEqual(f.calls.at(-1).payload,query);
 assert.deepEqual(f.budgets.map(b=>b.method),['getTransaction','getTransaction','getGenesisHash','getTransaction']);assert(f.budgets.every(b=>b.lane==='display'&&!b.dailyExempt));
});
test('archive recovery cannot opt financial, nonfinalized or other network reads into null fallback',async()=>{
 for(const [network,query,options] of [
 ['mainnet-beta',body('sendTransaction'),{lane:'trade'}],['mainnet-beta',body('getBalance'),{}],
 ['devnet',body('getTransaction'),{}],['mainnet-beta',{...body('getTransaction'),params:['synthetic',{commitment:'confirmed'}]},{}],
 ['mainnet-beta',{...body('getTransaction'),params:['synthetic',{commitment:'finalized'}]},{primaryOnly:true}],
 ['mainnet-beta',{...body('getTransaction'),params:['synthetic',{commitment:'finalized'}]},{submissionValidation:true}]
 ]){const f=fixture();assert((await createRpcForwarder(f.options)(network,query,{...options,archival:true})).error);assert.equal(f.calls.length,0);}
});
