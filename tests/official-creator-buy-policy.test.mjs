import test from 'node:test';import assert from 'node:assert/strict';
import {OFFICIAL_CREATOR_BUY,assertOfficialCreatorBuyRequest} from '../lib/official-creator-buy.mjs';
import {OFFICIAL_LAUNCH_PINS} from '../lib/official-launch-policy.mjs';import {PLATFORM_SETTINGS} from '../lib/platform-settings.mjs';
const input=()=>({owner:PLATFORM_SETTINGS.admin,mint:OFFICIAL_LAUNCH_PINS.mint,side:'buy',amount:'1000000000',maxTotalDebitLamports:1003000000,slippageBps:500});
test('updated creator approval is exact1, total ceiling1.25 and unchanged stricter route overhead',()=>{const request=input();assert.equal(assertOfficialCreatorBuyRequest(request,{publishedMint:OFFICIAL_LAUNCH_PINS.mint}),request);assert.equal(OFFICIAL_CREATOR_BUY.maximumDebitLamports,1250000000);assert(OFFICIAL_CREATOR_BUY.routeMaximumDebitLamports<=OFFICIAL_CREATOR_BUY.maximumDebitLamports);assert.equal(request.slippageBps,500);});
for(const patch of [{owner:'foreign'},{mint:PLATFORM_SETTINGS.admin},{side:'sell'},{amount:'1200000000'},{amount:'1300000000'},{maxTotalDebitLamports:1250000000},{maxTotalDebitLamports:1260000000}])test('creator shortcut refuses changed '+JSON.stringify(patch),()=>{assert.throws(()=>assertOfficialCreatorBuyRequest({...input(),...patch},{publishedMint:OFFICIAL_LAUNCH_PINS.mint}));});
test('creator request cannot precede verified official CA publication',()=>{for(const publishedMint of [undefined,null,PLATFORM_SETTINGS.admin])assert.throws(()=>assertOfficialCreatorBuyRequest(input(),{publishedMint}));});
test('actual server preparation rejects changed shortcut input before constructing any intent',async()=>{
 const {build}=await import('esbuild'),{mkdirSync}=await import('node:fs');mkdirSync('.test-output/creator-buy-server',{recursive:true});
 const outfile='.test-output/creator-buy-server/server.mjs';
 await build({entryPoints:['lib/server-sol-trade.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[{name:'creator-buy-boundaries',setup(b){
  b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const env={SOL_TRADING_ENABLED:'true'};",loader:'js'}));
  b.onLoad({filter:/server-owner\.ts$/},()=>({contents:"export function database(){return {prepare(){return {first:async()=>globalThis.__creatorPublished?{mint:globalThis.__creatorPublished}:null}}}}",loader:'js'}));
  b.onLoad({filter:/server-utils\.ts$/},()=>({contents:'export function bucket(){return {}};',loader:'js'}));
  b.onLoad({filter:/sol-trade-prepare\.mjs$/},()=>({contents:'export async function prepareGuardedSolTrade(input){globalThis.__creatorPrepared.push(input);return {owner:input.owner,mint:input.mint,side:input.side,amount:input.amount,maxTotalDebitLamports:input.maxTotalDebitLamports};}export function solRouterFetcher(){return ()=>{throw Error("No router request expected")}}',loader:'js'}));
  b.onLoad({filter:/server-rpc\.ts$/},()=>({contents:'export function forwardRpc(){throw Error("No RPC send expected")}',loader:'js'}));
 }}]});
 const {prepareServerSolTrade}=await import('../'+outfile);globalThis.__creatorPrepared=[];globalThis.__creatorPublished=OFFICIAL_LAUNCH_PINS.mint;
 try{
  const review=await prepareServerSolTrade({...input(),creatorBuy:true});assert.equal(review.amount,'1000000000');assert.equal(review.maxTotalDebitLamports,1003000000);assert.equal(globalThis.__creatorPrepared.length,1);
  for(const patch of [{amount:'1200000000'},{amount:'1300000000'},{owner:'foreign'},{maxTotalDebitLamports:1250000000},{creatorBuy:'true'}])await assert.rejects(prepareServerSolTrade({...input(),creatorBuy:true,...patch}));
  globalThis.__creatorPublished=null;await assert.rejects(prepareServerSolTrade({...input(),creatorBuy:true}));assert.equal(globalThis.__creatorPrepared.length,1);
 }finally{delete globalThis.__creatorPrepared;delete globalThis.__creatorPublished;}
});
