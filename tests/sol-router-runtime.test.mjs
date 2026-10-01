import test from 'node:test';import assert from 'node:assert/strict';
import {fetchSolRouterJSON} from '../lib/sol-trade-prepare.mjs';
test('Cloudflare-compatible manual redirects are rejected before parsing a response',async()=>{let parsed=false;for(const status of [301,302,303,307,308])await assert.rejects(fetchSolRouterJSON(async(url,options)=>{assert.equal(options.redirect,'manual');return {status,ok:false,text:async()=>{parsed=true;throw Error('must not parse');}};},'https://api.jup.ag/swap/v1/quote'),/redirected/);assert.equal(parsed,false);});
test('successful runtime uses explicit manual mode and preserves receiver binding through wrapper',async()=>{const fake={marker:true,async fetch(url,options){assert.equal(this.marker,true);assert.equal(options.redirect,'manual');return {status:200,ok:true,text:async()=>'{"ok":true}'};}};assert.deepEqual(await fetchSolRouterJSON((...args)=>fake.fetch(...args),'https://api.jup.ag/swap/v1/quote'),{ok:true});});
import {solRouterFetcher} from '../lib/sol-trade-prepare.mjs';
const reply=(status,text='{}',headers={})=>({status,ok:status>=200&&status<300,headers:new Headers(headers),text:async()=>text,body:{cancel:async()=>{}}});
test('transient router rate limits and outages retry within a bounded policy',async()=>{
 const waits=[];let calls=0;
 assert.deepEqual(await fetchSolRouterJSON(async()=>++calls===1?reply(429,'',{'retry-after':'1'}):calls===2?reply(503):reply(200,'{"ok":1}'),'https://api.jup.ag/swap/v1/quote',undefined,{sleep:async ms=>{waits.push(ms);}}),{ok:1});
 assert.equal(calls,3);assert.deepEqual(waits,[1000,750]);
 calls=0;await assert.rejects(fetchSolRouterJSON(async()=>{calls++;return reply(429,'',{'retry-after':'60'});},'https://api.jup.ag/swap/v1/quote',undefined,{sleep:async ms=>{assert.ok(ms<=2000);}}),/rate limited/);assert.equal(calls,3);
 calls=0;await assert.rejects(fetchSolRouterJSON(async()=>{calls++;throw new TypeError('network');},'https://api.jup.ag/swap/v1/quote',undefined,{sleep:async()=>{}}),/did not respond/);assert.equal(calls,3);
});
test('route rejections are not retried and expose only a bounded upstream code',async()=>{
 let calls=0;await assert.rejects(fetchSolRouterJSON(async()=>{calls++;return reply(400,'{"errorCode":"COULD_NOT_FIND_ANY_ROUTE","error":"<script>"}');},'https://api.jup.ag/swap/v1/quote',undefined,{sleep:async()=>{throw Error('must not wait');}}),/^Error: The SOL router has no route through this token's verified Grainpad pool right now \(COULD_NOT_FIND_ANY_ROUTE\)\. [^<]*wXMR meanwhile\.$/);assert.equal(calls,1);
 await assert.rejects(fetchSolRouterJSON(async()=>reply(400,'{"errorCode":"SLIPPAGE_TOO_HIGH"}'),'https://api.jup.ag/swap/v1/quote'),/^Error: Official SOL router rejected this route \(SLIPPAGE_TOO_HIGH\)\.$/);
 await assert.rejects(fetchSolRouterJSON(async()=>reply(401,'{"errorCode":"lower case <b>"}'),'https://api.jup.ag/swap/v1/quote'),/rejected this route request\.$/);
});
test('the retry window and attempt count stay bounded',async()=>{
 let clock=0,calls=0;await assert.rejects(fetchSolRouterJSON(async()=>{calls++;clock+=12000;return reply(502);},'https://api.jup.ag/swap/v1/quote',undefined,{now:()=>clock,sleep:async ms=>{clock+=ms;}}),/unavailable/);assert.equal(calls,2);
 for(const attempts of [0,4,1.5])await assert.rejects(fetchSolRouterJSON(async()=>reply(200),'x',undefined,{attempts}),/retry policy/);
});
test('optional router credential is sent only as a header and validated',async()=>{
 const seen=[];const base=async(url,init)=>{seen.push([url,init]);return reply(200);};
 assert.equal(solRouterFetcher(undefined,base),base);assert.equal(solRouterFetcher('',base),base);
 await solRouterFetcher('k'.repeat(32),base)('https://api.jup.ag/swap/v1/quote?a=1',{method:'GET',redirect:'manual'});
 assert.equal(seen[0][0],'https://api.jup.ag/swap/v1/quote?a=1');assert.equal(seen[0][1].headers['x-api-key'],'k'.repeat(32));assert.equal(seen[0][1].redirect,'manual');
 await solRouterFetcher('k'.repeat(32),base)('u',{headers:{'Content-Type':'application/json'}});assert.equal(seen[1][1].headers['Content-Type'],'application/json');
 for(const bad of ['short','has space'.repeat(4),7])assert.throws(()=>solRouterFetcher(bad,base),/credential/);
});
