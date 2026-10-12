import {QUOTES} from './quote-assets.mjs';
import {displayUnits} from './token-units.mjs';
/** Presentation only: a recorded declaration never establishes that a purchase executed. */
export function creatorBuyDisplay(declaration){
 if(declaration==null)return {text:'Not declared',declared:false};
 const amount=declaration.amount;
 if(typeof amount==='string'&&/^\d+(?:\.\d+)?$/.test(amount))return {text:`${amount}${typeof declaration.asset==='string'?` ${declaration.asset}`:''}`,declared:true};
 if(amount&&typeof amount==='object'&&Object.hasOwn(QUOTES,amount.quote)&&typeof amount.amountIn==='string'&&/^\d{1,20}$/.test(amount.amountIn)&&BigInt(amount.amountIn)<=((1n<<64n)-1n))return {text:`${displayUnits(amount.amountIn,QUOTES[amount.quote].decimals)} ${amount.quote}`,declared:true};
 return {text:'Amount not specified',declared:true};
}
