import {PublicKey} from '@solana/web3.js';
import {swapInstruction} from './market-core.mjs';
import {parseTokenUnits} from './quote-assets.mjs';

/** One market read, three independent sale sizes. Never aggregates sales or signs. */
export function exitScenarios(market,mint,creator,amountText,slippageText){
 if(market.route==='graduating')throw Error('Migration is pending. No executable market is available yet.');
 if(!/^(0|[1-9]\d?)(\.\d{1,2})?$/.test(slippageText)||Number(slippageText)>20)throw Error('Slippage must be between 0 and 20%.');
 const amount=parseTokenUnits(amountText,6),slippageBps=Math.round(Number(slippageText)*100);
 const p=market.cpData,baseIsA=p?.mintA.equals(new PublicKey(mint));
 const numerator=market.route==='curve'?BigInt(market.pool.virtualB.add(market.pool.realB).toString()):BigInt((baseIsA?p.quoteReserve:p.baseReserve).toString());
 const denominator=market.route==='curve'?BigInt(market.pool.virtualA.sub(market.pool.realA).toString()):BigInt((baseIsA?p.baseReserve:p.quoteReserve).toString());
 if(numerator<=0n||denominator<=0n)throw Error('Market liquidity is unavailable.');
 const scenarios=[25,50,100].map(percent=>{
  const input=amount*BigInt(percent)/100n;if(input===0n)return {percent,error:'This fraction is below one token unit.'};
  try{
   if(market.route==='curve'&&input>BigInt(market.pool.realA.toString()))throw Error('This amount exceeds the tokens currently sold by the curve.');
   const q=swapInstruction(market,new PublicKey(creator),new PublicKey(mint),'sell',input,slippageBps);
   const fees=Object.entries(q.fees||{}).filter(([key])=>key!=='shareFee').map(([source,value])=>({source,amount:String(value),asset:q.feeAssets?.[source]||'quote'}));
   const baseFee=fees.filter(f=>f.asset==='base').reduce((n,f)=>n+BigInt(f.amount),0n),quoteFee=fees.filter(f=>f.asset==='quote').reduce((n,f)=>n+BigInt(f.amount),0n);
   const theoretical=input*numerator/denominator,ideal=(input-baseFee)*numerator/denominator,gross=q.output+quoteFee;
   const impact=ideal>0n?Math.max(0,Number((ideal-gross)*10000n/ideal)):null;
   return {percent,input:input.toString(),spotValue:theoretical.toString(),output:q.output.toString(),minimum:q.minimum.toString(),priceImpactBps:impact,fees};
  }catch(e){return {percent,error:e instanceof Error?e.message:'This sale size could not be quoted.'};}
 });
 return {scenarios,quote:market.quote,route:market.route,pool:market.poolId.toBase58(),slippageBps,amount:amount.toString()};
}
