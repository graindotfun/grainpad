import test from 'node:test';import assert from 'node:assert/strict';
import {illustrateCredit,illustrationAvailable,exactCreditParts,formatIllustration,formatQuotePrice,priceFreshness,derivedSolWxmr} from '../lib/reward-credit-illustration.mjs';
const now=1000000,row=price=>({price,updatedAt:now,freshness:'fresh',source:'fixture',note:'Mint USD, not spot'}),prices={wXMR:row(312.4),SOL:row(148.22)};
test('currency figures derive from raw BigInt, keep exact original amount, never become payout units',()=>{const raw=5197360247n,usd=illustrateCredit(raw,'USD',prices,now),sol=illustrateCredit(raw,'SOL',prices,now);assert.equal(usd.exact,'0.005197360247');assert.equal(usd.value,Number(raw)/1e12*312.4);assert.equal(sol.value,usd.value/148.22);assert.equal(usd.approximate,true);assert.equal(derivedSolWxmr(prices,now),148.22/312.4);assert.deepEqual(exactCreditParts(raw),{exact:'0.005197360247',head:'0.005197',tail:'360247'});assert.equal(exactCreditParts(1n).tail,'000001');});
test('zero/tiny/large formats retain explicit illustration precision',()=>{assert.equal(formatIllustration(0,'USD'),'$0.00');assert.equal(formatIllustration(12.345,'USD'),'$12.35');assert.equal(formatIllustration(.00123456,'USD'),'$0.00123');assert.equal(formatIllustration(.0832456,'SOL'),'0.08325');assert.equal(formatIllustration(1e-12,'SOL'),'0.000000000001');assert.equal(formatQuotePrice(312.4),'$312.40');assert.equal(formatQuotePrice(.000123456),'$0.0001235');assert.equal(formatQuotePrice(NaN),'n/a');});
test('missing/expired/invalid prices disable conversion; stale illustrates with delay and wXMR always stays exact',()=>{for(const missing of [null,{wXMR:null,SOL:row(148)},{wXMR:{...row(312),freshness:'expired'},SOL:row(148)},{wXMR:{...row(312),updatedAt:now-600001},SOL:row(148)},{wXMR:{...row(312),updatedAt:now+1},SOL:row(148)}]){assert.equal(illustrationAvailable('USD',missing,now),false);assert.equal(illustrateCredit(1n,'USD',missing,now),null);assert.equal(illustrationAvailable('wXMR',missing,now),true);}assert.equal(illustrationAvailable('SOL',{...prices,SOL:null},now),false);const stale={...prices,wXMR:{...row(312),updatedAt:now-60001}};assert.equal(illustrateCredit(1n,'USD',stale,now).freshness,'stale');assert.equal(priceFreshness({...row(312),freshness:'stale'},now),'stale');assert.equal(illustrationAvailable('USD',prices,now+600001),false);assert.equal(illustrateCredit(9007199254740993001n,'wXMR',null,now).exact,'9007199.254740993001');});
test('unavailable values read n/a, never a dash, and a non-finite SOL/wXMR ratio is unavailable (price pill)',()=>{
 const now=Date.now(),quote=price=>({price,updatedAt:now,freshness:'fresh'});
 for(const value of [NaN,Infinity,-1])assert.equal(formatIllustration(value,'SOL'),'n/a');
 for(const value of [NaN,Infinity,0,-1])assert.equal(formatQuotePrice(value),'n/a');
 assert.equal(derivedSolWxmr({SOL:quote(200),wXMR:quote(0)},now),null,'Division by a zero price is not a ratio.');
 assert.equal(derivedSolWxmr({SOL:quote(NaN),wXMR:quote(600)},now),null);
 assert.equal(derivedSolWxmr({SOL:quote(200),wXMR:quote(600)},now),200/600);
});
test('finite extreme values stay short: bounds instead of hundreds of digits',()=>{
 for(const value of [1e-310,5e-324,1e300,Number.MAX_VALUE]){
  assert.ok(formatIllustration(value,'USD').length<=8,formatIllustration(value,'USD'));
  assert.ok(formatIllustration(value,'SOL').length<=8,formatIllustration(value,'SOL'));
  assert.ok(formatQuotePrice(value).length<=8,formatQuotePrice(value));
 }
 assert.equal(formatQuotePrice(1e300),'>$1e15');
 assert.equal(formatQuotePrice(1e-310),'<$1e-12');
});
