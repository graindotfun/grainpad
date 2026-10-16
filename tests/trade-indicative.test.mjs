import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicKey} from '@solana/web3.js';
import BN from 'bn.js';
import {quoteIndicativeTrade,startIndicativeQuote} from '../lib/trade-indicative.mjs';
import {swapInstruction} from '../lib/market-core.mjs';
import {QUOTES} from '../lib/quote-assets.mjs';
const b=x=>new BN(String(x)),key=n=>new PublicKey(new Uint8Array(32).fill(n)),mint=key(2);
const market={route:'curve',quote:QUOTES.wXMR,poolId:key(9),pool:{mintA:mint,mintB:new PublicKey(QUOTES.wXMR.mint),mintProgramFlag:1,mintDecimalsA:6,mintDecimalsB:12,configId:key(3),platformId:key(4),vaultA:key(5),vaultB:key(6),creator:key(7),virtualA:b('1073000000000000'),virtualB:b('6000000000000'),realA:b('200000000000000'),realB:b('1500000000000'),totalSellA:b('793100000000000'),totalFundRaisingB:b('20000000000000')},config:{tradeFeeRate:b(2500),curveType:0},platform:{feeRate:b(2500),creatorFeeRate:b(2500)},epoch:1045,transferFeeConfig:{olderTransferFee:{epoch:0n,transferFeeBasisPoints:100,maximumFee:18446744073709551615n},newerTransferFee:{epoch:1045n,transferFeeBasisPoints:300,maximumFee:18446744073709551615n}}};
test('disconnected indicative quote uses exact integer amounts and net current transfer tax, carries no transaction',()=>{
 for(const [side,text,raw] of [['buy','0.002',2000000000n],['sell','1000',1000000000n]]){
  const q=quoteIndicativeTrade(market,mint,side,text,'5');
  const executable=swapInstruction(market,PublicKey.default,mint,side,raw,500);
  assert.equal(q.output,String(executable.output));assert.equal(q.minimum,String(executable.minimum));assert.equal(q.transferTaxBps,300);assert.equal(q.expiresAt-q.updatedAt,15000);
  assert.deepEqual(Object.keys(q).sort(),['expiresAt','minimum','output','transferTaxBps','updatedAt']);
 }
 for(const [amount,slippage] of [['0','5'],['-1','5'],['0.0000000000001','5'],['0.002','21'],['0.002','NaN']])assert.throws(()=>quoteIndicativeTrade(market,mint,'buy',amount,slippage));
 assert.throws(()=>quoteIndicativeTrade({...market,epoch:undefined},mint,'buy','0.002','5'),/epoch/);
});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('rapid input changes cancel debounce without making the obsolete market read',async()=>{
 let reads=0;const events=[];const stop=startIndicativeQuote({delayMs:20,read:async()=>{reads++;return {expiresAt:Date.now()+100};},publish:x=>events.push(x)});stop();await wait(35);assert.equal(reads,0);assert.deepEqual(events.map(x=>x.status),['loading']);
});
test('late old read cannot overwrite a new amount or publish an obsolete failure',async()=>{
 let resolveOld,rejectOld;const old=new Promise((resolve,reject)=>{resolveOld=resolve;rejectOld=reject;});const events=[];
 const stop=startIndicativeQuote({delayMs:0,read:()=>old,publish:x=>events.push(x)});await wait(5);stop();resolveOld({output:'999',expiresAt:Date.now()+100});await wait(5);assert.deepEqual(events.map(x=>x.status),['loading']);
 const rejection=new Promise((_,reject)=>{rejectOld=reject;});const stopFailure=startIndicativeQuote({delayMs:0,read:()=>rejection,publish:x=>events.push(x)});await wait(5);stopFailure();rejectOld(Error('Old route failure'));await wait(5);assert.deepEqual(events.map(x=>x.status),['loading','loading']);
});
test('estimate expiry clears the amount, and a current upstream failure publishes unavailable',async()=>{
 const events=[];const stop=startIndicativeQuote({delayMs:0,lifetimeMs:15,read:async()=>({output:'123',expiresAt:Date.now()+100}),publish:x=>events.push(x)});await wait(35);stop();assert.deepEqual(events.map(x=>x.status),['loading','ready','expired']);assert.equal(events.at(-1).quote,null);
 const failed=[];const stopFailure=startIndicativeQuote({delayMs:0,read:async()=>{throw Error('Market unavailable');},publish:x=>failed.push(x)});await wait(5);stopFailure();assert.equal(failed.at(-1).status,'unavailable');assert.equal(failed.at(-1).quote,null);
});

test('an unresponsive estimate reaches a bounded visible failure and ignores a late result',async()=>{
 let resolve;const events=[],late=new Promise(r=>resolve=r);const stop=startIndicativeQuote({delayMs:0,timeoutMs:15,read:()=>late,publish:v=>events.push(v)});await wait(35);assert.equal(events.at(-1).status,'unavailable');assert.match(events.at(-1).error,/taking too long/);resolve({output:'999',expiresAt:Date.now()+1000});await wait(5);assert.equal(events.at(-1).quote,null);assert.equal(events.filter(x=>x.status==='ready').length,0);stop();
});
