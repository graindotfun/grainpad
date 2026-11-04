import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PLATFORM_SETTINGS} from '../lib/platform-settings.mjs';
import {REWARDS_DEPLOYMENT} from '../lib/rewards-deployment.mjs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const page=read('app/official/page.tsx');

test('official page reads its addresses from the pinned source, not copied strings',()=>{
 assert.match(page,/REWARDS_DEPLOYMENT\.officialGrainMint/);
 assert.match(page,/PLATFORM_SETTINGS\.admin/);
 assert.match(page,/PLATFORM_SETTINGS\.feeWallet/);
 assert.match(page,/grainpadPlatformId\(\)/);
 for(const address of [REWARDS_DEPLOYMENT.officialGrainMint,PLATFORM_SETTINGS.admin,PLATFORM_SETTINGS.feeWallet])assert.ok(!page.includes(address),`${address} must come from source pins`);
 assert.equal(PLATFORM_SETTINGS.feeWallet,REWARDS_DEPLOYMENT.collector);
});

test('official page warns about copies without em dashes or promises',()=>{
 assert.match(page,/not ours/);
 assert.match(page,/never message you first or ask for your seed phrase/);
 assert.ok(!page.includes('—'));
 assert.doesNotMatch(page,/guarantee|profit|returns/i);
});

test('the page is linked from the footer, docs and sitemap',()=>{
 assert.match(read('components/site-footer.tsx'),/href="\/official"/);
 assert.match(read('app/sitemap.xml/route.ts'),/'\/official'/);
 const docs=read('components/docs-content.tsx');
 assert.match(docs,/href="\/official"/);
 assert.doesNotMatch(docs,/no official CA is published/);
});

test('docs fall back to the configured collector as fee wallet, never the admin',()=>{
 assert.match(read('app/docs/page.tsx'),/feeWallet=\{PLATFORM_SETTINGS\.feeWallet\}/);
 assert.doesNotMatch(read('components/docs-content.tsx'),/platform\?\.feeWallet : SITE\.projectWallet/);
});
