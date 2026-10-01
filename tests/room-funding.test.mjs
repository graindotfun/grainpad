import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CREW_ASSETS} from '../lib/crew.mjs';
import {DatabaseSync} from 'node:sqlite';
import {lamportBalance,tokenBalance,fundingAssets,fundingBalance,publicCoverage,taskCoverage,FUNDING_MAX_AGE_MS} from '../lib/room-funding.mjs';
const mint='9'.repeat(32),now=1_790_000_000_000;
const task=(budget,status='open',closed=false)=>({id:'t',budget,status,closed});
const fresh=(raw,decimals,age=1000)=>({raw,decimals,checkedAt:now-age});
const row=(m,amount,decimals)=>({account:{data:{parsed:{info:{mint:m,tokenAmount:{amount,decimals}}}}}});
test('SOL budget is Funded only when the balance covers it',()=>{
 assert.equal(taskCoverage(task({amount:'0.5',asset:'SOL'}),mint,{SOL:fresh('500000000',9)},{now}).funded,true);
 assert.equal(taskCoverage(task({amount:'0.5',asset:'SOL'}),mint,{SOL:fresh('499999999',9)},{now}).funded,false);
});
test('USDC, wXMR and the project token resolve their own balance',()=>{
 assert.equal(taskCoverage(task({amount:'25',asset:'USDC'}),mint,{USDC:fresh('25000000',6)},{now}).funded,true);
 assert.equal(taskCoverage(task({amount:'1',asset:'wXMR'}),mint,{wXMR:fresh('0',CREW_ASSETS.wXMR.decimals)},{now}).funded,false);
 assert.equal(taskCoverage(task({amount:'10',asset:mint}),mint,{[mint]:fresh('10000000',6)},{now}).funded,true);
});
test('no coverage for stale, missing, mismatched, unparsable or unresolved inputs',()=>{
 const b={amount:'1',asset:'SOL'};
 assert.equal(taskCoverage(task(b),mint,{SOL:fresh('9000000000',9,FUNDING_MAX_AGE_MS+1)},{now}),null);
 assert.equal(taskCoverage(task(b),mint,{},{now}),null);
 assert.equal(taskCoverage(task(b),mint,{SOL:fresh('9000000000',6)},{now}),null);
 assert.equal(taskCoverage(task({amount:'1.2.3',asset:'SOL'}),mint,{SOL:fresh('9',9)},{now}),null);
 assert.equal(taskCoverage(task({amount:'0',asset:'SOL'}),mint,{SOL:fresh('9',9)},{now}),null);
 assert.equal(taskCoverage(task({amount:'1',asset:'DOGE'}),mint,{SOL:fresh('9000000000',9)},{now}),null);
 assert.equal(taskCoverage({id:'t',budget:null,status:'open',closed:false},mint,{},{now}),null);
 assert.equal(taskCoverage(task(b,'open',true),mint,{SOL:fresh('9000000000',9)},{now}),null);
 assert.equal(taskCoverage(task(b,'paid'),mint,{SOL:fresh('9000000000',9)},{now}),null);
 assert.equal(taskCoverage(task(b),mint,{SOL:{raw:'9000000000',decimals:9,checkedAt:now+3_600_000}},{now}),null);
});
test('balance parsing rejects anything ambiguous',()=>{
 assert.equal(lamportBalance({value:7}),7n);assert.throws(()=>lamportBalance({value:'7'}));assert.throws(()=>lamportBalance(null));
 const usdc=CREW_ASSETS.USDC;
 assert.equal(tokenBalance({value:[row(usdc.mint,'5',6),row(usdc.mint,'7',6)]},usdc),12n);
 assert.equal(tokenBalance({value:[]},usdc),0n);
 assert.throws(()=>tokenBalance({value:[row(usdc.mint,'5',9)]},usdc),/decimals/);
 assert.throws(()=>tokenBalance({value:[row('other','5',6)]},usdc),/match/);
 assert.throws(()=>tokenBalance({value:[row(usdc.mint,'-5',6)]},usdc));
 assert.throws(()=>tokenBalance({},usdc));
});
test('only open budgeted tasks request a balance, one read per asset',()=>{
 const list=[task({amount:'1',asset:'SOL'}),task({amount:'2',asset:'SOL'}),task({amount:'3',asset:'USDC'},'approved'),task({amount:'1',asset:'SOL'},'closed',true),task(null),task({amount:'1',asset:'??'})];
 assert.deepEqual(fundingAssets(list,mint).map(a=>a.code).sort(),['SOL','USDC']);
});
test('the route is read-only, creator-wallet only and never takes a client balance',()=>{
 const source=readFileSync(new URL('../app/api/room/[mint]/funding/route.ts',import.meta.url),'utf8');
 assert.match(source,/export async function GET/);assert.doesNotMatch(source,/export async function (POST|PUT|PATCH|DELETE)/);
 assert.match(source,/project\.creator/);assert.doesNotMatch(source,/searchParams|request\.json|limitedJSON/);
 assert.match(source,/commitment:'finalized'/);assert.doesNotMatch(source,/market_cache|sharedMarketCache\(db,`room-funding/);
});

function cacheDb(){
 const sqlite=new DatabaseSync(':memory:');
 for(const sql of readFileSync(new URL('../drizzle/0025_fame_and_funding_status.sql',import.meta.url),'utf8').split('--> statement-breakpoint'))if(sql.trim())sqlite.exec(sql);
 return {sqlite,prepare(sql){const stmt=sqlite.prepare(sql);return {bind:(...v)=>({first:async()=>stmt.get(...v)??null,run:()=>stmt.run(...v)})};}};
}
const sol=CREW_ASSETS.SOL,who='C'.repeat(40);
test('funding cache serves a fresh row without reading the chain, and never past 60 seconds',async()=>{
 const db=cacheDb();let reads=0;const load=async()=>{reads+=1;return 2_000_000_000n;},yes=async()=>true;
 const first=await fundingBalance(db,{creator:who,key:'SOL',asset:sol},load,yes,{now});assert.equal(first.raw,'2000000000');assert.equal(reads,1);
 await fundingBalance(db,{creator:who,key:'SOL',asset:sol},load,yes,{now:now+59_000});assert.equal(reads,1);
 await fundingBalance(db,{creator:who,key:'SOL',asset:sol},load,yes,{now:now+61_000});assert.equal(reads,2);
});
test('an expired row with no refresh allowed or a failed read yields no balance, so no Funded',async()=>{
 const db=cacheDb();await fundingBalance(db,{creator:who,key:'SOL',asset:sol},async()=>9n,async()=>true,{now});
 assert.equal(await fundingBalance(db,{creator:who,key:'SOL',asset:sol},async()=>9n,async()=>false,{now:now+120_000}),null);
 await assert.rejects(()=>fundingBalance(db,{creator:who,key:'SOL',asset:sol},async()=>{throw Error('rpc down');},async()=>true,{now:now+120_000}),/rpc down/);
});
test('Funded disappears once the balance drops below the budget and the cache expires',async()=>{
 const db=cacheDb(),budget=task({amount:'1',asset:'SOL'});let balance=2_000_000_000n;
 const status=async at=>{const entry=await fundingBalance(db,{creator:who,key:'SOL',asset:sol},async()=>balance,async()=>true,{now:at});return publicCoverage(taskCoverage(budget,mint,{SOL:entry},{now:at}));};
 assert.equal((await status(now)).funded,true);
 balance=100n;
 assert.equal((await status(now+30_000)).funded,true);
 assert.equal(await status(now+61_000),null);
});
test('the public shape never carries the wallet balance',()=>{
 const covered=taskCoverage(task({amount:'0.5',asset:'SOL'}),mint,{SOL:fresh('123456789012',9)},{now});
 const shape=publicCoverage(covered);
 assert.deepEqual(Object.keys(shape).sort(),['asset','checkedAt','decimals','funded','requiredRaw']);
 assert.equal(JSON.stringify(shape).includes('123456789012'),false);
 assert.equal(publicCoverage(taskCoverage(task({amount:'0.5',asset:'SOL'}),mint,{SOL:fresh('1',9)},{now})),null);
});
