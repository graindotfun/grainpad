import {receiptSummary} from './receipt-summary.mjs';
/** Dedicated indexed reads; never filter the latest tape page for lifetime facts. */
export async function receiptObservations(db,mint,creator,launch){
 const windowLimit=5000,tradeLimit=10000;
 const opening=Number.isFinite(launch?.blockTime)?await db.prepare("SELECT record FROM chain_event WHERE mint=? AND kind='buy' AND (block_time IS NULL OR (block_time>=? AND block_time<=?)) ORDER BY slot,id LIMIT ?").bind(mint,launch.blockTime,launch.blockTime+60,windowLimit+1).all():{results:[]};
 const creatorRows=await db.prepare("SELECT record FROM chain_event WHERE mint=? AND wallet=? AND kind='buy' ORDER BY slot,id LIMIT 100").bind(mint,creator).all();
 const wallets=[...new Set(opening.results.slice(0,windowLimit).map(r=>JSON.parse(r.record).wallet))];
 const trades=wallets.length?await db.prepare("SELECT record FROM chain_event WHERE mint=? AND wallet IN (SELECT value FROM json_each(?)) AND kind IN ('buy','sell') ORDER BY slot,id LIMIT ?").bind(mint,JSON.stringify(wallets),tradeLimit+1).all():{results:[]};
 const events=[...opening.results.slice(0,windowLimit),...trades.results.slice(0,tradeLimit),...creatorRows.results].map(r=>JSON.parse(r.record));
 return receiptSummary({launch,events,creator,partial:true,truncated:opening.results.length>windowLimit||trades.results.length>tradeLimit});
}
