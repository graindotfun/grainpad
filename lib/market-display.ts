export type MarketStats = {price:number|null;marketCap:number|null;liquidity:number|null;volume:number|null;change:number|null};
export type Candle = {time:number;open:number;high:number;low:number;close:number;volume:number};
export type MarketTrade = {id:string;signature:string;wallet:string;time:number;side:'buy'|'sell';tokens:number;quote:number;usd:number|null};
export function finiteValue(value:unknown):number|null {
 if(!['number','string'].includes(typeof value)||(typeof value==='string'&&!value.trim()))return null;
 const n=Number(value);return Number.isFinite(n)?n:null;
}
const positive=(v:unknown)=>{const n=finiteValue(v);return n!==null&&n>=0?n:null;};
export function poolStats(attributes:Record<string,unknown>):MarketStats {
 const volume=attributes.volume_usd as Record<string,unknown>|undefined,change=attributes.price_change_percentage as Record<string,unknown>|undefined;
 return {price:positive(attributes.base_token_price_usd),marketCap:positive(attributes.market_cap_usd),liquidity:positive(attributes.reserve_in_usd),volume:positive(volume?.h24),change:finiteValue(change?.h24)};
}
export function parseCandles(body:unknown):Candle[]{
 const rows=(body as {data?:{attributes?:{ohlcv_list?:unknown}}})?.data?.attributes?.ohlcv_list;
 if(!Array.isArray(rows))throw Error('Price history is unavailable.');
 const result=new Map<number,Candle>();
 for(const r of rows){if(!Array.isArray(r)||r.length<6)continue;const n=r.slice(0,6).map(finiteValue);if(n.some(x=>x===null))continue;
 const [time,open,high,low,close,volume]=n as number[];
 if(!Number.isSafeInteger(time)||time<=0||low<=0||volume<0||high<Math.max(open,close,low)||low>Math.min(open,close))continue;
 result.set(time,{time,open,high,low,close,volume});}
 return [...result.values()].sort((a,b)=>a.time-b.time).slice(-300);
}
export function parseTrades(body:unknown,mint:string,quoteMint:string):MarketTrade[]{
 const data=(body as {data?:unknown})?.data;if(!Array.isArray(data))throw Error('Trade history is unavailable.');
 const rows:MarketTrade[]=[];const seen=new Set<string>();
 for(const row of data){const a=row?.attributes;if(!a)continue;
 const side=a.to_token_address===mint&&a.from_token_address===quoteMint?'buy':a.from_token_address===mint&&a.to_token_address===quoteMint?'sell':null;
 const tokens=positive(side==='buy'?a.to_token_amount:a.from_token_amount),quote=positive(side==='buy'?a.from_token_amount:a.to_token_amount),time=Date.parse(a.block_timestamp)/1000;
 if(!side||tokens===null||quote===null||!Number.isFinite(time)||!(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/).test(a.tx_hash)||!(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).test(a.tx_from_address)||typeof row.id!=='string'||seen.has(row.id))continue;
 seen.add(row.id);rows.push({id:row.id,signature:a.tx_hash,wallet:a.tx_from_address,time,side,tokens,quote,usd:positive(a.volume_in_usd)});}
 return rows.sort((a,b)=>b.time-a.time).slice(0,300);
}
