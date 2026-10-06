/** Visible-page recovery of finalized chart trades only. The normal queue retains fee/claim work.
 * No queue reset, financial rollup, signing, or chain submission occurs here. */
import {parseChainEvents,parseChartTradeEvents,saveEvents} from './chain-events.mjs';
import {chartFeeReceiptGap} from './chart-trade-decoder.mjs';
import {readChartFeeProof} from './chart-fee-proof.mjs';
import {assertIndexerTransactionSchema} from './indexer-transaction-schema.mjs';
import {sharedMarketCache,takeBudget} from './shared-market-cache.mjs';
/** @param {*} db @param {*} rpc @param {*} record @param {*} cpConfig @param {{limit?:number,clock?:()=>number,recentPool?:string|null}} [options] */
export async function backfillChartTrades(db,rpc,record,cpConfig,{limit=20,clock=Date.now,recentPool=null}={}){
 const start=clock(),mint=record.mint;
 if(!mint||record.verification!=='confirmed-on-chain'||!record.platformId)throw Error('Verified launch required.');
 return sharedMarketCache(db,`chart-backfill:v2:${mint}:${recentPool?'recent':'queued'}`,async()=>{
  let recentSignatures=[],tailOpen=false;
  const unresolved=async(signatures=recentSignatures)=>{
   if(!signatures.length)return [];
   const rows=await db.prepare(`SELECT j.value AS signature FROM json_each(?) j WHERE j.value NOT IN(SELECT signature FROM chain_event WHERE mint=? AND kind IN ('buy','sell'))
    AND NOT EXISTS(SELECT 1 FROM market_cache c WHERE c.key=('chart-tx:v2:'||?||':'||j.value) AND c.value IS NOT NULL AND c.expires_at>?)`).bind(JSON.stringify(signatures),mint,mint,clock()).all();
   return rows.results||[];
  };
  if(recentPool){
   if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(recentPool))throw Error('Verified recent pool required.');
   const discoveryKey=`chart-recent:v2:${mint}:${recentPool}`;
   const discovery=(await sharedMarketCache(db,discoveryKey,async()=>{
    const previous=await db.prepare('SELECT value FROM market_cache WHERE key=?').bind(discoveryKey).first();
    const prior=previous?.value?JSON.parse(previous.value):null;
    const latest=await db.prepare(`SELECT signature FROM chain_event WHERE mint=? AND kind IN ('buy','sell') ORDER BY block_time DESC,slot DESC,id DESC LIMIT 1`).bind(mint).first();
    let anchor=prior?.anchor??latest?.signature??null,before=prior?.before??null,open=prior?.tailOpen??true;
    const pending=await unresolved(prior?.signatures||[]);
    const head=await rpc('getSignaturesForAddress',[recentPool,{limit:32,commitment:'finalized'}]);
    if(!Array.isArray(head))throw Error('Recent pool signatures unavailable.');
    if(prior&&!open&&head.length===32&&!head.some(row=>row.signature===prior.head)){anchor=latest?.signature??null;before=null;open=true;}
    let page=head;
    if(open&&before&&pending.length<128){page=await rpc('getSignaturesForAddress',[recentPool,{limit:32,commitment:'finalized',before}]);if(!Array.isArray(page))throw Error('Recent pool cursor unavailable.');}
    if(open&&pending.length<128){
     if(page.length<32||page.some(row=>row.signature===anchor)||page.at(-1)?.blockTime<Math.floor(clock()/1000)-86400)open=false;
     before=open?page.at(-1)?.signature??null:null;
    }
    let signatures=[...new Set([...head,...page].filter(row=>!row.err&&typeof row.signature==='string').map(row=>row.signature).concat(pending.map(row=>row.signature)))];
    if(signatures.length>256){signatures=signatures.slice(0,256);open=true;before=head.at(-1)?.signature??before;}
    return {signatures,anchor,before,tailOpen:open,head:head[0]?.signature??null};
   },{ttl:15000,maxStale:30000,now:clock})).data;
   recentSignatures=discovery.signatures;tailOpen=discovery.tailOpen;

  }
  const selected=await db.prepare(`SELECT q.signature FROM indexer_queue q JOIN indexer_stream s ON s.address=q.source
   WHERE s.mint=? AND q.status='pending' AND q.signature NOT IN(SELECT signature FROM chain_event WHERE mint=? AND kind IN ('buy','sell'))
   AND NOT EXISTS(SELECT 1 FROM market_cache c WHERE c.key=('chart-tx:v2:'||s.mint||':'||q.signature) AND c.expires_at>?)
   ORDER BY q.signature LIMIT ?`).bind(mint,mint,clock(),limit).all();
  let processed=0,trades=0,next=0,feeProof;
  const candidates=[...new Map([...(await unresolved()),...(selected.results||[])].map(row=>[row.signature,row])).values()].slice(0,limit);
  const worker=async()=>{while(next<candidates.length){
   if(clock()-start>=8000)break;
   const row=candidates[next++];
   if(!await takeBudget(db,'chart-recovery-minute',1,120,60000,clock()))break;
   try{
    const result=await sharedMarketCache(db,`chart-tx:v2:${mint}:${row.signature}`,async()=>{
     const tx=await rpc('getTransaction',[row.signature,{encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:1}]);
     if(!tx)throw Error('Finalized transaction unavailable.');
     assertIndexerTransactionSchema(tx,row.signature);
     let events=[];
     if(!tx.meta?.err){
      try{events=parseChainEvents(tx,row.signature,[record],cpConfig,record.platformId);}
      catch(error){if(!chartFeeReceiptGap(error))throw error;
       feeProof??=readChartFeeProof(rpc,mint,clock(),tx.slot);let proof=await feeProof;
       if(tx.slot<proof.firstSlot||tx.slot>proof.lastSlot){feeProof=readChartFeeProof(rpc,mint,clock(),tx.slot);proof=await feeProof;}
       events=parseChartTradeEvents(tx,row.signature,[record],cpConfig,proof,record.platformId);
      }
     }
     events=events.filter(event=>event.mint===mint&&['buy','sell'].includes(event.kind));
     await saveEvents(db,events);return {trades:events.length};
    },{ttl:86400000,maxStale:86400000,now:clock});
    processed++;trades+=result.data.trades;
   }catch{/* A provider/parser gap remains pending for the existing full indexer. */}
  }
  };await Promise.all(Array.from({length:Math.min(4,candidates.length)},worker));
  const remaining=await db.prepare(`SELECT count(*) AS n FROM indexer_queue q JOIN indexer_stream s ON s.address=q.source
   WHERE s.mint=? AND q.status='pending' AND q.signature NOT IN(SELECT signature FROM chain_event WHERE mint=? AND kind IN ('buy','sell'))
   AND NOT EXISTS(SELECT 1 FROM market_cache c WHERE c.key=('chart-tx:v2:'||s.mint||':'||q.signature) AND c.value IS NOT NULL AND c.expires_at>?)`).bind(mint,mint,clock()).first();
  return {processed,trades,remaining:(Number(remaining?.n)||0)+(await unresolved()).filter(row=>!(selected.results||[]).some(queued=>queued.signature===row.signature)).length,tailOpen};
 },{ttl:2000,maxStale:30000,now:clock});
}
