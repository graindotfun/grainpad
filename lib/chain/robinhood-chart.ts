/** Display-only finalized execution prices. Never feed this snapshot into wallet quotes. */
import {address,bytes32,readTradeRange,type Rpc} from './robinhood-market.ts';
import {readRobinhoodChartIdentity,type RobinhoodHistoryMarket} from './robinhood-chart-identity.ts';
import {readMainnetPoolRange,type StoredTrade,storeTrade} from './robinhood-mainnet-history.ts';
import {describeMainnetReceipt,type MainnetLaunchRecord} from './robinhood-mainnet-registration.ts';
import type {RobinhoodRecordStore} from './robinhood-registration.ts';
const quantity=(v:unknown)=>{if(typeof v!=='string'||!/^0x[0-9a-f]+$/i.test(v))throw Error('Invalid chart block.');return BigInt(v);};
const positive=(v:number)=>Number.isFinite(v)&&v>0;
export type RobinhoodChartTrade=StoredTrade&{blockTime:number};
export function robinhoodChartBars(trades:RobinhoodChartTrade[],seconds:number){
 if(![1,60,300,900,3600,14400,86400].includes(seconds))throw Error('Unsupported chart bars.');
 const rows=new Map<number,{time:number;open:number;high:number;low:number;close:number;volume:number;trades:number}>();
 const sorted=[...new Map(trades.map(t=>[t.transactionHash+':'+t.logIndex,t])).values()].sort((a,b)=>a.blockTime-b.blockTime||Number(BigInt(a.blockNumber)-BigInt(b.blockNumber))||Number(BigInt(a.logIndex)-BigInt(b.logIndex)));
 for(const t of sorted){const input=Number(BigInt(t.amountIn)),output=Number(BigInt(t.amountOut));const price=t.side==='buy'?input/output:output/input,quote=(t.side==='buy'?input:output)/1e18;if(!Number.isSafeInteger(t.blockTime)||t.blockTime<=0||!positive(price)||!positive(quote))continue;
  const time=Math.floor(t.blockTime/seconds)*seconds,old=rows.get(time);if(old){old.high=Math.max(old.high,price);old.low=Math.min(old.low,price);old.close=price;old.volume+=quote;old.trades++;}else rows.set(time,{time,open:price,high:price,low:price,close:price,volume:quote,trades:1});
 }
 return [...rows.values()];
}
async function receiptTrades(rpc:Rpc,market:RobinhoodHistoryMarket,hash:string,finalized:bigint,receipt?:unknown){
 const r=(receipt??await rpc('eth_getTransactionReceipt',[hash])) as {transactionHash?:string;status?:string;blockNumber?:string;blockHash?:string;logs?:Array<{address?:string;transactionHash?:string;blockNumber?:string;blockHash?:string;removed?:boolean;topics?:string[]}>};
 if(r?.transactionHash?.toLowerCase()!==hash||r.status!=='0x1'||!Array.isArray(r.logs))throw Error('Chart transaction receipt unavailable.');
 const number=quantity(r.blockNumber);if(number>finalized)throw Error('Chart transaction is not finalized.');
 const block=await rpc('eth_getBlockByNumber',[r.blockNumber,false]) as {hash?:string;timestamp?:string};if(bytes32(block?.hash)!==bytes32(r.blockHash))throw Error('Chart transaction was reorganized.');
 const time=Number(quantity(block.timestamp));if(!Number.isSafeInteger(time)||time<=0||time*1000>Date.now()+10000)throw Error('Invalid chart time.');
 const logs=r.logs.filter(l=>!l.removed&&l.transactionHash?.toLowerCase()===hash&&l.blockNumber===r.blockNumber&&l.blockHash===r.blockHash);
 let trades:StoredTrade[]=[];
 if(!market.continuous){const curveLogs=logs.filter(l=>l.address?.toLowerCase()===market.curve&&['0x1425213da0cb1c09c9763adf9297d47fa65b00e4d96bc5e98fcfd4f9b9750255','0x383b92a01a6edee565344b5d38a1984c424aab65c628d06f13e2fcc68ba5ba35'].includes(l.topics?.[0]??''));trades=(await readTradeRange(async()=>curveLogs,market,number,number)).map(storeTrade);}
 if(market.pool){const poolLogs=logs.filter(l=>l.address?.toLowerCase()===market.pool&&l.topics?.[0]==='0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67');trades.push(...await readMainnetPoolRange(async()=>poolLogs,market,number,number));}
 return trades.map(t=>({...t,blockTime:time}));
}
export type RobinhoodChartCursor={generation:string;nextBlock:string;block:string;blockHash:string};
export async function readRobinhoodChart(storage:RobinhoodRecordStore,rpc:Rpc,record:MainnetLaunchRecord,options:{previous?:RobinhoodChartCursor|null;knownTransaction?:(generation:string,hash:string)=>Promise<boolean>}={}){
 void storage;const identity=await readRobinhoodChartIdentity(rpc,record),{market}=identity,last=identity.finalized;
 const receipt=await rpc('eth_getTransactionReceipt',[record.transactionHash]);const creation=describeMainnetReceipt(receipt,record.factory,record.transactionHash);
 if(creation.tokenAddress!==record.tokenAddress||creation.launchId!==record.launchId||creation.creator!==record.creator)throw Error('Chart launch differs.');
 const first=quantity((receipt as {blockNumber?:string}).blockNumber);
 let generation=options.previous?.generation??crypto.randomUUID(),cursor=options.previous?BigInt(options.previous.nextBlock):first;
 if(options.previous){const anchor=await rpc('eth_getBlockByNumber',[options.previous.block,false]) as {hash?:string};if(bytes32(anchor?.hash)!==options.previous.blockHash){generation=crypto.randomUUID();cursor=first;}}
 if(cursor<first||cursor>last+1n)throw Error('Chart cursor unavailable.');
 let trades=await receiptTrades(rpc,market,record.transactionHash,last,receipt),notice='Finalized executions are being indexed from launch through the current block.';
 // Reserve page-tail and final canonical checks within the shared 48-read refresh budget.
 let receipts=0;
 try{
  // Advance contiguously. Never skip a busy page, a provider failure or an unverified receipt.
  for(let page=0;page<3&&cursor<=last;page++){
   const end=cursor+999n<last?cursor+999n:last,hex='0x'+end.toString(16);
   const before=await rpc('eth_getBlockByNumber',[hex,false]) as {hash?:string};const endHash=bytes32(before?.hash);
   const events:StoredTrade[]=[],pageTrades:RobinhoodChartTrade[]=[];
   if(!market.continuous)events.push(...(await readTradeRange(rpc,market,cursor,end)).map(storeTrade));
   if(market.pool)events.push(...await readMainnetPoolRange(rpc,market,cursor,end));
   let complete=true;
   for(const hash of [...new Set(events.map(t=>t.transactionHash))]){
    if(hash===record.transactionHash||await options.knownTransaction?.(generation,hash))continue;
    if(receipts>=5){complete=false;break;}receipts++;
    const verified=await receiptTrades(rpc,market,hash,last);
    for(const event of events.filter(e=>e.transactionHash===hash))if(!verified.some(v=>v.logIndex===event.logIndex&&v.blockNumber===event.blockNumber&&v.side===event.side&&v.amountIn===event.amountIn&&v.amountOut===event.amountOut))throw Error('Chart log differs from its canonical receipt.');
    pageTrades.push(...verified);
   }
   const after=await rpc('eth_getBlockByNumber',[hex,false]) as {hash?:string};if(bytes32(after?.hash)!==endHash)throw Error('Chart history changed during indexing.');
   trades.push(...pageTrades);if(!complete)break;cursor=end+1n;
  }
 }catch{notice='Verified history is partial. Indexing paused at the last checked block and will resume without inventing missing trades.';}
 const finalAnchor=await rpc('eth_getBlockByNumber',[market.block,false]) as {hash?:string};if(bytes32(finalAnchor?.hash)!==identity.blockHash)throw Error('Chart snapshot was reorganized.');
 const priceQuote=identity.priceQuote,supply=Number(identity.supply)/1e18;if(!positive(priceQuote)||!positive(supply)||!positive(priceQuote*supply))throw Error('Chart market cap unavailable.');
 trades=[...new Map(trades.map(t=>[t.transactionHash+':'+t.logIndex,t])).values()];
 const complete=cursor>last;
 return {networkId:'robinhood:mainnet' as const,tokenAddress:record.tokenAddress,factory:record.factory,launchId:record.launchId,pool:market.pool,block:market.block,blockHash:identity.blockHash,generation,nextBlock:cursor.toString(),continuous:!!market.continuous,graduated:identity.graduated,priceQuote,marketCapQuote:priceQuote*supply,supply,realQuote:identity.realQuote.toString(),trades,coverage:{status:complete?'indexed':'partial',notice:complete?'Finalized curve and pool executions indexed through block '+last.toString()+'. Empty periods are not invented.':notice},updatedAt:Date.now()};
}
