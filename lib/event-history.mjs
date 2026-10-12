import {displayUnits} from './token-units.mjs';
import {buildCandles} from './native-market.mjs';
/** @param {{before?:string|null,limit?:number}} options */
export async function eventHistory(db,mint,options={}){
 const {before=null,limit=100}=options;
 if(!Number.isInteger(limit)||limit<1||limit>300)throw Error('Invalid event limit.');
 let after=null;if(before){after=await db.prepare('SELECT slot,id FROM chain_event WHERE id=? AND mint=?').bind(before,mint).first();if(!after)throw Error('Invalid tape cursor.');}
 const rows=await db.prepare(`SELECT record FROM chain_event WHERE mint=?${after?' AND (slot<? OR (slot=? AND id<?))':''} ORDER BY slot DESC,id DESC LIMIT ?`).bind(mint,...(after?[after.slot,after.slot,after.id]:[]),limit+1).all();
 const events=rows.results.slice(0,limit).map(r=>JSON.parse(r.record));
 return {events,nextCursor:rows.results.length>limit?events.at(-1).id:null,coverage:'Finalized transactions observed by the indexer; gaps and within-slot ordering may remain.'};
}
export function quoteCandles(events,seconds=300){
 return buildCandles(events,seconds,{limit:100000}).candles.map(({time,open,high,low,close,volume,trades})=>({time,open,high,low,close,volume,trades}));
}
export function feeSummary(events){
 const values=new Map();for(const e of events){if(!['fee-accrued','fee-claimed'].includes(e.kind))continue;const key=e.source+':'+e.quoteMint;const row=values.get(key)||{source:e.source,asset:e.quoteMint,symbol:e.quoteSymbol,decimals:e.quoteDecimals,earned:null,claimed:null,transactions:0};const kind=e.kind==='fee-accrued'?'earned':'claimed';row[kind]=(BigInt(row[kind]||'0')+BigInt(e.quoteAmount)).toString();row.transactions++;values.set(key,row);}
 return [...values.values()].map(r=>({...r,earned:r.earned===null?null:displayUnits(r.earned,r.decimals),claimed:r.claimed===null?null:displayUnits(r.claimed,r.decimals)}));
}
/** Single leased writer; exact decimal-string totals, atomically committed with event checkpoints. */
export async function rollupFees(db,owner,limit=100){
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('Invalid fee batch size.');
 const pending=await db.prepare("SELECT id,record FROM chain_event WHERE accounted=0 AND kind IN ('fee-accrued','fee-claimed') ORDER BY slot,id LIMIT ?").bind(limit).all();if(!pending.results.length)return 0;
 const groups=new Map();for(const saved of pending.results){const e=JSON.parse(saved.record),key=JSON.stringify([e.wallet,e.source,e.quoteMint]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
 // One indexed lookup and one bulk upsert keep a large fee batch within the
 // Worker's D1 query budget; per-wallet round trips used to exhaust that budget.
 const previous=await db.prepare(`SELECT f.* FROM fee_total f JOIN json_each(?) j ON f.wallet=json_extract(j.value,'$[0]') AND f.source=json_extract(j.value,'$[1]') AND f.asset=json_extract(j.value,'$[2]')`).bind(JSON.stringify([...groups.keys()].map(key=>JSON.parse(key)))).all();
 const oldByKey=new Map(previous.results.map(row=>[JSON.stringify([row.wallet,row.source,row.asset]),row]));
 const totals=[];for(const [key,events] of groups){
  const e=events[0],old=oldByKey.get(key);
  const total={earned:old?.earned??null,claimed:old?.claimed??null,events:old?.events||0};
  for(const event of events){const field=event.kind==='fee-accrued'?'earned':'claimed';total[field]=(BigInt(total[field]||'0')+BigInt(event.quoteAmount)).toString();total.events++;}
  totals.push([e.wallet,e.source,e.quoteMint,e.quoteSymbol,e.quoteDecimals,total.earned,total.claimed,total.events]);
 }
 const now=Date.now();
 const writes=[db.prepare(`INSERT INTO fee_total(wallet,source,asset,symbol,decimals,earned,claimed,events)
 SELECT json_extract(j.value,'$[0]'),json_extract(j.value,'$[1]'),json_extract(j.value,'$[2]'),json_extract(j.value,'$[3]'),json_extract(j.value,'$[4]'),json_extract(j.value,'$[5]'),json_extract(j.value,'$[6]'),json_extract(j.value,'$[7]')
 FROM json_each(?) j WHERE EXISTS(SELECT 1 FROM indexer_lease WHERE id=1 AND owner=? AND until_ms>?)
 ON CONFLICT(wallet,source,asset) DO UPDATE SET earned=excluded.earned,claimed=excluded.claimed,events=excluded.events`).bind(JSON.stringify(totals),owner,now)];
 writes.push(db.prepare('UPDATE chain_event SET accounted=1 WHERE id IN (SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM indexer_lease WHERE id=1 AND owner=? AND until_ms>?)').bind(JSON.stringify(pending.results.map(r=>r.id)),owner,now));
 const result=await db.batch(writes);return result.at(-1).meta.changes;
}
export async function creatorFeeTotals(db,wallet){
 const rows=await db.prepare('SELECT * FROM fee_total WHERE wallet=? ORDER BY source,asset').bind(wallet).all();return rows.results.map(r=>({...r,earned:r.earned===null?null:displayUnits(r.earned,r.decimals),claimed:r.claimed===null?null:displayUnits(r.claimed,r.decimals)}));
}
