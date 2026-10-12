import test from 'node:test';import assert from 'node:assert/strict';
import {assertSameOrigin,readLimitedJSON} from '../lib/request-boundary.mjs';
import {assertReservedIdentity} from '../lib/launch-identity.mjs';
test('missing and cross-site Origins are rejected',()=>{
 for(const headers of [{},{Origin:'https://evil.test'},{Origin:'https://grainpad.fun','Sec-Fetch-Site':'cross-site'}])assert.throws(()=>assertSameOrigin(new Request('https://grainpad.fun/api/rpc',{headers})));
 assert.doesNotThrow(()=>assertSameOrigin(new Request('https://grainpad.fun/api/rpc',{headers:{Origin:'https://grainpad.fun'}})));
});
test('body budget counts streamed bytes, including missing content length',async()=>{
 await assert.rejects(()=>readLimitedJSON(new Request('https://x.test',{method:'POST',body:JSON.stringify('א'.repeat(40))}),50),/too large/);
 assert.deepEqual(await readLimitedJSON(new Request('https://x.test',{method:'POST',body:'{"ok":true}'}),20),{ok:true});
});
test('non-owner cannot publish reserved names, links or exact artwork',()=>{
 const options={admin:'admin',imageHash:'a',officialImageHash:'b'};
 for(const d of [{name:'Grainpad'},{symbol:'GRAIN'},{website:'https://grainpad.fun/'},{twitter:'https://x.com/GrainXMR'}])assert.throws(()=>assertReservedIdentity({owner:'other',...d},options),/reserved/);
 assert.throws(()=>assertReservedIdentity({owner:'other'},{...options,imageHash:'b'}),/reserved/);
 assert.doesNotThrow(()=>assertReservedIdentity({owner:'other',name:'Independent',symbol:'IND'},options));
});
import {issueRpcSession,verifyRpcSession} from '../lib/rpc-session.mjs';
test('session is bound to IP, expiry and secret and rejects forged tokens',async()=>{
 const secret='test-secret-'.repeat(4),now=1790680000000,token=await issueRpcSession(secret,'client',now);
 await verifyRpcSession(secret,'client',token,now+1);
 await assert.rejects(()=>verifyRpcSession(secret,'other',token,now+1));
 await assert.rejects(()=>verifyRpcSession(secret,'client',token,now+600000));
 await assert.rejects(()=>verifyRpcSession('wrong-secret'.repeat(4),'client',token,now+1));
 await assert.rejects(()=>issueRpcSession('', 'client',now));
});
