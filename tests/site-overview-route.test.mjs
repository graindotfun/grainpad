import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
import {grainpadPlatformId} from '../lib/platform-policy.mjs';
import {DatabaseSync} from 'node:sqlite';
import {PREVIOUS_OFFICIAL_MINTS} from '../lib/previous-official-mints.mjs';
const platformId=grainpadPlatformId().toBase58();
const ledger=new DatabaseSync(':memory:');
ledger.exec('CREATE TABLE launch_index(network TEXT,platform_id TEXT,mint TEXT)');
for(const mint of ['current-launch',PREVIOUS_OFFICIAL_MINTS[0].mint])ledger.prepare('INSERT INTO launch_index VALUES(?,?,?)').run('mainnet-beta',platformId,mint);
const official={mint:'test-mint',pool:'test-pool',approval:JSON.stringify({verification:{status:'PASS',readOnly:true,platform:platformId,mint:'test-mint',pool:'test-pool',checks:[{status:'PASS'}]}})};
const platform={active:true,policyMatches:true,kind:'grainpad',platformId,restrictionFlags:{globalConfig:1,curveParam:1},rules:[{symbol:'SOL'},{symbol:'wXMR'}]};
const statement=(sql,args=[])=>({
 bind:(...next)=>statement(sql,next),
 first:async()=>{
  if(sql.includes('FROM launch_index'))return ledger.prepare(sql).get(...args);
  if(sql.includes('FROM market_cache'))return args[0]===`platform:rules:v8:${platformId}`?{value:JSON.stringify(platform),updated_at:Date.now()-1000,expires_at:Date.now()+29_000}:null;
  if(sql.includes('FROM official_token'))return official;
  return null;
 },
 all:async()=>({results:sql.includes('FROM treasury_receipts')?globalThis.overviewTest.legacy??[]:sql.includes('FROM holder_reward_receipt')?globalThis.overviewTest.rewards??[]:sql.includes('FROM launch_index l')?globalThis.overviewTest.snapshotRows??[]:[]}),
});
globalThis.overviewTest={db:{prepare:sql=>statement(sql)}};
async function route(creationEnabled){
 const outfile=`.test-output/site-overview-${creationEnabled?'open':'locked'}.mjs`;
 const stubs={
  '@/lib/server-owner':'export const database=()=>globalThis.overviewTest.db;',
  '@/lib/server-utils':'export const bucket=()=>({});',
  '@/lib/server-cache':'export const sharedMarketCache=async(db,key,read)=>({data:await read(),updatedAt:Date.now(),stale:false});',
  '@/lib/launch-records':'export const readLaunchRecords=async()=>[];',
 };
 await build({entryPoints:['app/api/site-overview/route.ts'],outfile,bundle:true,packages:'external',platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'overview-boundaries',setup(b){
  b.onResolve({filter:/^\.\/server-owner$/},()=>({path:'@/lib/server-owner',namespace:'stub'}));
  b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'stub'}));
  b.onLoad({filter:/^server-only$/,namespace:'stub'},()=>({contents:'',loader:'js'}));
  b.onResolve({filter:/^@\/lib\//},a=>a.path in stubs?{path:a.path,namespace:'stub'}:null);
  b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js'}));
  b.onLoad({filter:/platform-settings\.mjs$/},a=>({contents:fs.readFileSync(a.path,'utf8').replace(/TOKEN_CREATION_ENABLED=(true|false)/,`TOKEN_CREATION_ENABLED=${creationEnabled}`),loader:'js'}));
 }}]});
 return (await import('../'+outfile)).GET;
}
test('hero launch claims read the live platform cache and stay off while creation is locked',async()=>{
 const locked=await (await (await route(false))()).json();
 assert.deepEqual(locked.features,{pairedLaunches:false,onChainRules:false});
 assert.equal(locked.launches,1,'The homepage count excludes the retired official mint, matching discovery.');
 const open=await (await (await route(true))()).json();
 assert.deepEqual(open.features,{pairedLaunches:true,onChainRules:true},'A fully verified platform row under the key /api/platform writes must be found.');
});

test('homepage totals one legacy buyback and one verified rewards burn of official GRAIN',async()=>{
 const record={signature:'reward-burn',kind:'burn',mint:'another-tax-source',slot:7,burnedRaw:'351550757633',receipt:{mint:official.mint,slot:7,burnedRaw:'351550757633'}};
 globalThis.overviewTest.legacy=[{signature:'legacy-buyback',kind:'buyback',burned:'1000001'}];
 globalThis.overviewTest.rewards=[{signature:record.signature,mint:record.mint,kind:'burn',slot:7,verified_at:1,record:JSON.stringify(record)}];
 try {assert.equal((await (await (await route(false))()).json()).burned,'351551757634');}
 finally {delete globalThis.overviewTest.legacy;delete globalThis.overviewTest.rewards;}
});

test('overview shows observed 24h volume, excludes mismatched/stale observations and never invents zero',async()=>{
 const now=Date.now();
 const snapshot=(mint,volume,age=0,pool='pool')=>({record:JSON.stringify({mint,pool:'pool',name:mint,symbol:'TEST',createdAt:new Date(now).toISOString(),quoteAsset:'wXMR'}),market:JSON.stringify({mint,launchPool:pool,pool:'curve',quote:{symbol:'wXMR'},route:'curve',native:{marketCapUsd:100,volume24hUsd:volume,volumeCoverage:'partial'}}),market_time:now-age});
 globalThis.overviewTest.snapshotRows=[snapshot('observed',123.45),snapshot('unknown',null),snapshot('stale',999,300001),snapshot('wrong-pool',999,0,'foreign')];
 try {
  const data=await (await (await route(false))()).json();
  assert.equal(data.volume,123.45);assert.equal(data.volumeTokens,1);assert.equal(data.volumeCoverage,'partial');
  globalThis.overviewTest.snapshotRows=[snapshot('unknown',null)];
  assert.equal((await (await (await route(false))()).json()).volume,null);
 } finally {delete globalThis.overviewTest.snapshotRows;}
});
