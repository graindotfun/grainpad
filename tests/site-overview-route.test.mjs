import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
import {grainpadPlatformId} from '../lib/platform-policy.mjs';
import {PREVIOUS_OFFICIAL_MINTS} from '../lib/previous-official-mints.mjs';
const platformId=grainpadPlatformId().toBase58();
const official={mint:'test-mint',pool:'test-pool',approval:JSON.stringify({verification:{status:'PASS',readOnly:true,platform:platformId,mint:'test-mint',pool:'test-pool',checks:[{status:'PASS'}]}})};
const platform={active:true,policyMatches:true,kind:'grainpad',platformId,restrictionFlags:{globalConfig:1,curveParam:1},rules:[{symbol:'SOL'},{symbol:'wXMR'}]};
const statement=(sql,args=[])=>({
 bind:(...next)=>statement(sql,next),
 first:async()=>{
  if(sql.includes('FROM market_cache'))return args[0]===`platform:rules:v8:${platformId}`?{value:JSON.stringify(platform),updated_at:Date.now()-1000,expires_at:Date.now()+29_000}:null;
  if(sql.includes('FROM official_token'))return official;
  return null;
 },
 all:async()=>({results:sql.includes('FROM treasury_receipts')?globalThis.overviewTest.legacy??[]:[]}),
});
globalThis.overviewTest={db:{prepare:sql=>statement(sql)}};
async function route(creationEnabled){
 const outfile=`.test-output/site-overview-${creationEnabled?'open':'locked'}.mjs`;
 // Isolate overview claims/math; signed catalog authority and cache behavior have
 // separate actual-D1 regression suites, with no injected approval path in runtime.
 const stubs={
  '@/lib/verified-monero-catalog.mjs':'export const verifiedCatalogWitnesses=async()=>{globalThis.overviewTest.calls.push("witnesses");return [{key:"mainnet-beta:current-launch"}];};',
  '@/lib/site-stats.mjs':'export const recordLaunchConfirmations=async(db,w)=>{globalThis.overviewTest.calls.push("record:"+w.length);if(globalThis.overviewTest.recordFails)throw Error("busy");return 1;};export const BURN_TTL_MS=300000,BURN_MAX_STALE_MS=1800000;export const countConfirmedLaunches=async(db,platform,retired)=>{globalThis.overviewTest.calls.push("count");globalThis.overviewTest.retired=retired;if(globalThis.overviewTest.countFails)throw Error("no table");return {launches:globalThis.overviewTest.launches??1,launchesAwaiting:0};};export const readIndexedVolume=async(db,platform,options)=>{globalThis.overviewTest.prices=options.prices;return globalThis.overviewTest.volume??{volume:null,volumeTokens:0,volumeCoverage:"partial",volumeSource:"indexed-trades"};};',
  '@/lib/quote-usd.mjs':'export const loadQuoteUsd=async()=>{if(globalThis.overviewTest.pricesFail)throw Error("busy");return {wXMR:{price:600,freshness:"fresh"}};};',
  '@/lib/server-homepage':'export const readSupplyBurn=async()=>{if(!globalThis.overviewTest.burn)throw Error("unavailable");return globalThis.overviewTest.burn;};',
  '@/lib/server-owner':'export const database=()=>globalThis.overviewTest.db;',
  '@/lib/server-utils':'export const bucket=()=>({});',
  '@/lib/server-cache':'export const sharedMarketCache=async(db,key,read)=>globalThis.overviewTest.cached??({data:await read(),updatedAt:Date.now(),stale:false});',
  '@/lib/launch-records':'export const readLaunchRecords=async()=>[];',
 };
 await build({entryPoints:['app/api/site-overview/route.ts'],outfile,bundle:true,packages:'external',platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'overview-boundaries',setup(b){
  b.onResolve({filter:/^\.\/verified-monero-catalog\.mjs$/},()=>({path:'@/lib/verified-monero-catalog.mjs',namespace:'stub'}));
  b.onResolve({filter:/^\.\/server-owner$/},()=>({path:'@/lib/server-owner',namespace:'stub'}));
  b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'stub'}));
  b.onLoad({filter:/^server-only$/,namespace:'stub'},()=>({contents:'',loader:'js'}));
  b.onResolve({filter:/^@\/lib\//},a=>a.path in stubs?{path:a.path,namespace:'stub'}:null);
  b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js'}));
  b.onLoad({filter:/platform-settings\.mjs$/},a=>({contents:fs.readFileSync(a.path,'utf8').replace(/TOKEN_CREATION_ENABLED=(true|false)/,`TOKEN_CREATION_ENABLED=${creationEnabled}`),loader:'js'}));
 }}]});
 return (await import('../'+outfile)).GET;
}
const read=async(creationEnabled=false)=>{globalThis.overviewTest.calls=[];return (await (await route(creationEnabled))()).json();};
test('hero launch claims read the live platform cache and stay off while creation is locked',async()=>{
 const locked=await read(false);
 assert.deepEqual(locked.features,{pairedLaunches:false,onChainRules:false});
 assert.equal(locked.launches,1);
 assert.deepEqual(globalThis.overviewTest.retired,PREVIOUS_OFFICIAL_MINTS.map(row=>row.mint),'The homepage count excludes retired official mints, matching discovery.');
 const open=await read(true);
 assert.deepEqual(open.features,{pairedLaunches:true,onChainRules:true},'A fully verified platform row under the key /api/platform writes must be found.');
});

test('fresh witnesses are recorded before the confirmed count, and a recording failure keeps the count',async()=>{
 await read();assert.deepEqual(globalThis.overviewTest.calls,['witnesses','record:1','count']);
 globalThis.overviewTest.recordFails=true;
 try {assert.equal((await read()).launches,1);}
 finally {delete globalThis.overviewTest.recordFails;}
});

test('GRAIN burned is the on-chain supply difference, never the receipt ledger',async()=>{
 globalThis.overviewTest.legacy=[{signature:'legacy-buyback',kind:'buyback',burned:'1000001'}];
 globalThis.overviewTest.burn={burned:'130000000000000',initialSupply:'1000000000000000',currentSupply:'870000000000000',decimals:6,slot:460459531,checkedAt:Date.now(),stale:false};
 try {
  const data=await read();
  assert.equal(data.burned,'130000000000000');
  assert.deepEqual({...data.burn,checkedAt:undefined},{source:'mint-supply',initialSupply:'1000000000000000',currentSupply:'870000000000000',decimals:6,slot:460459531,checkedAt:undefined,stale:false});
  delete globalThis.overviewTest.burn;
  const unavailable=await read();
  assert.equal(unavailable.burned,null,'An unavailable chain read is unknown, not zero.');assert.equal(unavailable.burn,null);assert.equal(unavailable.launches,1);
 } finally {delete globalThis.overviewTest.legacy;delete globalThis.overviewTest.burn;}
});

test('overview volume is the indexed-trade total and prices failures stay unknown',async()=>{
 globalThis.overviewTest.volume={volume:6058.7,volumeTokens:3,volumeCoverage:'indexed',volumeIndexedThrough:new Date().toISOString(),volumeSource:'indexed-trades'};
 try {
  const data=await read();
  assert.deepEqual([data.volume,data.volumeTokens,data.volumeCoverage,data.volumeSource],[6058.7,3,'indexed','indexed-trades']);
  assert.equal(globalThis.overviewTest.prices.wXMR.price,600);
  globalThis.overviewTest.pricesFail=true;await read();
  assert.equal(globalThis.overviewTest.prices,null);
 } finally {delete globalThis.overviewTest.volume;delete globalThis.overviewTest.pricesFail;}
});

test('an old or stale burn read is marked with its own time, and withheld past its limit',async()=>{
 const burn=(age,stale=false)=>({burned:'130000000000000',initialSupply:'1000000000000000',currentSupply:'870000000000000',decimals:6,slot:1,checkedAt:Date.now()-age,stale});
 try {
  globalThis.overviewTest.burn=burn(0,true);
  let data=await read();assert.equal(data.burned,'130000000000000');assert.equal(data.burn.stale,true);assert.equal(data.stale,false,'Only the burn is stale.');
  globalThis.overviewTest.burn=burn(300000+60000+1);
  data=await read();assert.equal(data.burn.stale,true,'A fresh-flagged read older than both cache windows is still marked.');
  assert.equal(Date.parse(data.burn.checkedAt)<=Date.now()-360001,true,'The read time is the chain read, not the overview refresh.');
  globalThis.overviewTest.burn=burn(1800000+1,true);
  data=await read();assert.equal(data.burned,null);assert.equal(data.burn,null);
 } finally {delete globalThis.overviewTest.burn;}
});

test('one failing figure never blanks the others',async()=>{
 globalThis.overviewTest.countFails=true;
 globalThis.overviewTest.burn={burned:'130000000000000',initialSupply:'1000000000000000',currentSupply:'870000000000000',decimals:6,slot:1,checkedAt:Date.now(),stale:false};
 try {const data=await read();assert.equal(data.launches,null);assert.equal(data.burned,'130000000000000');assert.equal(data.volumeSource,'indexed-trades');}
 finally {delete globalThis.overviewTest.countFails;delete globalThis.overviewTest.burn;}
});

test('a cached overview never serves completeness or a burn past their own evidence age',async()=>{
 const now=Date.now(),iso=ms=>new Date(ms).toISOString();
 globalThis.overviewTest.cached={updatedAt:now-200_000,stale:true,data:{launches:9,launchesAwaiting:0,volume:6000,volumeTokens:3,volumeCoverage:'indexed',volumeIndexedThrough:iso(now-900_001),volumeSource:'indexed-trades',
  burned:'130000000000000',burn:{source:'mint-supply',initialSupply:'1000000000000000',currentSupply:'870000000000000',decimals:6,slot:1,checkedAt:iso(now-400_000),stale:false}}};
 try {
  const data=await read();
  assert.equal(data.volumeCoverage,'partial','Coverage proved 15 minutes and 1 ms ago is no longer complete.');
  assert.equal(data.burn.stale,true);assert.equal(data.burned,'130000000000000');
  assert.ok(Math.abs(Date.parse(data.servedAt)-Date.now())<5000,'The response names its server time for browser-side aging.');
 } finally {delete globalThis.overviewTest.cached;}
});
