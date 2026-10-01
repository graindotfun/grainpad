import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CREW_ASSETS} from '../lib/crew.mjs';
import {lamportBalance,tokenBalance,fundingAssets,taskCoverage,FUNDING_MAX_AGE_MS} from '../lib/room-funding.mjs';
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
 assert.match(source,/commitment:'finalized'/);
});
