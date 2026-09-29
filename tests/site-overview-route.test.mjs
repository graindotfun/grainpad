import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
import {grainpadPlatformId} from '../lib/platform-policy.mjs';
const platformId=grainpadPlatformId().toBase58();
const official={mint:'test-mint',pool:'test-pool',approval:JSON.stringify({verification:{status:'PASS',readOnly:true,platform:platformId,mint:'test-mint',pool:'test-pool',checks:[{status:'PASS'}]}})};
const platform={active:true,policyMatches:true,kind:'grainpad',platformId,restrictionFlags:{globalConfig:1,curveParam:1},rules:[{symbol:'SOL'},{symbol:'wXMR'}]};
const statement=(sql,args=[])=>({
 bind:(...next)=>statement(sql,next),
 first:async()=>{
  if(sql.includes('FROM market_cache'))return args[0]===`platform:rules:v6:${platformId}`?{value:JSON.stringify(platform),updated_at:Date.now()-1000,expires_at:Date.now()+29_000}:null;
  if(sql.includes('FROM official_token'))return official;
  return null;
 },
 all:async()=>({results:[]}),
});
globalThis.overviewTest={db:{prepare:sql=>statement(sql)}};
async function route(creationEnabled){
 const outfile=`.test-output/site-overview-${creationEnabled?'open':'locked'}.mjs`;
 const stubs={
  '@/lib/server-owner':'export const database=()=>globalThis.overviewTest.db;',
  '@/lib/server-utils':'export const bucket=()=>({});',
  '@/lib/server-cache':'export const sharedMarketCache=async()=>({data:{launches:null,volume:null,burned:null},updatedAt:Date.now(),stale:false});',
  '@/lib/launch-records':'export const readLaunchRecords=async()=>[];',
 };
 await build({entryPoints:['app/api/site-overview/route.ts'],outfile,bundle:true,packages:'external',platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'overview-boundaries',setup(b){
  b.onResolve({filter:/^@\/lib\//},a=>a.path in stubs?{path:a.path,namespace:'stub'}:null);
  b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js'}));
  b.onLoad({filter:/platform-settings\.mjs$/},a=>({contents:fs.readFileSync(a.path,'utf8').replace('TOKEN_CREATION_ENABLED=false',`TOKEN_CREATION_ENABLED=${creationEnabled}`),loader:'js'}));
 }}]});
 return (await import('../'+outfile)).GET;
}
test('hero launch claims read the live platform cache and stay off while creation is locked',async()=>{
 const locked=await (await (await route(false))()).json();
 assert.deepEqual(locked.features,{pairedLaunches:false,onChainRules:false});
 const open=await (await (await route(true))()).json();
 assert.deepEqual(open.features,{pairedLaunches:true,onChainRules:true},'A fully verified platform row under the key /api/platform writes must be found.');
});
