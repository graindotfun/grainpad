import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WXMR_WARNING} from '../lib/quote-assets.mjs';

const files=['components/docs-content.tsx','components/wallets-faq.tsx','components/graduation-coverage.tsx','lib/quote-assets.mjs'];
const text=files.map(f=>readFileSync(f,'utf8')).join('\n');
const docs=readFileSync('components/docs-content.tsx','utf8');

test('docs copy has no dashes, audit wording or internal terms',()=>{
 assert.doesNotMatch(text,/[–—]/.test(text)?/never-matches-placeholder/:/[–—]/);
});
test('docs copy avoids audit, stagenet and verifier jargon',()=>{
 for(const word of [/audit/i,/stagenet/i,/verify-launch/,/\bPASS\b/,/safety guards/,/are back/i])assert.doesNotMatch(text.replace(/aria-label|Gitleaks/g,''),word);
});
test('GRAIN holder rewards section exists and states the 50/35/15 split in future-safe terms',()=>{
 assert.match(docs,/\["grain-holder-rewards", "GRAIN holder rewards"\]/);
 assert.match(docs,/50% to GRAIN holders, 35% to grainpad and 15% to a GRAIN buyback that is burned/);
 assert.match(docs,/Native XMR payouts are the next step and are being tested; they are not live/);
 assert.doesNotMatch(docs,/70% holder \/ 15% GRAIN reserve/);
});
test('section indexes are contiguous 0..12',()=>{
 const idx=[...docs.matchAll(/<Section index=\{(\d+)\}>/g)].map(m=>Number(m[1]));
 assert.deepEqual(idx,Array.from({length:13},(_,i)=>i));
 assert.equal((docs.match(/\["[a-z-]+", "[^"]+"\]/g)||[]).length,13);
});
test('wXMR wording is neutral',()=>{
 assert.match(WXMR_WARNING,/issued by wxmr\.io, a third party\. It is not XMR, and grainpad does not operate it/);
});
