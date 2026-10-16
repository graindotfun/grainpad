import test from 'node:test';
import assert from 'node:assert/strict';
import {applyQuoteFreshness,fetchQuoteUsd,parseCoinbaseSol,parseJupiterPrice,quoteFreshness,QUOTE_USD_FRESH_MS,QUOTE_USD_STALE_MS} from '../lib/quote-usd.mjs';
import {QUOTES} from '../lib/quote-assets.mjs';
test('Jupiter prices both quote mints and Coinbase can only fill SOL',()=>{
 const body={[QUOTES.SOL.mint]:{usdPrice:100},[QUOTES.wXMR.mint]:{usdPrice:500}};
 assert.equal(parseJupiterPrice(body,QUOTES.SOL.mint).price,100);
 assert.equal(parseJupiterPrice(body,QUOTES.wXMR.mint).source,'jupiter-lite');
 assert.equal(parseJupiterPrice({[QUOTES.SOL.mint]:{usdPrice:0}},QUOTES.SOL.mint),null);
 assert.deepEqual(parseCoinbaseSol({data:{amount:'119.5',base:'SOL',currency:'USD'}}),{price:119.5,source:'coinbase-sol-usd'});
 assert.equal(parseCoinbaseSol({data:{amount:'400',base:'XMR',currency:'USD'}}),null);
});
test('freshness expires instead of presenting an old quote price as current',()=>{
 const now=1_000_000;
 assert.equal(quoteFreshness(now-QUOTE_USD_FRESH_MS,now),'fresh');
 assert.equal(quoteFreshness(now-QUOTE_USD_FRESH_MS-1,now),'stale');
 assert.equal(quoteFreshness(now-QUOTE_USD_STALE_MS-1,now),'expired');
 const stamped=applyQuoteFreshness({SOL:{symbol:'SOL',price:1,source:'jupiter-lite',note:'n'},wXMR:null},now-QUOTE_USD_STALE_MS-5,now);
 assert.equal(stamped.SOL.freshness,'expired');assert.equal(stamped.wXMR,null);
});
test('wXMR has no XMR substitute when Jupiter does not price the mint',async()=>{
 const prices=await fetchQuoteUsd(async url=>{
  if(String(url).includes('lite-api.jup.ag'))return Response.json({[QUOTES.SOL.mint]:{usdPrice:100}});
  if(String(url).includes('coinbase'))return Response.json({data:{amount:'90',base:'SOL',currency:'USD'}});
  throw Error('unexpected');
 });
 assert.equal(prices.SOL.price,100);assert.equal(prices.wXMR,null);
 const fallback=await fetchQuoteUsd(async url=>String(url).includes('coinbase')?Response.json({data:{amount:'90',base:'SOL',currency:'USD'}}):new Response('{}',{status:503}));
 assert.equal(fallback.SOL.source,'coinbase-sol-usd');assert.equal(fallback.wXMR,null);
});

test('wXMR fallback prices only the exact Solana mint; it never substitutes XMR spot',async()=>{
 const prices=await fetchQuoteUsd(async url=>String(url).includes('geckoterminal')?Response.json({data:{attributes:{token_prices:{[QUOTES.wXMR.mint]:'555.25',XMR:'999'}}}}):String(url).includes('coinbase')?Response.json({data:{amount:'105',base:'SOL',currency:'USD'}}):new Response('{}',{status:503}),1000000);
 assert.equal(prices.wXMR.price,555.25);assert.equal(prices.wXMR.source,'geckoterminal-mint-usd');assert.equal(prices.wXMR.mint,QUOTES.wXMR.mint);assert.equal(prices.SOL.source,'coinbase-sol-usd');
});
test('updating another quote asset cannot refresh an older quote timestamp',()=>{const prices=applyQuoteFreshness({SOL:{price:100,updatedAt:100000},wXMR:{price:500,updatedAt:1}},100000,100002);assert.equal(prices.SOL.freshness,'fresh');assert.equal(prices.wXMR.freshness,'stale');assert.equal(prices.wXMR.updatedAt,1);});
