import test from 'node:test';
import assert from 'node:assert/strict';
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
test('public document policies reject missing, weak and injected nonces',()=>{
 for(const invalid of [undefined,'short',`${nonce}' 'unsafe-inline`,nonce+'\n'])assert.throws(()=>documentSecurityHeaders('grainpad.fun',invalid),/nonce/);
 const changed=documentSecurityHeaders('grainpad.fun','abcdef0123456789abcdef0123456789');
 assert.notEqual(changed['Content-Security-Policy'],documentSecurityHeaders('grainpad.fun',nonce)['Content-Security-Policy']);
});
