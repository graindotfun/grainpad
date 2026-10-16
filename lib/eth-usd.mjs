/** Display conversion only. Existing shared quote-price budget; never an input to a trade. */
import {sharedMarketCache,takeBudget} from './shared-market-cache.mjs';
import {quoteFreshness} from './quote-freshness.mjs';
export function parseEthUsd(body){const price=Number(body?.data?.amount);if(body?.data?.base!=='ETH'||body?.data?.currency!=='USD'||!Number.isFinite(price)||price<=0)throw Error('ETH display conversion unavailable.');return price;}
export async function loadEthUsd(db){
 const result=await sharedMarketCache(db,'quote-eth-usd:v1',async()=>{
  if(!await takeBudget(db,'quote-usd',1,6,60000))throw Error('Quote conversion is busy.');
  const response=await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot',{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('ETH display conversion unavailable.');
  const reader=response.body?.getReader();if(!reader)throw Error('ETH display conversion unavailable.');let bytes=0,text='';const decoder=new TextDecoder();try{for(;;){const row=await reader.read();if(row.done)break;bytes+=row.value.byteLength;if(bytes>16384)throw Error('ETH conversion response exceeds bound.');text+=decoder.decode(row.value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();reader.releaseLock();}
  return {price:parseEthUsd(JSON.parse(text)),source:'coinbase-eth-usd',symbol:'WETH',note:'WETH display estimate using the current ETH/USD conversion, not historical USD prices.'};
 },{ttl:60000,maxStale:600000});
 return {...result.data,updatedAt:result.updatedAt,freshness:quoteFreshness(result.updatedAt)};
}
