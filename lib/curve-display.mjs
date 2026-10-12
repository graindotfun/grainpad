/** Display-only spot price. These floating-point values must never enter a transaction quote. */
export function curveDisplayStats(pool,baseDecimals,quoteDecimals){
 const a=BigInt(pool.virtualA.toString())-BigInt(pool.realA.toString()),b=BigInt(pool.virtualB.toString())+BigInt(pool.realB.toString()),supply=BigInt(pool.supply.toString());
 if(a<=0n||b<=0n||supply<=0n)return {price:null,marketCap:null};
 const price=Number(b)/Number(a)*10**(baseDecimals-quoteDecimals),marketCap=price*Number(supply)/10**baseDecimals;
 return {price:Number.isFinite(price)?price:null,marketCap:Number.isFinite(marketCap)?marketCap:null};
}
