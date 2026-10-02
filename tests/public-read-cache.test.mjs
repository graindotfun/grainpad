import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicReadCache,publicReadPolicy} from '../lib/public-read-cache.mjs';
const mint='A'.repeat(32);
const request=(path='/api/discovery',headers={},method='GET')=>new Request('https://grainpad.fun'+path,{headers,method});
function fixture(){
 let time=1000,loads=0;const rows=new Map();
 const cache={match:async key=>rows.get(key.url)?.clone(),put:async(key,value)=>rows.set(key.url,value.clone())};
 const read=createPublicReadCache({cache,version:'release1',now:()=>time});
 const load=async()=>{loads++;await new Promise(r=>setTimeout(r,2));return Response.json({updatedAt:123,stale:true,rows:[1,2]},{headers:{'Cache-Control':'no-store'}});};
 return {read,load,cache,rows,setTime:n=>time=n,loads:()=>loads};
}
test('5000 simultaneous public readers share one origin load; hot reads never reach origin',async()=>{
 const f=fixture();const responses=await Promise.all(Array.from({length:5000},()=>f.read(request(),f.load)));
 assert.equal(f.loads(),1);assert.equal(responses.length,5000);
 const samples=[responses[0],responses[2500],responses[4999]];
 for(const response of samples){assert.deepEqual(await response.json(),{updatedAt:123,stale:true,rows:[1,2]});assert.equal(response.headers.get('Cache-Control'),'no-store');}
 const hot=await f.read(request(),f.load);assert.equal(hot.headers.get('X-Grainpad-Read-Cache'),'HIT');assert.equal(f.loads(),1);
});
test('expiry and deploy version force an origin load without retimestamping stale data',async()=>{
 const f=fixture();await f.read(request(),f.load);f.setTime(11_001);await f.read(request(),f.load);assert.equal(f.loads(),2);
 const next=createPublicReadCache({cache:f.cache,version:'release2'});await next(request(),f.load);assert.equal(f.loads(),3);
});
test('queries, pagination and visible refresh permission are isolated; tracking parameters share a key',async()=>{
 const f=fixture();
 for(const path of ['/api/discovery?q=a','/api/discovery?q=b',`/api/creator/${mint}?cursor=a`,`/api/creator/${mint}?cursor=b`,`/api/market/${mint}/history?interval=1m`,`/api/market/${mint}/history?interval=5m`,`/api/room/${mint}?need=a`,`/api/room/${mint}?need=b`])await f.read(request(path),f.load);
 assert.equal(f.loads(),8);
 await f.read(request('/api/discovery?q=a&utm_source=x'),f.load);assert.equal(f.loads(),8);
 await f.read(request(`/api/market/${mint}`,{'X-Grainpad-Viewer':'visible'}),f.load);
 await f.read(request(`/api/market/${mint}`),f.load);assert.equal(f.loads(),10);
});
test('private, write, signing, funding, receipt, unknown and malformed routes bypass',()=>{
 for(const path of ['/api/rpc','/api/rpc-session','/api/sol-trade',`/api/room/${mint}/funding`,`/api/receipt/${mint}`,'/api/identity/fame?viewer=a','/api/owner/monero','/api/platform','/api/proof/'+mint,'/api/market/not-a-mint','/'])assert.equal(publicReadPolicy(request(path)),null,path);
 assert.equal(publicReadPolicy(request('/api/discovery',{},'POST')),null);
 assert.equal(publicReadPolicy(request('/api/discovery',{Authorization:'Bearer test'})),null);
 assert.equal(publicReadPolicy(request('/api/discovery',{RSC:'1'})),null);
 assert.equal(publicReadPolicy(request('/api/discovery',{Accept:'text/html'})),null);
});
test('plain vinext JSON is cacheable despite generic router Vary',async()=>{
 const f=fixture();const load=async()=>Response.json({ok:true},{headers:{Vary:'RSC, Next-Router-State-Tree, X-Vinext-Rsc-Render-Mode'}});
 await f.read(request(),load);assert.equal(f.rows.size,1);
 assert.equal((await f.read(request(),load)).headers.get('X-Grainpad-Read-Cache'),'HIT');
});
test('errors, cookies and varying responses are not cached; failed loads release flight slots',async()=>{
 for(const response of [Response.json({error:'busy'},{status:503}),Response.json({wallet:'private'},{headers:{'Set-Cookie':'private=1'}}),Response.json({user:'private'},{headers:{Vary:'Cookie'}})]){
  const f=fixture();await f.read(request(),async()=>response.clone());assert.equal(f.rows.size,0);
 }
 const f=fixture();await assert.rejects(f.read(request(),async()=>{throw Error('origin failed');}),/origin failed/);
 await f.read(request(),f.load);assert.equal(f.loads(),1);
});
test('cache failure and absent runtime cache preserve origin availability',async()=>{
 const bad=createPublicReadCache({version:'v',cache:{match:async()=>{throw Error();},put:async()=>{throw Error();}}});
 assert.equal((await bad(request(),async()=>Response.json({ok:true}))).status,200);
 assert.equal((await createPublicReadCache({version:'v'})(request(),async()=>Response.json({ok:true}))).status,200);
});
test('bounded distinct cold requests shed load instead of flooding the database',async()=>{
 let release;const gate=new Promise(r=>release=r),cache={match:async()=>undefined,put:async()=>{}};
 const read=createPublicReadCache({cache,version:'v',maxFlights:1});
 const first=read(request('/api/discovery?q=a'),async()=>{await gate;return Response.json({ok:true});});
 await new Promise(r=>setTimeout(r,0));
 const second=await read(request('/api/discovery?q=b'),async()=>{throw Error('must not load');});
 assert.equal(second.status,503);assert.equal(second.headers.get('Retry-After'),'2');release();await first;
});
test('named cache opens lazily for public reads and failure preserves origin availability',async()=>{
 const f=fixture();let opens=0;
 const read=createPublicReadCache({cache:async()=>{opens++;return f.cache;},version:'v',now:()=>1000});
 await read(request('/api/rpc'),f.load);assert.equal(opens,0);
 await read(request(),f.load);const hit=await read(request(),f.load);
 assert.equal(hit.headers.get('X-Grainpad-Read-Cache'),'HIT');assert.equal(f.loads(),2);
 const unavailable=createPublicReadCache({cache:async()=>{throw Error('cache unavailable');},version:'v'});
 assert.equal((await unavailable(request(),f.load)).status,200);
});
