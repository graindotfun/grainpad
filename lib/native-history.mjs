import {buildCandles,recentTradeRows,quoteVolume,tradeCoverage,CANDLE_SECONDS,CANDLE_BARS,TRADE_ROW_CAP} from './native-market.mjs';

async function queueCounts(db,mint){
 const rows=await db.prepare(`SELECT q.status AS status,count(*) AS n FROM indexer_queue q JOIN indexer_stream s ON q.source=s.address WHERE s.mint=? AND q.status IN ('pending','quarantined') GROUP BY q.status`).bind(mint).all();
 const counts={pending:0,quarantined:0};
 for(const row of rows.results||[])counts[row.status]=Number(row.n)||0;
 return counts;
}
export async function mintCoverage(db,mint,{tradeCount=0,truncated=false,untimed=0,activity='unknown'}={}){
 const streams=await db.prepare(`SELECT kind,history_done FROM indexer_stream WHERE mint=? AND kind IN ('curve','cpmm')`).bind(mint).all();
 const queue=await queueCounts(db,mint);
 return tradeCoverage({streams:streams.results||[],pending:queue.pending,quarantined:queue.quarantined,tradeCount,truncated,untimed,activity});
}
function records(rows){return (rows.results||[]).map(row=>JSON.parse(row.record));}
export async function readNativeHistory(db,mint,{kind='candles',seconds=300,activity='unknown',now=Math.floor(Date.now()/1000)}={}){
 if(!['candles','trades'].includes(kind))throw Error('Unsupported history request.');
 if(kind==='candles'&&!CANDLE_SECONDS.includes(seconds))throw Error('Unsupported candle period.');
 const untimedRow=await db.prepare(`SELECT count(*) AS n FROM chain_event WHERE mint=? AND kind IN ('buy','sell') AND block_time IS NULL`).bind(mint).first();
 const untimed=Number(untimedRow?.n)||0;
 if(kind==='trades'){
  const rows=await db.prepare(`SELECT record FROM chain_event WHERE mint=? AND kind IN ('buy','sell') AND block_time IS NOT NULL ORDER BY block_time DESC,slot DESC,id DESC LIMIT ?`).bind(mint,301).all();
  const parsed=records(rows);
  const recent=recentTradeRows(parsed,300);
  const coverage=await mintCoverage(db,mint,{tradeCount:recent.trades.length,truncated:rows.results.length>300,untimed,activity:recent.trades.length?'seen':activity});
  return {kind,rows:recent.trades,events:parsed,coverage,untimed,truncated:rows.results.length>300,unit:'quote'};
 }
 const start=now-seconds*CANDLE_BARS;
 const rows=await db.prepare(`SELECT record FROM chain_event WHERE mint=? AND kind IN ('buy','sell') AND block_time IS NOT NULL AND block_time>=? ORDER BY block_time,slot,id LIMIT ?`).bind(mint,start,TRADE_ROW_CAP+1).all();
 const truncated=rows.results.length>TRADE_ROW_CAP;
 const built=buildCandles(records({results:rows.results.slice(0,TRADE_ROW_CAP)}),seconds,{limit:CANDLE_BARS});
 const anyTrade=built.trades||untimed?1:(await db.prepare(`SELECT 1 AS n FROM chain_event WHERE mint=? AND kind IN ('buy','sell') LIMIT 1`).bind(mint).first())?.n||0;
 const coverage=await mintCoverage(db,mint,{tradeCount:anyTrade?Math.max(built.trades,1):0,truncated:truncated||built.truncated,untimed:untimed+built.untimed,activity:anyTrade?'seen':activity});
 const events=records({results:rows.results.slice(0,TRADE_ROW_CAP)});
 return {kind,rows:built.candles,events,coverage,untimed:untimed+built.untimed,truncated:truncated||built.truncated,unit:'quote'};
}
export async function indexedSummary(db,mint,now=Math.floor(Date.now()/1000)){
 const since=now-86400;
 const rows=await db.prepare(`SELECT record FROM chain_event WHERE mint=? AND kind IN ('buy','sell') AND block_time IS NOT NULL AND block_time>=? ORDER BY block_time,slot,id LIMIT ?`).bind(mint,since,TRADE_ROW_CAP+1).all();
 const truncated=rows.results.length>TRADE_ROW_CAP;
 const events=records({results:rows.results.slice(0,TRADE_ROW_CAP)});
 const volume=quoteVolume(events,since);
 const countRow=await db.prepare(`SELECT count(*) AS n FROM chain_event WHERE mint=? AND kind IN ('buy','sell')`).bind(mint).first();
 const tradeCount=Number(countRow?.n)||0;
 const coverage=await mintCoverage(db,mint,{tradeCount,truncated,untimed:0,activity:tradeCount?'seen':'unknown'});
 const reference=await db.prepare(`SELECT record FROM chain_event WHERE mint=? AND kind IN ('buy','sell') AND block_time IS NOT NULL AND block_time<=? ORDER BY block_time DESC,slot DESC,id DESC LIMIT 1`).bind(mint,since).first();
 const latest=await db.prepare(`SELECT record FROM chain_event WHERE mint=? AND kind IN ('buy','sell') AND block_time IS NOT NULL ORDER BY block_time DESC,slot DESC,id DESC LIMIT 1`).bind(mint).first();
 let change24h=null,changeCoverage='unavailable';
 if(reference&&latest&&coverage.status==='indexed'&&!truncated){
  const before=quoteVolume([JSON.parse(reference.record)],0),after=quoteVolume([JSON.parse(latest.record)],0);
  if(before.last&&after.last){change24h=(after.last-before.last)/before.last*100;changeCoverage=Number.isFinite(change24h)?'24h':'unavailable';if(changeCoverage!=='24h')change24h=null;}
 }else if(volume.trades>0)changeCoverage='partial';
 const complete=coverage.status==='indexed'&&!truncated;
 const provenEmpty=coverage.status==='no-trades';
 const unseen=coverage.status==='not-indexed'||(coverage.status==='partial'&&tradeCount===0);
 return {volume24hQuote:unseen?null:provenEmpty?0:volume.volume,volumeCoverage:unseen?'unavailable':provenEmpty||complete?'indexed':'partial',change24h,changeCoverage,tradeCount};
}
export function geckoFallbackAllowed(createdAt,coverage,rowCount,now=Date.now()){
 if(rowCount>0||coverage?.status==='no-trades'||coverage?.status==='indexed')return false;
 const created=Date.parse(createdAt||'');
 if(Number.isFinite(created)&&now-created<15*60*1000)return false;
 return coverage?.status==='not-indexed'||coverage?.status==='partial';
}
