import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PublicKey} from '@solana/web3.js';
import {CREATOR_FEE_SOURCES,CREATOR_LP_NOTICE,splitFeeHistory} from '../lib/creator-earnings.mjs';
import {POLICY,assertGrainpadPolicy} from '../lib/platform-policy.mjs';
import {PLATFORM_SETTINGS} from '../lib/platform-settings.mjs';
const zero=PublicKey.default.toBase58();
const policy={feeWallet:PLATFORM_SETTINGS.feeWallet,lockNftWallet:PLATFORM_SETTINGS.feeKeyWallet,platformScale:1000000,creatorScale:0,burnScale:0,platformRate:POLICY.platformRate,cpConfig:POLICY.cpConfig,creatorRate:POLICY.creatorRate,transferAuthority:PLATFORM_SETTINGS.transferAuthority,vestingWallet:PLATFORM_SETTINGS.vestingWallet,vestingScale:0,cpCreator:zero,restrictGlobal:1,restrictCurve:1,ruleManager:zero};
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
test('the verified platform policy gives creators no share of graduation LP',()=>{
 assert.doesNotThrow(()=>assertGrainpadPolicy(policy));
 assert.throws(()=>assertGrainpadPolicy({...policy,creatorScale:500000,platformScale:500000}),/differ from the published policy/);
 assert.throws(()=>assertGrainpadPolicy({...policy,lockNftWallet:zero}),/differ from the published policy/);
 assert.deepEqual(CREATOR_FEE_SOURCES,['curve','cpmm']);
 assert.match(CREATOR_LP_NOTICE,/0% of it and no Fee Key/);
});
test('Fee Key claims are reported apart from creator earnings',()=>{
 const rows=[{source:'curve',asset:'a'},{source:'cpmm',asset:'a'},{source:'lp',asset:'a'}];
 const {creator,feeKey}=splitFeeHistory(rows);
 assert.deepEqual(creator.map(r=>r.source),['curve','cpmm']);assert.deepEqual(feeKey.map(r=>r.source),['lp']);
 const route=read('app/api/creator/[owner]/route.ts');
 assert.match(route,/splitFeeHistory/);assert.doesNotMatch(route,/lp:\{earned/);
});
test('creator-facing copy never lists locked LP as a creator source',()=>{
 const desk=read('components/creator-desk.tsx');
 assert.doesNotMatch(desk,/lp:'Locked LP'/);assert.doesNotMatch(desk,/\['curve','cpmm','lp'\]/);assert.match(desk,/CREATOR_LP_NOTICE/);
 for(const path of ['app/fees/layout.tsx','app/fees/page.tsx'])assert.doesNotMatch(read(path),/locked-LP fees (from your own wallet|can be claimed)/);
 assert.match(read('components/graduated-fees.tsx'),/Platform Fee Key/);
});
