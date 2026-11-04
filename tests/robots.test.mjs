import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const rules=readFileSync(new URL('../app/robots.txt/route.ts',import.meta.url),'utf8').match(/`([^`]*)`/)[1].split('\\n');
// Longest matching rule wins (RFC 9309), so a path is allowed when its longest Allow is longer than its longest Disallow.
const allowed=path=>{let best={len:-1,allow:true};for(const line of rules){const m=line.match(/^(Allow|Disallow): (\S+)$/);if(m&&path.startsWith(m[2])&&m[2].length>best.len)best={len:m[2].length,allow:m[1]==='Allow'};}return best.allow;};

test('crawlers can fetch the share card image that /rewards/share links unfurl to',()=>{
 assert.ok(allowed('/api/rewards/card?owner=x&art=receipt'));
 assert.ok(allowed('/rewards/share?owner=x'));
 assert.ok(allowed('/api/og/token'));
});
test('the rest of the API and owner pages stay disallowed',()=>{
 for(const path of ['/api/rewards/wallet?owner=x','/api/version','/api/grainpet','/owner/'])assert.equal(allowed(path),false,path);
});
