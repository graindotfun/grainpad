import test from 'node:test';
import assert from 'node:assert/strict';
import {documentSecurityHeaders} from '../lib/security-headers.mjs';
test('public pages send framing, transport and script limits; local dev does not',()=>{
 for(const host of ['localhost','127.0.0.1','[::1]'])assert.deepEqual(documentSecurityHeaders(host),{});
 const headers=documentSecurityHeaders('grainpad.fun');
 const policy=headers['Content-Security-Policy'];
 assert.match(policy,/frame-ancestors 'none'/);
 assert.equal(policy.split(';').map(part=>part.trim()).find(part=>part.startsWith('script-src')),"script-src 'self'");
 assert.doesNotMatch(policy,/unsafe-eval/);
 assert.equal(headers['X-Frame-Options'],'DENY');
 assert.match(headers['Strict-Transport-Security'],/max-age=31536000/);
 assert.equal(documentSecurityHeaders('www.grainpad.fun')['X-Frame-Options'],'DENY');
});
