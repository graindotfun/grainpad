/** Visible-page recovery of finalized chart trades only. The normal queue retains fee/claim work.
 * No queue reset, financial rollup, signing, or chain submission occurs here. */
import {parseChainEvents,saveEvents} from './chain-events.mjs';
import {assertIndexerTransactionSchema} from './indexer-transaction-schema.mjs';
import {sharedMarketCache,takeBudget} from './shared-market-cache.mjs';
export async function backfillChartTrades(db,rpc,record,cpConfig,{limit=20,clock=Date.now}={}){
 const start=clock(),mint=record.mint;
 if(!mint||record.verification!=='confirmed-on-chain'||!record.platformId)throw Error('Verified launch required.');
 return sharedMarketCache(db,`chart-backfill:v1:${mint}`,async()=>{
  const selected=await db.prepare(`SELECT q.signature FROM indexer_queue q JOIN indexer_stream s ON s.address=q.source
   WHERE s.mint=? AND q.status='pending' AND q.signature NOT IN(SELECT signature FROM chain_event WHERE mint=? AND kind IN ('buy','sell'))
   AND NOT EXISTS(SELECT 1 FROM market_cache c WHERE c.key=('chart-tx:v1:'||q.signature) AND c.expires_at>?)
   ORDER BY q.signature LIMIT ?`).bind(mint,mint,clock(),limit).all();
  let processed=0,trades=0;
  for(const row of selected.results||[]){
   if(clock()-start>=8000||!await takeBudget(db,'chart-recovery-minute',1,120,60000,clock()))break;
   try{
    const result=await sharedMarketCache(db,`chart-tx:v1:${row.signature}`,async()=>{
     const tx=await rpc('getTransaction',[row.signature,{encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:1}]);
     if(!tx)throw Error('Finalized transaction unavailable.');
     assertIndexerTransactionSchema(tx,row.signature);
     const events=tx.meta?.err?[]:parseChainEvents(tx,row.signature,[record],cpConfig,record.platformId).filter(event=>event.mint===mint&&['buy','sell'].includes(event.kind));
     await saveEvents(db,events);return {trades:events.length};
    },{ttl:86400000,maxStale:86400000,now:clock});
    processed++;trades+=result.data.trades;
   }catch{/* A provider/parser gap remains pending for the existing full indexer. */}
  }
  const remaining=await db.prepare(`SELECT count(*) AS n FROM indexer_queue q JOIN indexer_stream s ON s.address=q.source
   WHERE s.mint=? AND q.status='pending' AND q.signature NOT IN(SELECT signature FROM chain_event WHERE mint=? AND kind IN ('buy','sell'))
   AND NOT EXISTS(SELECT 1 FROM market_cache c WHERE c.key=('chart-tx:v1:'||q.signature) AND c.expires_at>?)`).bind(mint,mint,clock()).first();
  return {processed,trades,remaining:Number(remaining?.n)||0};
 },{ttl:2000,maxStale:30000,now:clock});
}
