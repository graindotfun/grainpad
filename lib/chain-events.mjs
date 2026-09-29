import {Buffer} from 'buffer';
import bs58 from 'bs58';
import {PublicKey} from '@solana/web3.js';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import {cpmmId} from './market-core.mjs';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const CURVE=sdk.LAUNCHPAD_PROGRAM.toBase58(),CPMM=sdk.CREATE_CPMM_POOL_PROGRAM.toBase58();
const curveSides=new Map([['faea0d7bd59c13ec','buy'],['18d3742869039938','buy'],['9527de9bd37c981a','sell'],['5fc8472208090ba6','sell']]);
const cpSwaps=new Set(['8fbe5adac41e33de','37d96256a34ab4ad']);
export function eventContexts(tx){
 if(!tx?.meta||tx.meta.err||!Number.isSafeInteger(tx.slot))return [];
 const msg=tx.transaction?.message;if(!msg)throw Error('Missing finalized message.');
 const keys=[...msg.accountKeys,...(tx.meta.loadedAddresses?.writable||[]),...(tx.meta.loadedAddresses?.readonly||[])];
 const groups=new Map((tx.meta.innerInstructions||[]).map(g=>[g.index,g.instructions]));
 const decode=(ix)=>({...ix,program:keys[ix.programIdIndex],keys:(ix.accounts||[]).map(i=>keys[i]),bytes:Buffer.from(bs58.decode(ix.data||''))});
 const contexts=[];
 for(const [index,raw] of msg.instructions.entries()){
  const inner=groups.get(index)||[];contexts.push({...decode(raw),position:String(index),children:inner.map(decode)});
  inner.forEach((ix,j)=>{const stack=ix.stackHeight;let end=j+1;while(end<inner.length&&stack&&inner[end].stackHeight>stack)end++;
   contexts.push({...decode(ix),position:`${index}.${j}`,children:stack?inner.slice(j+1,end).map(decode):[],missingStack:!stack});});
 }
 return contexts;
}
function transfers(context){
 if(context.missingStack)throw Error('CPI stack information unavailable; amounts not inferred.');
 return context.children.filter(ix=>ix.program===TOKEN).flatMap(ix=>{
  const d=ix.bytes;if(d[0]===3&&d.length===9)return [{from:ix.keys[0],to:ix.keys[1],amount:d.readBigUInt64LE(1)}];
  if(d[0]===12&&d.length===10)return [{from:ix.keys[0],to:ix.keys[2],amount:d.readBigUInt64LE(1)}];return [];
 });
}
const sum=(rows,predicate)=>rows.filter(predicate).reduce((n,row)=>n+row.amount,0n);
/** Exact SPL transfer amounts, never estimates from declared inputs or net wallet lamports. */
export function parseChainEvents(tx,signature,records,cpConfig,expectedPlatform=records[0]?.platformId){
 const pools=new Map(),creators=new Map();
 for(const row of records){pools.set(row.pool,{row,source:'curve'});pools.set(cpmmId(new PublicKey(row.mint),new PublicKey(cpConfig),new PublicKey(row.quoteMint)).toBase58(),{row,source:'cpmm'});
  creators.set(`${row.creator}:${row.quoteMint}`,row);}
 const result=[];
 const emit=(context,event)=>result.push({id:`${signature}:${context.position}:${event.kind}:${event.quoteMint||''}`,signature,slot:tx.slot,blockTime:tx.blockTime??null,...event});
 for(const ix of eventContexts(tx)){
  const d=ix.bytes.subarray(0,8).toString('hex');let market,side,userBase,userQuote;
  if(ix.program===CURVE&&curveSides.has(d)){market=pools.get(ix.keys[4]);if(!market){if(ix.keys[3]===expectedPlatform)throw Error('Launch registration must be indexed before its trade.');continue;}if(market.source!=='curve')continue;
   if(ix.keys[3]!==market.row.platformId||ix.keys[9]!==market.row.mint||ix.keys[10]!==market.row.quoteMint)throw Error('Curve event identity mismatch.');
   side=curveSides.get(d);userBase=ix.keys[5];userQuote=ix.keys[6];
  }else if(ix.program===CPMM&&cpSwaps.has(d)){market=pools.get(ix.keys[3]);if(!market||market.source!=='cpmm')continue;
   if(ix.keys[2]!==cpConfig||![ix.keys[10],ix.keys[11]].includes(market.row.mint)||![ix.keys[10],ix.keys[11]].includes(market.row.quoteMint))throw Error('CPMM event identity mismatch.');
   side=ix.keys[11]===market.row.mint?'buy':'sell';userBase=ix.keys[side==='buy'?5:4];userQuote=ix.keys[side==='buy'?4:5];
  }
  if(market){
   const {row,source}=market,t=transfers(ix),baseVault=source==='curve'?ix.keys[7]:ix.keys[side==='buy'?7:6],quoteVault=source==='curve'?ix.keys[8]:ix.keys[side==='buy'?6:7];
   const creatorVault=sdk.getPdaCreatorVault(sdk.LAUNCHPAD_PROGRAM,new PublicKey(row.creator),new PublicKey(row.quoteMint)).publicKey.toBase58();
   const platformVault=sdk.getPdaPlatformVault(sdk.LAUNCHPAD_PROGRAM,new PublicKey(row.platformId),new PublicKey(row.quoteMint)).publicKey.toBase58();
   const base=sum(t,r=>side==='buy'?r.from===baseVault&&r.to===userBase:r.from===userBase&&r.to===baseVault);
   const quote=sum(t,r=>side==='buy'?r.from===userQuote&&[quoteVault,...(source==='curve'?[creatorVault,platformVault]:[])].includes(r.to):r.to===userQuote&&r.from===quoteVault);
   if(base<=0n||quote<=0n)throw Error('Trade transfers unavailable; amounts not inferred.');
   emit(ix,{kind:side,source,mint:row.mint,wallet:ix.keys[0],quoteMint:row.quoteMint,baseAmount:base.toString(),quoteAmount:quote.toString(),baseDecimals:6,quoteDecimals:row.quoteDecimals,quoteSymbol:row.quoteAsset});
   if(source==='curve'){const accrued=sum(t,r=>r.to===creatorVault&&[quoteVault,userQuote].includes(r.from));if(accrued>0n)emit(ix,{kind:'fee-accrued',source,mint:row.mint,wallet:row.creator,quoteMint:row.quoteMint,quoteAmount:accrued.toString(),quoteDecimals:row.quoteDecimals,quoteSymbol:row.quoteAsset});}
  }
  if(ix.program===CURVE&&d==='1a618acb84ab8dfc'){
   const row=creators.get(`${ix.keys[0]}:${ix.keys[4]}`);if(!row)continue;
   const vault=sdk.getPdaCreatorVault(sdk.LAUNCHPAD_PROGRAM,new PublicKey(row.creator),new PublicKey(row.quoteMint)).publicKey.toBase58();if(ix.keys[2]!==vault)throw Error('Creator vault mismatch.');
   const amount=sum(transfers(ix),t=>t.from===vault&&t.to===ix.keys[3]);if(amount>0n)emit(ix,{kind:'fee-claimed',source:'curve',mint:null,wallet:row.creator,quoteMint:row.quoteMint,quoteAmount:amount.toString(),quoteDecimals:row.quoteDecimals,quoteSymbol:row.quoteAsset});
  }
  if(ix.program===CPMM&&['1416567bc61cdb84','caca2253e27a91e5'].includes(d)){
   const permissionless=d==='caca2253e27a91e5',creator=ix.keys[permissionless?1:0];
   const found=pools.get(ix.keys[permissionless?3:2]);if(!found||found.source!=='cpmm'||found.row.creator!==creator||ix.keys[permissionless?14:3]!==cpConfig)continue;
   const t=transfers(ix);for(const i of [0,1]){const amount=sum(t,r=>r.from===ix.keys[4+i]&&r.to===ix.keys[8+i]);if(amount>0n)emit(ix,{kind:'fee-claimed',source:'cpmm',mint:found.row.mint,wallet:creator,quoteMint:ix.keys[6+i],quoteAmount:amount.toString(),quoteDecimals:ix.keys[6+i]===found.row.mint?6:found.row.quoteDecimals,quoteSymbol:ix.keys[6+i]===found.row.mint?found.row.symbol:found.row.quoteAsset});}
  }
  if(ix.program===sdk.LOCK_CPMM_PROGRAM.toBase58()&&d==='081e33c7d1b8f785'){
   const found=pools.get(ix.keys[6]);if(!found||found.source!=='cpmm')continue;const t=transfers(ix);
   for(const i of [0,1]){const amount=sum(t,r=>r.from===ix.keys[10+i]&&r.to===ix.keys[8+i]);if(amount>0n)emit(ix,{kind:'fee-claimed',source:'lp',mint:found.row.mint,wallet:ix.keys[1],quoteMint:ix.keys[12+i],quoteAmount:amount.toString(),quoteDecimals:ix.keys[12+i]===found.row.mint?6:found.row.quoteDecimals,quoteSymbol:ix.keys[12+i]===found.row.mint?found.row.symbol:found.row.quoteAsset});}
  }
 }
 return result;
}
export async function saveEvents(db,events){
 if(!events.length)return;
 await db.batch(events.map(e=>db.prepare('INSERT INTO chain_event(id,signature,slot,block_time,kind,source,mint,wallet,quote_mint,base_amount,quote_amount,record) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(e.id,e.signature,e.slot,e.blockTime,e.kind,e.source,e.mint??null,e.wallet,e.quoteMint??null,e.baseAmount??null,e.quoteAmount??null,JSON.stringify(e))));
}
