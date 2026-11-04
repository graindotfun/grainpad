import test from 'node:test';
import assert from 'node:assert/strict';
import {buildXmrReading,fetchXmrUsd,parseKrakenOhlc,parseKrakenTicker,XMR_USD_SOURCE} from '../lib/xmr-usd.mjs';
const candles=n=>Array.from({length:n},(_,i)=>[1_700_000_000+i*3600,'1','1','1',String(150+i*.1),'1','1',1]);
const ticker={error:[],result:{XXMRZUSD:{c:['161.25','0.1']}}},ohlc=n=>({error:[],result:{XXMRZUSD:candles(n),last:1}});
test('ticker and candles parse, anything odd is refused',()=>{
 assert.equal(parseKrakenTicker(ticker),161.25);
 assert.equal(parseKrakenTicker({error:['EQuery:Unknown asset pair'],result:{}}),null);
 assert.equal(parseKrakenTicker({error:[],result:{X:{c:['0']}}}),null);
 assert.equal(parseKrakenOhlc(ohlc(30)).length,30);
 assert.equal(parseKrakenOhlc({error:[],result:{XXMRZUSD:candles(5)}}),null);
 assert.equal(parseKrakenOhlc({error:[],result:{XXMRZUSD:[[1,'1','1','1','x']]}}),null);
});
test('the reading ends on the spot price, has 24 hourly and about 84 two-hourly points and real changes',()=>{
 const closes=parseKrakenOhlc(ohlc(720)),r=buildXmrReading(161.25,closes);
 assert.equal(r.usd,161.25);assert.equal(r.h24.length,24);assert.equal(r.h24.at(-1),161.25);
 assert.equal(r.d7.length,84);assert.equal(r.d7.at(-1),161.25);
 assert.equal(r.change24h,+(((161.25-r.h24[0])/r.h24[0])*100).toFixed(2));
 assert.equal(r.source,XMR_USD_SOURCE);assert.match(r.sourceUrl,/^https:\/\//);
 assert.equal(buildXmrReading(0,closes),null);assert.equal(buildXmrReading(100,closes.slice(0,10)),null);
});
test('fetch asks Kraken for the XMR/USD pair only and fails closed',async()=>{
 const seen=[];
 const r=await fetchXmrUsd(async url=>{seen.push(String(url));return Response.json(String(url).includes('Ticker')?ticker:ohlc(720));});
 assert.equal(r.usd,161.25);assert.ok(seen.every(u=>u.startsWith('https://api.kraken.com/0/public/')&&u.includes('XMRUSD')));
 await assert.rejects(fetchXmrUsd(async()=>new Response('{}',{status:503})),/unavailable/);
 await assert.rejects(fetchXmrUsd(async url=>Response.json(String(url).includes('Ticker')?{error:['x'],result:{}}:ohlc(720))),/unavailable/);
});
