import test from 'node:test';
import assert from 'node:assert/strict';
import {poolStats,parseCandles,parseTrades} from '../lib/market-display.ts';
const mint='A'.repeat(32),quoteMint='B'.repeat(32);
test('unverified market cap is absent, never substituted with FDV; legitimate zero volume stays zero',()=>{
 const s=poolStats({base_token_price_usd:'0.00002',market_cap_usd:null,fdv_usd:'900000',reserve_in_usd:'3000',volume_usd:{h24:'0'},price_change_percentage:{h24:'-2.1'}});
 assert.equal(s.marketCap,null);assert.equal(s.price,.00002);assert.equal(s.volume,0);assert.equal(s.change,-2.1);
 assert.equal(poolStats({base_token_price_usd:'Infinity',reserve_in_usd:'-1'}).price,null);
 assert.equal(poolStats({}).volume,null);
});
test('OHLCV is chronological, deduplicated and rejects malformed candle ranges',()=>{
 const rows=parseCandles({data:{attributes:{ohlcv_list:[[200,2,4,1,3,50],[100,1,2,.5,1.5,0],[100,1,2,.5,1.6,3],[300,3,2,1,4,5],[400,1,2,-1,1,5],[500,1,2,.5,'NaN',5]]}}});
 assert.deepEqual(rows.map(r=>r.time),[100,200]);assert.equal(rows[0].close,1.6);
 assert.throws(()=>parseCandles({}),/unavailable/);
});
test('trade direction follows the exact token pair, rejects unrelated trades and unsafe links',()=>{
 const a={tx_hash:'C'.repeat(88),tx_from_address:'D'.repeat(32),from_token_address:quoteMint,to_token_address:mint,from_token_amount:'2',to_token_amount:'1000',volume_in_usd:'30',block_timestamp:'2026-09-29T10:00:00Z',kind:'sell'};
 const body={data:[{id:'buy',attributes:a},{id:'sell',attributes:{...a,from_token_address:mint,to_token_address:quoteMint,from_token_amount:'500',to_token_amount:'1'}},{id:'wrong',attributes:{...a,to_token_address:'other'}},{id:'unsafe',attributes:{...a,tx_hash:'javascript:alert(1)'}},{id:'buy',attributes:a}]};
 const rows=parseTrades(body,mint,quoteMint);assert.equal(rows.length,2);assert.equal(rows[0].side,'buy');assert.equal(rows[0].tokens,1000);assert.equal(rows[1].side,'sell');assert.equal(rows[1].quote,1);
 assert.throws(()=>parseTrades({},mint,quoteMint),/unavailable/);
});
