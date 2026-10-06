/** Display-only market-cap series: current supply and current USD conversion, never historical FX. */
import {deriveUsd} from './native-market.mjs';
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
/** @param {{time:number,close:number}[]} rows
 * @param {{metric?:string,nativePrice?:number|null,nativeMarketCap?:number|null,quoteUsd?:{price:number,freshness:string}|null,usdSeries?:boolean}} options */
export function marketMetricSeries(rows,{metric='price',nativePrice=null,nativeMarketCap=null,quoteUsd=null,usdSeries=false}={}){
 const supply=positive(nativePrice)&&positive(nativeMarketCap)?nativeMarketCap/nativePrice:null;
 const available=positive(supply);
 const usdRate=deriveUsd(1,quoteUsd);
 const estimatedUsd=metric==='market-cap'&&!usdSeries&&positive(usdRate);
 const multiplier=metric==='market-cap'?(available?supply*(estimatedUsd?usdRate:1):null):1;
 const points=multiplier===null?[]:rows.map(row=>({time:row.time,value:row.close*multiplier})).filter(point=>Number.isFinite(point.time)&&positive(point.value));
 return {points,available,estimatedUsd,usd:usdSeries||estimatedUsd,multiplier,supply};
}
