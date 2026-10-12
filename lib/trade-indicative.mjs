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
export {startIndicativeQuote} from './trade-indicative-polling.mjs';
