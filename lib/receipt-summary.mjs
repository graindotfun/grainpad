/** Read-only calculations over finalized chain_event records. No price or balance inference. */
/** @param {number|null|undefined} seconds */
export function receiptElapsed(seconds){
 if(seconds==null||!Number.isFinite(seconds)||seconds<0)return 'Timing unknown';
 if(seconds<60)return `${Number(seconds.toFixed(1))}s`;
 if(seconds<3600)return `${Math.floor(seconds/60)}m ${Math.floor(seconds%60)}s`;
 return `${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m`;
}
/** @param {{launch:any,events:any[],creator:string,partial?:boolean,truncated?:boolean}} input */
export function receiptSummary({launch,events,creator,partial=true,truncated=false}){
 const finalized=[...new Map(events.filter(e=>!e.provisional).map(e=>[e.id,e])).values()].sort((a,b)=>a.slot-b.slot||a.id.localeCompare(b.id));
 const start=Number.isFinite(launch?.blockTime)?launch.blockTime:null;
 const offset=e=>start!==null&&Number.isFinite(e.blockTime)&&e.blockTime>=start?e.blockTime-start:null;
 const buys=finalized.filter(e=>e.kind==='buy');
 const opening=new Map();
 for(const e of buys){const t=offset(e);if(t!==null&&t<=60&&!opening.has(e.wallet))opening.set(e.wallet,e);}
 const byWallet=new Map();
 for(const e of finalized){if(!['buy','sell'].includes(e.kind))continue;if(!byWallet.has(e.wallet))byWallet.set(e.wallet,[]);byWallet.get(e.wallet).push(e);}
 const rows=[...opening.values()].map(b=>{
  const trades=(byWallet.get(b.wallet)||[]).filter(e=>e.slot>=b.slot);
  let balance=0n,hadSell=false,unknown=truncated,exit=null;const evidence=[];
  // Group by slot: IDs do not establish execution order inside a slot.
  const slots=new Map();for(const e of trades){if(!slots.has(e.slot))slots.set(e.slot,[]);slots.get(e.slot).push(e);}
  for(const group of slots.values()){
   let sold=0n;
   for(const e of group){if(!/^\d+$/.test(e.baseAmount||'')){unknown=true;continue;}const amount=BigInt(e.baseAmount);if(e.kind==='buy')balance+=amount;else{sold+=amount;hadSell=true;}evidence.push(e);}
   balance-=sold;
   if(balance<0n)unknown=true;
   if(balance===0n&&sold>0n&&!unknown&&exit===null){const times=group.map(offset);if(times.every(t=>t!==null))exit=Math.max(...times);}
  }
  if(unknown)exit=null;
  const status=unknown?'Holding status unknown · indexed amounts incomplete':exit!==null?`Sold all indexed buys within ${receiptElapsed(exit)} of launch${balance>0n?" · bought again later":""}`:hadSell&&balance===0n?'Sold all indexed buys · exit timing unknown':hadSell?'Partially sold in the indexed history':partial||unknown?'Holding status unknown · no indexed sale':'Still holding (indexed trades only)';
  return {...b,afterLaunch:offset(b),creator:b.wallet===creator,status,exitSeconds:exit,evidence};
 });
 const creatorBuys=buys.filter(e=>e.wallet===creator),creatorBuy=creatorBuys[0]||null;
 const timingMissing=buys.some(e=>!Number.isFinite(e.blockTime));
 const timed=rows.map(r=>r.afterLaunch),sold=rows.filter(r=>r.exitSeconds!==null);
 const scope=partial?' in the indexed history':'';
 const lines=[{text:start===null?'Minute-one timing unknown: the finalized launch block time is not indexed.':truncated?'Minute-one totals unknown: the receipt read limit was reached.':timingMissing?'Minute-one totals unknown: some indexed buys have no block time.':rows.length?`${rows.length} wallets bought within the first ${receiptElapsed(Math.max(...timed))}${scope}.`:'No minute-one buy found in the indexed history.',evidence:rows.map(r=>r),kind:'opening'},
 {text:sold.length?`${sold.length} of them had sold all their indexed buys within ${receiptElapsed(Math.max(...sold.map(r=>r.exitSeconds)))} of launch${scope}.`:partial||truncated?'Exit timing unknown: no complete sale of the indexed buys is established in this partial history.':'No opening wallet sold all its indexed buys.',evidence:sold.flatMap(r=>r.evidence),kind:'exits'},
 {text:creatorBuy?`The creator’s first observed buy${scope}: ${offset(creatorBuy)===null?'time after launch unknown':receiptElapsed(offset(creatorBuy))+' after launch'}.`:'No creator buy found in the indexed history.',evidence:creatorBuy?[creatorBuy]:[],kind:'creator'}];
 return {lines,opening:rows,creatorBuy,creatorBuys,partial,truncated,launch};
}
