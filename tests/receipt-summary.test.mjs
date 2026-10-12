import test from 'node:test';import assert from 'node:assert/strict';
import {receiptSummary,receiptElapsed} from '../lib/receipt-summary.mjs';
const launch={signature:'launch',blockTime:100,slot:1};
const e=(id,kind,wallet,time,amount='100',slot=time)=>({id,signature:id,kind,wallet,blockTime:time,slot,baseAmount:amount,quoteAmount:'12',quoteDecimals:6,quoteSymbol:'SOL'});
const calc=(events,options={})=>receiptSummary({launch,events,creator:'creator',...options});
test('full coverage: unique wallets in a complete opening minute and exact sale evidence',()=>{
 const s=calc([e('a','buy','a',101),e('a2','buy','a',102),e('b','buy','b',108),e('c','buy','c',161),e('sale','sell','a',143,'200')],{partial:false});
 assert.equal(s.opening.length,2);assert.equal(s.opening[0].exitSeconds,43);assert.equal(s.opening[1].status,'Still holding (indexed trades only)');assert.match(s.lines[0].text,/2 wallets.*8s/);assert.match(s.lines[1].text,/^1 .*43s/);assert.deepEqual(s.lines[1].evidence.map(e=>e.signature),['a','a2','sale']);
});
test('partial coverage: every positive claim scoped; missing sale is unknown',()=>{const s=calc([e('buy','buy','a',104)]);assert.match(s.lines[0].text,/in the indexed history/);assert.match(s.lines[1].text,/unknown/);assert.match(s.opening[0].status,/unknown/);assert.doesNotMatch(s.lines[1].text,/0|no sale/i);});
test('no creator buy says indexed history; provisional creator buy is excluded',()=>{const s=calc([{...e('pending','buy','creator',104),provisional:true}]);assert.equal(s.creatorBuy,null);assert.equal(s.lines[2].text,'No creator buy found in the indexed history.');});
test('creator among opening buyers is badged and linked to finalized evidence',()=>{const s=calc([e('creatorBuy','buy','creator',103)]);assert.equal(s.opening[0].creator,true);assert.equal(s.creatorBuy.signature,'creatorBuy');assert.equal(s.lines[2].evidence[0].signature,'creatorBuy');assert.match(s.lines[2].text,/3s after launch/);});
test('missing launch time and missing amounts never become zero',()=>{assert.match(calc([e('buy','buy','a',103)],{launch:{signature:'launch',blockTime:null}}).lines[0].text,/unknown/);assert.equal(receiptElapsed(null),'Timing unknown');const missing=calc([{...e('buy','buy','a',103),baseAmount:null},e('sell','sell','a',110)]);assert.equal(missing.opening[0].exitSeconds,null);assert.match(missing.opening[0].status,/unknown/);});
test('same-slot events are grouped, not assigned an execution order',()=>{const s=calc([e('a-sale','sell','a',104,'100',3),e('z-buy','buy','a',104,'100',3)]);assert.equal(s.opening[0].exitSeconds,4);assert.equal(s.lines[1].evidence.length,2);});
test('truncation withholds totals and exits; large raw units remain exact',()=>{const s=calc([e('buy','buy','a',102,'999999999999999999999'),e('sell','sell','a',104,'999999999999999999998')]);assert.equal(s.opening[0].exitSeconds,null);assert.match(s.opening[0].status,/Partially sold/);assert.match(calc([e('buy','buy','a',102)],{truncated:true}).lines[0].text,/totals unknown/);});
test('missing buy block time withholds the minute-one total',()=>{assert.match(calc([e('buy','buy','a',null)]).lines[0].text,/totals unknown.*no block time/);});
test('later re-entry is visible rather than reported as a current empty wallet',()=>{const s=calc([e('buy','buy','a',101),e('sale','sell','a',103),e('rebuy','buy','a',200)]);assert.match(s.opening[0].status,/bought again later/);});

test('complete indexed sale with missing block time does not become partially sold',()=>{const s=calc([e('buy','buy','a',101,'100',2),e('sell','sell','a',null,'100',3)]);assert.equal(s.opening[0].exitSeconds,null);assert.match(s.opening[0].status,/Sold all indexed buys.*timing unknown/);assert.match(s.lines[1].text,/unknown/);});
