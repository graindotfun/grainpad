import {recentTradeRows,quoteVolume,tradeCoverage,CANDLE_SECONDS,CANDLE_BARS} from './native-market.mjs';

async function queueCounts(db,mint,chartOnly=false){
 const chart=chartOnly?` AND (q.status='quarantined' OR (q.signature NOT IN(SELECT signature FROM chain_event WHERE mint=? AND kind IN ('buy','sell'))
  AND NOT EXISTS(SELECT 1 FROM market_cache c WHERE c.key=('chart-tx:v2:'||s.mint||':'||q.signature) AND c.value IS NOT NULL AND c.expires_at>?)))`:'';
 const query=db.prepare(`SELECT q.status AS status,count(*) AS n FROM indexer_queue q JOIN indexer_stream s ON q.source=s.address WHERE s.mint=? AND q.status IN ('pending','quarantined')${chart} GROUP BY q.status`);
 const rows=await (chartOnly?query.bind(mint,mint,Date.now()):query.bind(mint)).all();
 const counts={pending:0,quarantined:0};
 for(const row of rows.results||[])counts[row.status]=Number(row.n)||0;
 return counts;
}
export async function mintCoverage(db,mint,{tradeCount=0,truncated=false,untimed=0,activity='unknown',chartOnly=false}={}){
 const streams=await db.prepare(`SELECT kind,history_done FROM indexer_stream WHERE mint=? AND kind IN ('curve','cpmm')`).bind(mint).all();
 const queue=await queueCounts(db,mint,chartOnly);
 return tradeCoverage({streams:streams.results||[],pending:queue.pending,quarantined:queue.quarantined,tradeCount,truncated,untimed,activity});
}
function records(rows){return (rows.results||[]).map(row=>JSON.parse(row.record));}
/** Aggregate before limiting bars: an active token must never lose its latest trades to a raw-row cap.
 * SQLite REAL matches the display-only arithmetic in buildCandles; atomic amounts stay untouched. */
export const CANDLE_QUERY=`WITH prices AS (
 SELECT id,slot,block_time,source,CAST(block_time / ? AS INTEGER)*? AS time,
 CAST(json_extract(record,'$.quoteAmount') AS REAL)/CAST(json_extract(record,'$.baseAmount') AS REAL)
  * CAST('1e'||(json_extract(record,'$.baseDecimals')-json_extract(record,'$.quoteDecimals')) AS REAL) AS price,
 CAST(json_extract(record,'$.quoteAmount') AS REAL)/CAST('1e'||json_extract(record,'$.quoteDecimals') AS REAL) AS quote
 FROM chain_event WHERE mint=? AND kind IN ('buy','sell') AND block_time>=? AND block_time<=?
 AND CAST(json_extract(record,'$.baseAmount') AS REAL)>0 AND CAST(json_extract(record,'$.quoteAmount') AS REAL)>0
), ordered AS (
 SELECT *,ROW_NUMBER() OVER(PARTITION BY time ORDER BY block_time,slot,id) AS first,
 ROW_NUMBER() OVER(PARTITION BY time ORDER BY block_time DESC,slot DESC,id DESC) AS last
 FROM prices WHERE price>0 AND quote>0
)
SELECT time,MAX(CASE WHEN first=1 THEN price END) AS open,MAX(price) AS high,MIN(price) AS low,
 MAX(CASE WHEN last=1 THEN price END) AS close,SUM(quote) AS volume,COUNT(*) AS trades,
 MAX(CASE WHEN first=1 THEN block_time END) AS firstTime,MAX(CASE WHEN last=1 THEN block_time END) AS lastTime,
 MAX(CASE WHEN first=1 THEN slot END) AS firstSlot,MAX(CASE WHEN last=1 THEN slot END) AS lastSlot,
 MAX(CASE WHEN first=1 THEN id END) AS firstId,MAX(CASE WHEN last=1 THEN id END) AS lastId,
 GROUP_CONCAT(DISTINCT CASE WHEN source='cpmm' THEN 'cpmm' ELSE 'curve' END) AS sources
FROM ordered GROUP BY time ORDER BY time DESC LIMIT ?`;
export async function indexedCandles(db,mint,seconds,start,now,limit){
 const result=await db.prepare(CANDLE_QUERY).bind(seconds,seconds,mint,start,now,limit).all();
 return (result.results||[]).reverse().map(row=>({...row,sources:row.sources.split(',').sort()}));
}
/** @param {*} db @param {string} mint @param {{kind?:string,seconds?:number,activity?:string,now?:number,rangeSeconds?:number|null}} [options] */
export async function readNativeHistory(db,mint,{kind='candles',seconds=300,activity='unknown',now=Math.floor(Date.now()/1000),rangeSeconds=null}={}){
 if(!['candles','trades'].includes(kind))throw Error('Unsupported history request.');
 if(kind==='candles'&&!CANDLE_SECONDS.includes(seconds))throw Error('Unsupported candle period.');
 const untimedRow=await db.prepare(`SELECT count(*) AS n FROM chain_event WHERE mint=? AND kind IN ('buy','sell') AND block_time IS NULL`).bind(mint).first();
 const untimed=Number(untimedRow?.n)||0;
 if(kind==='trades'){
  const rows=await db.prepare(`SELECT record FROM chain_event WHERE mint=? AND kind IN ('buy','sell') AND block_time IS NOT NULL ORDER BY block_time DESC,slot DESC,id DESC LIMIT ?`).bind(mint,301).all();
  const parsed=records(rows);
  const recent=recentTradeRows(parsed,300);
  const coverage=await mintCoverage(db,mint,{tradeCount:recent.trades.length,truncated:rows.results.length>300,untimed,chartOnly:true,activity:recent.trades.length?'seen':activity});
  return {kind,rows:recent.trades,events:parsed,coverage,untimed,truncated:rows.results.length>300,unit:'quote'};
 }
 if(rangeSeconds!==null&&(!Number.isInteger(rangeSeconds)||rangeSeconds<1||rangeSeconds>86400))throw Error('Unsupported chart range.');
 const limit=rangeSeconds?Math.ceil(rangeSeconds/seconds)+1:CANDLE_BARS;
 const start=now-(rangeSeconds||seconds*CANDLE_BARS);
 const candles=await indexedCandles(db,mint,seconds,start,now,limit);
 const trades=candles.reduce((n,row)=>n+row.trades,0);
 const anyTrade=trades||untimed?1:(await db.prepare(`SELECT 1 AS n FROM chain_event WHERE mint=? AND kind IN ('buy','sell') LIMIT 1`).bind(mint).first())?.n||0;
 const coverage=await mintCoverage(db,mint,{tradeCount:anyTrade?Math.max(trades,1):0,untimed,chartOnly:true,activity:anyTrade?'seen':activity});
 return {kind,rows:candles,events:[],aggregated:true,coverage,untimed,truncated:false,unit:'quote',start,limit};
}
export async function indexedSummary(db,mint,now=Math.floor(Date.now()/1000)){
 const since=now-86400;
 const candles=await indexedCandles(db,mint,3600,since,now,25);
 const truncated=false;
 const volume={volume:candles.reduce((n,row)=>n+row.volume,0),trades:candles.reduce((n,row)=>n+row.trades,0)};
 const countRow=await db.prepare(`SELECT count(*) AS n FROM chain_event WHERE mint=? AND kind IN ('buy','sell')`).bind(mint).first();
 const tradeCount=Number(countRow?.n)||0;
 const coverage=await mintCoverage(db,mint,{tradeCount,truncated,untimed:0,chartOnly:true,activity:tradeCount?'seen':'unknown'});
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
