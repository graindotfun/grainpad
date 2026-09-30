/** Indicative estimates carry no transaction, wallet identity or signing capability. */
import {PublicKey} from '@solana/web3.js';
import {swapInstruction} from './market-core.mjs';
import {parseTokenUnits} from './quote-assets.mjs';
export function quoteIndicativeTrade(market,mint,side,text,slippage){
 if(!['buy','sell'].includes(side))throw Error('Choose Buy or Sell.');
 if(!/^\d+(\.\d{1,2})?$/.test(slippage))throw Error('Enter slippage between 0 and 20%.');
 const amount=parseTokenUnits(text,side==='buy'?market.quote.decimals:6);
 const q=swapInstruction(market,PublicKey.default,mint,side,amount,Math.round(Number(slippage)*100));
 const updatedAt=Date.now();
 return {output:String(q.output),minimum:String(q.minimum),transferTaxBps:q.transferTaxBps,updatedAt,expiresAt:updatedAt+15_000};
}
/** Cancelling also suppresses an already running read's result and error. */
export function startIndicativeQuote({read,publish,delayMs=350,lifetimeMs=15_000}){
 const controller=new AbortController();let expiry;
 publish({status:'loading',quote:null,error:''});
 const timer=setTimeout(async()=>{
  try{const quote=await read(controller.signal);if(controller.signal.aborted)return;
   if(!Number.isSafeInteger(quote?.expiresAt)||quote.expiresAt<=Date.now()){publish({status:'expired',quote:null,error:'Estimate expired. Edit the amount to refresh.'});return;}
   publish({status:'ready',quote,error:''});
   expiry=setTimeout(()=>{if(!controller.signal.aborted)publish({status:'expired',quote:null,error:'Estimate expired. Edit the amount to refresh.'});},Math.max(0,Math.min(lifetimeMs,quote.expiresAt-Date.now())));
  }catch(error){if(!controller.signal.aborted)publish({status:'unavailable',quote:null,error:error instanceof Error?error.message:'Estimate unavailable.'});}
 },delayMs);
 return ()=>{controller.abort();clearTimeout(timer);clearTimeout(expiry);};
}
