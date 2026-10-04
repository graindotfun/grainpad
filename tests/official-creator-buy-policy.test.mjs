import test from 'node:test';import assert from 'node:assert/strict';
import {OFFICIAL_CREATOR_BUY,RETIRED_CREATOR_BUY_MINT,assertOfficialCreatorBuyRequest} from '../lib/official-creator-buy.mjs';
import {OFFICIAL_LAUNCH_PINS} from '../lib/official-launch-policy.mjs';import {PLATFORM_SETTINGS} from '../lib/platform-settings.mjs';
const input=()=>({owner:PLATFORM_SETTINGS.admin,mint:RETIRED_CREATOR_BUY_MINT,side:'buy',amount:'1200000000',maxTotalDebitLamports:1203000000,slippageBps:500});
test('updated creator approval is exact1.2, total ceiling1.25 and unchanged stricter route overhead',()=>{const request=input();assert.throws(()=>assertOfficialCreatorBuyRequest(request,{publishedMint:OFFICIAL_LAUNCH_PINS.mint}),/permanently retired/);assert.equal(OFFICIAL_CREATOR_BUY.maximumDebitLamports,1250000000);assert(OFFICIAL_CREATOR_BUY.routeMaximumDebitLamports<=OFFICIAL_CREATOR_BUY.maximumDebitLamports);assert.equal(request.slippageBps,500);});
for(const patch of [{owner:'foreign'},{mint:PLATFORM_SETTINGS.admin},{side:'sell'},{amount:'1000000000'},{amount:'1300000000'},{maxTotalDebitLamports:1250000000},{maxTotalDebitLamports:1260000000}])test('creator shortcut refuses changed '+JSON.stringify(patch),()=>{assert.throws(()=>assertOfficialCreatorBuyRequest({...input(),...patch},{publishedMint:OFFICIAL_LAUNCH_PINS.mint}));});
test('creator request cannot precede verified official CA publication',()=>{for(const publishedMint of [undefined,null,PLATFORM_SETTINGS.admin])assert.throws(()=>assertOfficialCreatorBuyRequest(input(),{publishedMint}));});
test('actual server preparation rejects changed shortcut input before constructing any intent',async()=>{
 const {build}=await import('esbuild'),{mkdirSync,readFileSync}=await import('node:fs'),{DatabaseSync}=await import('node:sqlite');mkdirSync('.test-output/creator-buy-server',{recursive:true});
 const outfile='.test-output/creator-buy-server/server.mjs';
 await build({entryPoints:['lib/server-sol-trade.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[{name:'creator-buy-boundaries',setup(b){
  b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const env={SOL_TRADING_ENABLED:'true'};",loader:'js'}));
  b.onLoad({filter:/server-owner\.ts$/},()=>({contents:"export function database(){return globalThis.__creatorPolicyDb;}",loader:'js'}));
  b.onLoad({filter:/server-utils\.ts$/},()=>({contents:'export function bucket(){return globalThis.__creatorPolicyBucket;}',loader:'js'}));
  b.onLoad({filter:/sol-trade-prepare\.mjs$/},()=>({contents:'export async function prepareGuardedSolTrade(input){globalThis.__creatorPrepared.push(input);const now=Date.now(),review={version:1,id:"a".repeat(32),messageHash:"b".repeat(64),createdAt:now,expiresAt:now+60000,owner:input.owner,mint:input.mint,side:input.side,amount:input.amount,maxTotalDebitLamports:input.maxTotalDebitLamports};await input.storage.put(`sol-trades/v1/${review.id}`,JSON.stringify(review),{onlyIf:{etagDoesNotMatch:"*"}});return review;}export function solRouterFetcher(){return ()=>{throw Error("No router request expected")}}',loader:'js'}));
  b.onLoad({filter:/server-rpc\.ts$/},()=>({contents:'export function forwardRpc(){throw Error("No RPC send expected")}',loader:'js'}));
 }}]});
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0035_official_creator_buy_reservation.sql',import.meta.url),'utf8'));sql.exec('CREATE TABLE official_token(id INTEGER PRIMARY KEY,mint TEXT)');sql.prepare('INSERT INTO official_token VALUES(1,?)').run(RETIRED_CREATOR_BUY_MINT);
 globalThis.__creatorPolicyDb={prepare(query){const statement=sql.prepare(query),bound=(...values)=>({first:async()=>statement.get(...values)||null,run:async()=>({meta:{changes:Number(statement.run(...values).changes)}})});return {...bound(),bind:bound};}};
 const objects=new Map();globalThis.__creatorPolicyBucket={get:async key=>objects.has(key)?{json:async()=>JSON.parse(objects.get(key))}:null,put:async(key,value)=>{objects.set(key,value);return true;}};
 const {prepareServerSolTrade}=await import('../'+outfile);globalThis.__creatorPrepared=[];
 try{
  await assert.rejects(prepareServerSolTrade({...input(),creatorBuy:true}),/permanently retired/);assert.equal(globalThis.__creatorPrepared.length,0);assert.equal(objects.size,0);assert.equal(sql.prepare('SELECT count(*) AS n FROM official_creator_buy_reservation').get().n,0);
  for(const patch of [{amount:'1000000000'},{amount:'1300000000'},{owner:'foreign'},{maxTotalDebitLamports:1250000000},{creatorBuy:'true'}])await assert.rejects(prepareServerSolTrade({...input(),creatorBuy:true,...patch}));
  sql.exec('DELETE FROM official_token');await assert.rejects(prepareServerSolTrade({...input(),creatorBuy:true}));assert.equal(globalThis.__creatorPrepared.length,0);
 }finally{delete globalThis.__creatorPrepared;delete globalThis.__creatorPolicyDb;delete globalThis.__creatorPolicyBucket;sql.close();}
});
