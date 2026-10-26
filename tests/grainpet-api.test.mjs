import test from 'node:test';
import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {secp256k1} from '@noble/curves/secp256k1';
import {keccak_256} from '@noble/hashes/sha3';
import {createGrainpetApi} from '../lib/grainpet-api.mjs';
import {memoryStore,validateState} from '../lib/grainpet-store.mjs';
import {canonicalIdentity,parseIdentity} from '../lib/grainpet-auth.mjs';
const ORIGIN='https://grainpad.test',SECRET='s'.repeat(40);
const SOL='solana:mainnet-beta',EVM='robinhood:mainnet';
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
function solWallet(){const kp=nacl.sign.keyPair();return {family:'solana',networkId:SOL,owner:bs58.encode(kp.publicKey),sign:m=>btoa(String.fromCharCode(...nacl.sign.detached(new TextEncoder().encode(m),kp.secretKey)))};}
function evmWallet(){
 const priv=secp256k1.utils.randomPrivateKey(),pub=secp256k1.getPublicKey(priv,false),addr='0x'+hex(keccak_256(pub.slice(1)).slice(-20));
 return {family:'evm',networkId:EVM,owner:addr.replace(/[a-f]/g,c=>Math.random()<.5?c.toUpperCase():c),sign:m=>{
  const bytes=new TextEncoder().encode(m),pre=new TextEncoder().encode(`\x19Ethereum Signed Message:\n${bytes.length}`),all=new Uint8Array(pre.length+bytes.length);all.set(pre);all.set(bytes,pre.length);
  const s=secp256k1.sign(keccak_256(all),priv);return '0x'+s.toCompactHex()+(27+s.recovery).toString(16);}};
}
const state=(over={})=>({v:1,id:'abc',type:'mori',name:'mori',prefs:{food:0,rest:0,gest:0},needs:{h:.7,e:.8,m:.6},bond:{meet:0},dust:0,dent:0,coll:[],notes:[],ideas:[],home:{wall:'cream'},finds:{got:[]},memories:{},notesRead:[],born:1,seen:2,sessions:1,flags:{},...over});
function harness({openSignIn=false}={}){
 const store=memoryStore(),used=new Map();let t=1_800_000_000_000;
 const api=createGrainpetApi({secret:SECRET,store,now:()=>t,budget:async(k,l)=>{if(openSignIn&&/^grainpet-(challenge|session):/.test(k))return true;const n=(used.get(k)||0)+1;used.set(k,n);return n<=l;}});
 const req=(path,method,body,cookie,extra={})=>new Request(ORIGIN+path,{method,headers:{'Content-Type':'application/json',Origin:ORIGIN,...(cookie?{Cookie:cookie}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const tick=ms=>{t+=ms;};
 async function signIn(w){
  const c=await(await api.challenge(req('/api/grainpet/challenge','POST',{family:w.family,networkId:w.networkId,owner:w.owner}))).json();
  const res=await api.session(req('/api/grainpet/session','POST',{token:c.token,signature:w.sign(c.message)}));
  return {res,cookie:(res.headers.get('Set-Cookie')||'').split(';')[0],challenge:c};
 }
 return {api,req,signIn,tick,store};
}
test('identity is family:network:owner; EVM is lowercased, Solana is exact, networks stay apart',()=>{
 assert.equal(canonicalIdentity({family:'evm',networkId:EVM,owner:'0xAbCdEf0123456789aBcDeF0123456789AbCdEf01'}),'evm:robinhood:mainnet:0xabcdef0123456789abcdef0123456789abcdef01');
 const w=solWallet();assert.equal(canonicalIdentity(w),`solana:${SOL}:${w.owner}`);
 assert.throws(()=>canonicalIdentity({...w,networkId:EVM}));
 assert.throws(()=>canonicalIdentity({family:'evm',networkId:EVM,owner:'0x12'}));
 assert.throws(()=>canonicalIdentity({family:'solana',networkId:SOL,owner:'nope'}));
 assert.throws(()=>parseIdentity('solana:solana:mainnet-beta:x'));
});
test('Solana and EVM wallets sign in once and get an HttpOnly Secure SameSite=Lax cookie',async()=>{
 const h=harness();
 for(const w of [solWallet(),evmWallet()]){
  const {res,cookie}=await h.signIn(w);assert.equal(res.status,200);
  const set=res.headers.get('Set-Cookie');assert.match(set,/HttpOnly/);assert.match(set,/Secure/);assert.match(set,/SameSite=Lax/);assert.match(set,/^__Host-grainpet=/);
  const who=await(await h.api.session(h.req('/api/grainpet/session','GET',undefined,cookie))).json();assert.equal(who.identity,canonicalIdentity(w));
 }
});
test('a signature from another wallet, a tampered token, an expired challenge and a replay on another origin are refused',async()=>{
 const h=harness(),a=solWallet(),b=solWallet();
 const c=await(await h.api.challenge(h.req('/api/grainpet/challenge','POST',a))).json();
 assert.equal((await h.api.session(h.req('/api/grainpet/session','POST',{token:c.token,signature:b.sign(c.message)}))).status,400);
 assert.equal((await h.api.session(h.req('/api/grainpet/session','POST',{token:c.token.slice(0,-3)+'AAA',signature:a.sign(c.message)}))).status,400);
 assert.equal((await h.api.session(h.req('/api/grainpet/session','POST',{token:c.token,signature:a.sign(c.message+'x')}))).status,400);
 const other=new Request('https://evil.test/api/grainpet/session',{method:'POST',headers:{Origin:'https://evil.test'},body:JSON.stringify({token:c.token,signature:a.sign(c.message)})});
 assert.equal((await h.api.session(other)).status,400);
 h.tick(6*60_000);
 assert.equal((await h.api.session(h.req('/api/grainpet/session','POST',{token:c.token,signature:a.sign(c.message)}))).status,400);
 const e=evmWallet(),ce=await(await h.api.challenge(h.req('/api/grainpet/challenge','POST',e))).json();
 assert.equal((await h.api.session(h.req('/api/grainpet/session','POST',{token:ce.token,signature:solWallet().sign(ce.message)}))).status,400);
 assert.equal((await h.api.session(h.req('/api/grainpet/session','POST',{token:ce.token,signature:evmWallet().sign(ce.message)}))).status,400);
});
test('blocker 1/2/3: no session cannot read or write; a signed-in wallet creates and reloads its grain',async()=>{
 const h=harness(),w=solWallet();
 assert.equal((await h.api.load(h.req('/api/grainpet','GET'))).status,401);
 assert.equal((await h.api.save(h.req('/api/grainpet','PUT',{baseRevision:0,state:state()}))).status,401);
 assert.equal((await h.store.read(canonicalIdentity(w))).state,null);
 const {cookie}=await h.signIn(w);
 const first=await(await h.api.load(h.req('/api/grainpet','GET',undefined,cookie))).json();assert.deepEqual([first.revision,first.state],[0,null]);
 const put=await h.api.save(h.req('/api/grainpet','PUT',{baseRevision:0,state:state({name:'pip'})},cookie));assert.equal(put.status,200);assert.equal((await put.json()).revision,1);
 const again=await(await h.api.load(h.req('/api/grainpet','GET',undefined,cookie))).json();assert.equal(again.state.name,'pip');assert.equal(again.revision,1);
});
test('blocker 6/7: another wallet gets its own grain; the same wallet signing in elsewhere gets the same save',async()=>{
 const h=harness(),a=solWallet(),b=evmWallet();
 const A1=await h.signIn(a);await h.api.save(h.req('/api/grainpet','PUT',{baseRevision:0,state:state({name:'aaa'})},A1.cookie));
 const B=await h.signIn(b);const bl=await(await h.api.load(h.req('/api/grainpet','GET',undefined,B.cookie))).json();assert.equal(bl.state,null);
 await h.api.save(h.req('/api/grainpet','PUT',{baseRevision:0,state:state({name:'bbb'})},B.cookie));
 h.tick(60_000);const A2=await h.signIn(a);assert.notEqual(A2.cookie,A1.cookie);
 assert.equal((await(await h.api.load(h.req('/api/grainpet','GET',undefined,A2.cookie))).json()).state.name,'aaa');
 assert.equal((await(await h.api.load(h.req('/api/grainpet','GET',undefined,B.cookie))).json()).state.name,'bbb');
});
test('blocker 9: a forged address, identity or cookie cannot read or write another save',async()=>{
 const h=harness(),victim=solWallet(),attacker=solWallet();
 const V=await h.signIn(victim);await h.api.save(h.req('/api/grainpet','PUT',{baseRevision:0,state:state({name:'secret'})},V.cookie));
 const A=await h.signIn(attacker);
 for(const body of [{baseRevision:1,state:state(),identity:canonicalIdentity(victim)},{baseRevision:1,state:state(),owner:victim.owner}])assert.equal((await h.api.save(h.req('/api/grainpet','PUT',body,A.cookie))).status,400);
 const viaQuery=await(await h.api.load(h.req('/api/grainpet?owner='+victim.owner,'GET',undefined,A.cookie,{'X-Grainpet-Owner':victim.owner}))).json();assert.equal(viaQuery.state,null);assert.equal(viaQuery.identity,canonicalIdentity(attacker));
 const forged=V.cookie.slice(0,-4)+'AAAA';assert.equal((await h.api.load(h.req('/api/grainpet','GET',undefined,forged))).status,401);
 const swapped=A.cookie.split('.')[0].replace(/^__Host-grainpet=/,'')+'.'+V.cookie.split('.')[1];assert.equal((await h.api.load(h.req('/api/grainpet','GET',undefined,'__Host-grainpet='+swapped))).status,401);
 assert.equal((await(await h.api.load(h.req('/api/grainpet','GET',undefined,V.cookie))).json()).state.name,'secret');
});
test('flag names the game really uses are accepted',()=>{validateState(state({flags:{n_away:true,'na_xmr-first':true,arrived:true,home:true}}));});
test('cross-origin writes, bad schemas, oversized saves and stale revisions are refused; a stale write returns the current save',async()=>{
 const h=harness(),w=solWallet(),{cookie}=await h.signIn(w);
 const bad=new Request(ORIGIN+'/api/grainpet',{method:'PUT',headers:{Origin:'https://evil.test',Cookie:cookie},body:JSON.stringify({baseRevision:0,state:state()})});assert.equal((await h.api.save(bad)).status,400);
 for(const s of [state({extra:1}),state({type:'dragon'}),state({notes:new Array(81).fill('x')}),state({name:'x'.repeat(201)}),state({flags:{'a b':1}}),state({flags:JSON.parse('{"__proto__":true}')}),{...state(),v:2}])assert.equal((await h.api.save(h.req('/api/grainpet','PUT',{baseRevision:0,state:s},cookie))).status,400);
 assert.throws(()=>validateState(state({notes:Array.from({length:80},()=>({t:1,s:'y'.repeat(190),a:'y'.repeat(190),b:'y'.repeat(190),c:'y'.repeat(190)}))})));
 await h.api.save(h.req('/api/grainpet','PUT',{baseRevision:0,state:state({name:'one'})},cookie));
 const stale=await h.api.save(h.req('/api/grainpet','PUT',{baseRevision:0,state:state({name:'two'})},cookie));assert.equal(stale.status,409);
 const body=await stale.json();assert.equal(body.conflict,true);assert.equal(body.state.name,'one');assert.equal(body.revision,1);
 assert.equal((await h.api.save(h.req('/api/grainpet','PUT',{baseRevision:1,state:state({name:'two'})},cookie))).status,200);
});
test('expiry, sign-out and rate limits',async()=>{
 const h=harness(),w=solWallet(),{cookie}=await h.signIn(w);
 const out=await h.api.session(h.req('/api/grainpet/session','DELETE',undefined,cookie));assert.match(out.headers.get('Set-Cookie'),/Max-Age=0/);
 h.tick(31*24*3600_000);assert.equal((await h.api.load(h.req('/api/grainpet','GET',undefined,cookie))).status,401);
 const h2=harness(),{cookie:c2}=await h2.signIn(solWallet());let last;
 for(let i=0;i<31;i++)last=await h2.api.save(h2.req('/api/grainpet','PUT',{baseRevision:i,state:state()},c2));assert.equal(last.status,429);
});
test('new grains per caller are limited per hour (throwaway wallets cannot fill storage)',async()=>{
 const h=harness({openSignIn:true});let last;
 for(let i=0;i<21;i++){const {cookie}=await h.signIn(solWallet());last=await h.api.save(h.req('/api/grainpet','PUT',{baseRevision:0,state:state()},cookie));}
 assert.equal(last.status,429);
});
