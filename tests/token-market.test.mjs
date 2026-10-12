import test from 'node:test';
import assert from 'node:assert/strict';
import {selectQuote,formatMarketCap,formatChange} from '../lib/token-market.ts';
import {readLaunchRecords,launchPage} from '../lib/launch-records.ts';
const mint='So11111111111111111111111111111111111111112';
const pairAddress='Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const pair={chainId:'solana',pairAddress,baseToken:{address:mint},priceUsd:'0.002',marketCap:2000000,priceChange:{h24:-12.5},liquidity:{usd:10000}};
const time='2026-09-29T00:00:00.000Z';
test('market quotes match the exact base mint and chain, not names or quote-side matches',()=>{
 assert.equal(selectQuote(mint,[{...pair,chainId:'ethereum'},{...pair,baseToken:{address:'other'},quoteToken:{address:mint}}],time).priceUsd,null);
 assert.equal(selectQuote(mint,[pair],time).change24h,-12.5);
});
test('select the liquid market, without averaging incompatible pools',()=>{
 const q=selectQuote(mint,[pair,{...pair,priceUsd:'0.004',liquidity:{usd:20000}}],time);
 assert.equal(q.priceUsd,0.004);assert.equal(q.fetchedAt,time);
});
test('missing MC never becomes FDV and missing change never becomes zero',()=>{
 const q=selectQuote(mint,[{...pair,marketCap:null,fdv:8000000,priceChange:{}}],time);
 assert.equal(q.marketCapUsd,null);assert.equal(q.change24h,null);
 assert.equal(selectQuote(mint,[{...pair,priceChange:{h24:0}}],time).change24h,0);
});
test('invalid and illiquid quotes are rejected',()=>{
 for(const patch of [{priceUsd:'NaN'},{priceUsd:'-1'},{priceUsd:'Infinity'},{liquidity:{usd:0}},{pairAddress:'https://evil.example'}])assert.equal(selectQuote(mint,[{...pair,...patch}],time).priceUsd,null);
 assert.equal(selectQuote(mint,[{...pair,priceChange:{h24:Infinity}}],time).change24h,null);
});
test('small changes retain their direction and null is visibly distinct from zero',()=>{
 assert.equal(formatChange(0), '0.00%');assert.equal(formatChange(null),'—');assert.equal(formatChange(-0.001),'−<0.01%');assert.equal(formatChange(0.001),'+<0.01%');assert.equal(formatMarketCap(null),'—');assert.equal(formatMarketCap(1250000),'$1.25M');
});
test('directory reads every storage page, then sorts and paginates by date',async()=>{
 const keys=Array.from({length:65},(_,i)=>String(i));
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
 const records=keys.map((key,i)=>({mint:'1'.repeat(31)+alphabet[Math.floor(i/58)]+alphabet[i%58],name:'Token '+i,symbol:'T'+i,image:'',pool:pairAddress,network:'mainnet-beta',verification:'confirmed-on-chain',platformId:'own-platform',createdAt:new Date(Date.UTC(2026,0,1,0,i)).toISOString()}));
 const store={list:async({cursor})=>cursor?{objects:keys.slice(40).map(key=>({key})),truncated:false}:{objects:keys.slice(0,40).map(key=>({key})),truncated:true,cursor:'next'},get:async key=>({text:async()=>JSON.stringify(records[Number(key)])})};
 const rows=await readLaunchRecords(store,'mainnet-beta','own-platform');assert.equal(rows.length,65);assert.equal(rows[0].name,'Token 64');
 const one=launchPage(rows,null),two=launchPage(rows,one.nextCursor),three=launchPage(rows,two.nextCursor);
 assert.equal(one.launches.length,30);assert.equal(two.launches.length,30);assert.equal(three.launches.length,5);assert.equal(three.nextCursor,null);assert.equal(new Set([...one.launches,...two.launches,...three.launches].map(x=>x.mint)).size,65);
 assert.throws(()=>launchPage(rows,'bad-cursor'));
});
