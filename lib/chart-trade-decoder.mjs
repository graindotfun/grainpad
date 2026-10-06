import {parseChainEvents,parseChartTradeEvents} from './chain-events.mjs';
import {readChartFeeProof} from './chart-fee-proof.mjs';
export function chartFeeReceiptGap(error){return ['Ambiguous Token-2022 recipient activity; net amount not inferred.','Token-2022 recipient balance receipt unavailable.'].includes(error?.message);}
/** Exact transfer-fee arithmetic is display-only and only available for a verified current epoch. */
export async function decodeChartTrades(rpc,tx,signature,record,cpConfig){
 let events;
 try{events=parseChainEvents(tx,signature,[record],cpConfig,record.platformId);}
 catch(error){
  if(!chartFeeReceiptGap(error))throw error;
  const proof=await readChartFeeProof(rpc,record.mint);events=parseChartTradeEvents(tx,signature,[record],cpConfig,proof,record.platformId);
 }
 return events.filter(event=>event.mint===record.mint&&['buy','sell'].includes(event.kind));
}
