import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {documentSecurityHeaders} from '../lib/security-headers.mjs';
const nonce='0123456789abcdef0123456789abcdef';
test('public pages send framing, transport and script limits; local dev does not',()=>{
 for(const host of ['localhost','127.0.0.1','[::1]'])assert.deepEqual(documentSecurityHeaders(host),{});
 const headers=documentSecurityHeaders('grainpad.fun',nonce);
 const policy=headers['Content-Security-Policy'];
 assert.match(policy,/frame-ancestors 'none'/);
 assert.equal(policy.split(';').map(part=>part.trim()).find(part=>part.startsWith('script-src')),`script-src 'self' 'nonce-${nonce}'`);
 assert.doesNotMatch(policy,/unsafe-eval/);
 assert.equal(headers['X-Frame-Options'],'DENY');
 assert.equal(headers['X-Content-Type-Options'],'nosniff');assert.equal(headers['Referrer-Policy'],'strict-origin-when-cross-origin');assert.match(headers['Permissions-Policy'],/camera=\(\)/);
 assert.match(headers['Strict-Transport-Security'],/max-age=31536000/);
 assert.equal(documentSecurityHeaders('www.grainpad.fun',nonce)['X-Frame-Options'],'DENY');
});
test('only the grainpet page may frame, and only this origin',()=>{
 const frame=path=>documentSecurityHeaders('grainpad.fun',nonce,path)['Content-Security-Policy'].split(';').map(p=>p.trim()).find(p=>p.startsWith('frame-src'));
 assert.equal(frame('/pet'),"frame-src 'self'");assert.equal(frame('/pet/'),"frame-src 'self'");
 for(const path of ['','/','/petrol','/pet/x','/launches','/api/grainpet'])assert.equal(frame(path),"frame-src 'none'");
 assert.equal(documentSecurityHeaders('grainpad.fun',nonce,'/pet')['X-Frame-Options'],'DENY');assert.match(documentSecurityHeaders('grainpad.fun',nonce,'/pet')['Content-Security-Policy'],/frame-ancestors 'none'/);
});
test('public document policies reject missing, weak and injected nonces',()=>{
 for(const invalid of [undefined,'short',`${nonce}' 'unsafe-inline`,nonce+'\n'])assert.throws(()=>documentSecurityHeaders('grainpad.fun',invalid),/nonce/);
 const changed=documentSecurityHeaders('grainpad.fun','abcdef0123456789abcdef0123456789');
 assert.notEqual(changed['Content-Security-Policy'],documentSecurityHeaders('grainpad.fun',nonce)['Content-Security-Policy']);
});
test('the static room page can only be framed by this origin (static assets bypass the Worker, so public/_headers carries the rule)',()=>{
 const rules=readFileSync(new URL('../public/_headers',import.meta.url),'utf8');
 assert.match(rules,/^\/pet\/room\.html\n(?:  .+\n)*  X-Frame-Options: SAMEORIGIN\n/m);assert.match(rules,/frame-ancestors 'self'/);
});
