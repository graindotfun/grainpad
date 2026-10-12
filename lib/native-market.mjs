/** Display math only. These numbers never enter a transaction quote. */
import {displayUnits} from './token-units.mjs';

export const CANDLE_SECONDS=Object.freeze([1,5,60,300,3600,86400]);
export const CANDLE_BARS=240;
/** Bar sizes for the lifetime ("All") chart: the smallest one that fits a token's whole trading life in the bar budget. */
/** Bar sizes for the TradingView-style chart (1s 1m 5m 15m 1h 4h 1d). */
export const BAR_SECONDS=Object.freeze([1,60,300,900,3600,14400,86400]);
export const LIFETIME_STEPS=Object.freeze([60,300,900,1800,3600,7200,14400,43200,86400,259200,604800]);
export const TRADE_ROW_CAP=4000;

export function quotePerToken(baseAmount,quoteAmount,baseDecimals,quoteDecimals){
 const base=BigInt(baseAmount),quote=BigInt(quoteAmount);
 if(base<=0n||quote<=0n)return null;
 const price=Number(quote)/Number(base)*10**(baseDecimals-quoteDecimals);
 return Number.isFinite(price)&&price>0?price:null;
}
export function marketCapFromPrice(price,supply,baseDecimals){
 if(price===null)return null;
 const cap=price*Number(BigInt(supply))/10**baseDecimals;
 return Number.isFinite(cap)&&cap>=0?cap:null;
}
/** Actual quote deposited on the curve. Virtual reserves stay in the spot price, not this figure. */
export function curveLiquidityQuote(realB,quoteDecimals){
 const n=BigInt(realB);if(n<0n)return null;
 const value=Number(n)/10**quoteDecimals;
 return Number.isFinite(value)?value:null;
}
export function cpmmNetReserves(vaultA,vaultB,fees){
 const net=(vault,protocol,fund,creator)=>{
  const n=BigInt(vault)-BigInt(protocol)-BigInt(fund)-BigInt(creator);
  if(n<0n)throw Error('Pool reserves are below recorded fees.');
  return n;
 };
 return {reserveA:net(vaultA,fees.protocolA,fees.fundA,fees.creatorA),reserveB:net(vaultB,fees.protocolB,fees.fundB,fees.creatorB)};
}
/** Raydium A/B reserves are not token/quote until matched to the launch mints. */
export function cpmmDisplayStats({mintA,mintB,tokenMint,quoteMint,reserveA,reserveB,decimalsA,decimalsB,supply}){
 const tokenIsA=mintA===tokenMint,tokenIsB=mintB===tokenMint;
 if(!tokenIsA&&!tokenIsB)return {price:null,marketCap:null,liquidity:null};
 if((tokenIsA?mintB:mintA)!==quoteMint)return {price:null,marketCap:null,liquidity:null};
 const tokenReserve=tokenIsA?reserveA:reserveB,quoteReserve=tokenIsA?reserveB:reserveA;
 const tokenDecimals=tokenIsA?decimalsA:decimalsB,quoteDecimals=tokenIsA?decimalsB:decimalsA;
 const price=quotePerToken(tokenReserve,quoteReserve,tokenDecimals,quoteDecimals);
 const quoteHuman=Number(quoteReserve)/10**quoteDecimals;
 const liquidity=price!==null&&Number.isFinite(quoteHuman)&&quoteHuman>=0?quoteHuman*2:null;
 const marketCap=supply===null||supply===undefined?null:marketCapFromPrice(price,supply,tokenDecimals);
 return {price,marketCap,liquidity:liquidity!==null&&Number.isFinite(liquidity)?liquidity:null};
}
export function readUint64LE(data,offset){
 if(!data||data.length<offset+8)return null;
 return data.readBigUInt64LE(offset);
}
export function splTokenAmount(data){return readUint64LE(data,64);}
export function mintSupplyAmount(data){return readUint64LE(data,36);}

function execution(event){
 if(!event||!['buy','sell'].includes(event.kind)||!Number.isSafeInteger(event.blockTime))return null;
 const tokens=Number(displayUnits(event.baseAmount,event.baseDecimals)),quote=Number(displayUnits(event.quoteAmount,event.quoteDecimals));
 if(!Number.isFinite(tokens)||!Number.isFinite(quote)||tokens<=0||quote<=0)return null;
 return {price:quote/tokens,quote,tokens};
}
/** Dedupe by event id, sort by time, and leave empty periods empty. */
export function normalizeTrades(events){
 const byId=new Map();let untimed=0,duplicate=0;
 for(const event of events||[]){
  if(!event||!['buy','sell'].includes(event.kind))continue;
  if(byId.has(event.id)){duplicate++;continue;}
  if(!Number.isSafeInteger(event.blockTime)){untimed++;byId.set(event.id,{...event,untimed:true});continue;}
  byId.set(event.id,event);
 }
 const rows=[...byId.values()].filter(event=>!event.untimed).sort((a,b)=>a.blockTime-b.blockTime||a.slot-b.slot||String(a.id).localeCompare(String(b.id)));
 return {rows,untimed,duplicate};
}
export function buildCandles(events,seconds,{limit=CANDLE_BARS}={}){
 if(!CANDLE_SECONDS.includes(seconds)&&!LIFETIME_STEPS.includes(seconds)&&!BAR_SECONDS.includes(seconds))throw Error('Unsupported candle period.');
 if(!Number.isInteger(limit)||limit<1)throw Error('Invalid candle limit.');
 const {rows,untimed,duplicate}=normalizeTrades(events);
 const buckets=new Map();
 for(const event of rows){
  const price=execution(event);if(!price)continue;
  const time=Math.floor(event.blockTime/seconds)*seconds,existing=buckets.get(time),source=event.source==='cpmm'?'cpmm':'curve';
  if(existing){existing.high=Math.max(existing.high,price.price);existing.low=Math.min(existing.low,price.price);existing.close=price.price;existing.volume+=price.quote;existing.trades++;existing.sources.add(source);existing.lastTime=event.blockTime;existing.lastSlot=event.slot;existing.lastId=event.id;}
  else buckets.set(time,{time,open:price.price,high:price.price,low:price.price,close:price.price,volume:price.quote,trades:1,sources:new Set([source]),firstTime:event.blockTime,lastTime:event.blockTime,firstSlot:event.slot,lastSlot:event.slot,firstId:event.id,lastId:event.id});
 }
 let candles=[...buckets.values()].sort((a,b)=>a.time-b.time);
 const truncated=candles.length>limit;
 if(truncated)candles=candles.slice(-limit);
 return {candles:candles.map(candle=>({...candle,sources:[...candle.sources].sort()})),untimed,duplicate,truncated,trades:rows.length};
}
/** Append confirmed executions to full indexed bars without replacing history with a short catch-up. */
export function mergeCandleHistory(indexed,events,seconds,{start=0,limit=CANDLE_BARS}={}){
 const extra=buildCandles((events||[]).filter(event=>event.blockTime>=start),seconds,{limit}).candles;
 const byTime=new Map(indexed.map(row=>[row.time,{...row}]));
 const before=(a,b,prefix)=>a[prefix+'Time']-b[prefix+'Time']||a[prefix+'Slot']-b[prefix+'Slot']||String(a[prefix+'Id']).localeCompare(String(b[prefix+'Id']));
 for(const row of extra){
  const current=byTime.get(row.time);
  if(!current){byTime.set(row.time,row);continue;}
  const first=before(current,row,'first')<=0?current:row,last=before(current,row,'last')>=0?current:row;
  byTime.set(row.time,{...current,open:first.open,close:last.close,high:Math.max(current.high,row.high),low:Math.min(current.low,row.low),volume:current.volume+row.volume,trades:current.trades+row.trades,
   firstTime:first.firstTime,firstSlot:first.firstSlot,firstId:first.firstId,lastTime:last.lastTime,lastSlot:last.lastSlot,lastId:last.lastId,sources:[...new Set([...current.sources,...row.sources])].sort()});
 }
 return [...byTime.values()].sort((a,b)=>a.time-b.time).slice(-limit);
}
export function recentTradeRows(events,limit=300){
 const {rows,untimed,duplicate}=normalizeTrades(events);
 const trades=[];
 for(const event of [...rows].reverse()){
  const price=execution(event);if(!price)continue;
  trades.push({id:event.id,signature:event.signature,wallet:event.wallet,time:event.blockTime,side:event.kind,tokens:price.tokens,quote:price.quote,usd:null,source:event.source==='cpmm'?'cpmm':'curve',provisional:Boolean(event.provisional)});
  if(trades.length>=limit)break;
 }
 return {trades,untimed,duplicate,truncated:rows.length>trades.length};
}
export function quoteVolume(events,since){
 const {rows,untimed}=normalizeTrades(events);
 let volume=0,trades=0,first=null,last=null;
 for(const event of rows){
  if(event.blockTime<since)continue;
  const price=execution(event);if(!price)continue;
  volume+=price.quote;trades++;first??=price.price;last=price.price;
 }
 return {volume,trades,first,last,untimed,coveredFrom:rows.find(event=>event.blockTime>=since)?.blockTime??null};
}
export function tradeCoverage({streams=[],pending=0,quarantined=0,tradeCount=0,truncated=false,untimed=0,activity='unknown'}={}){
 const watched=(streams||[]).filter(stream=>stream&&(stream.kind==='curve'||stream.kind==='cpmm'));
 const historyOpen=watched.some(stream=>Number(stream.history_done)!==1);
 const gaps=!watched.length||historyOpen||pending>0||quarantined>0||truncated||untimed>0;
 let status;
 if(tradeCount>0)status=gaps?'partial':'indexed';
 else if(activity==='seen')status='partial';
 else if(activity==='none')status='no-trades';
 else status=gaps?'not-indexed':'no-trades';
 const notice={
  indexed:'Finalized trades indexed by grainpad. Empty periods are not filled in.',
  partial:tradeCount>0?'Indexed history is incomplete. Trades that are missing are not shown as zero.':'On-chain activity is visible, but those trades are not in the grainpad index yet. This is not a report of zero trades.',
  'no-trades':activity==='none'?'No trades yet. The launch account shows creation only.':'No finalized trades are indexed, and this token’s indexed history is complete.',
  'not-indexed':'Trade history is not indexed yet. That is not the same as no trades.',
 }[status];
 return {status,notice,historyOpen,pending,quarantined,untimed,truncated,streams:watched.length};
}
export function deriveUsd(quoteAmount,quoteUsd){
 if(!quoteUsd||quoteUsd.freshness==='expired'||typeof quoteUsd.price!=='number'||!Number.isFinite(quoteUsd.price)||quoteUsd.price<=0)return null;
 if(typeof quoteAmount!=='number'||!Number.isFinite(quoteAmount)||quoteAmount<0)return null;
 const usd=quoteAmount*quoteUsd.price;
 return Number.isFinite(usd)?usd:null;
}
export function composeNative(snapshot,indexed,quoteUsd){
 const priceQuote=snapshot?.quoteStats?.price??null,marketCapQuote=snapshot?.quoteStats?.marketCap??null,liquidityQuote=snapshot?.liquidity?.quote??null;
 const volumeCoverage=indexed?.volumeCoverage||'unavailable';
 return {
  priceQuote,marketCapQuote,liquidityQuote,liquidityKind:snapshot?.liquidity?.kind??null,
  volume24hQuote:indexed?.volume24hQuote??null,volumeCoverage,
  change24h:indexed?.change24h??null,changeCoverage:indexed?.changeCoverage||'unavailable',
  priceUsd:deriveUsd(priceQuote,quoteUsd),marketCapUsd:deriveUsd(marketCapQuote,quoteUsd),liquidityUsd:deriveUsd(liquidityQuote,quoteUsd),
  volume24hUsd:volumeCoverage==='indexed'?deriveUsd(indexed?.volume24hQuote,quoteUsd):null,
  usd:quoteUsd?{symbol:quoteUsd.symbol,price:quoteUsd.price,source:quoteUsd.source,updatedAt:quoteUsd.updatedAt,freshness:quoteUsd.freshness,note:quoteUsd.note}:null,
  source:'grainpad',
 };
}
export const LIFECYCLES=Object.freeze(['curve_live','curve_complete','migration_pending','raydium_live','migration_failed','unavailable']);
const NOT_REGISTERED=/not a registered Grainpad launch/i;

export class MarketReadError extends Error{
 /** @param {'not_registered'|'unavailable'} status @param {string} message @param {object|null} [identity] */
 constructor(status,message,identity=null){
  super(message);
  this.name='MarketReadError';
  this.status=status;
  this.identity=identity;
 }
}

/** Decimal text with no exponent, so a formatter can count leading zeros itself. */
export function plainDecimal(value){
 if(typeof value!=='number'||!Number.isFinite(value))return null;
 if(value===0)return '0';
 const sign=value<0?'-':'';
 const [coeff,exp]=Math.abs(value).toExponential(14).split('e');
 const exponent=Number(exp);
 const digits=coeff.replace('.','').replace(/0+$/,'')||'0';
 let text;
 if(exponent>=0)text=exponent>=digits.length-1?digits+'0'.repeat(exponent-(digits.length-1)):`${digits.slice(0,exponent+1)}.${digits.slice(exponent+1)}`;
 else text=`0.${'0'.repeat(-exponent-1)}${digits}`;
 return sign+text.replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
}

/** Machine-readable pool lifecycle. No keeper notes or support text.
 * @param {{route?: string, raised?: string, target?: string, migrationFailed?: boolean}} [input]
 */
export function lifecycleState({route,raised,target,migrationFailed=false}={}){
 if(migrationFailed)return 'migration_failed';
 if(route==='cpmm')return 'raydium_live';
 if(route==='graduating')return 'migration_pending';
 if(route==='curve'){
  if(typeof raised==='string'&&typeof target==='string'&&/^\d+$/.test(raised)&&/^\d+$/.test(target)&&BigInt(target)>0n&&BigInt(raised)>=BigInt(target))return 'curve_complete';
  return 'curve_live';
 }
 return 'unavailable';
}

export function marketFailure(error){
 if(error instanceof MarketReadError)return {status:error.status,identity:error.identity||null,error:error.message};
 const message=error instanceof Error?error.message:'';
 if(NOT_REGISTERED.test(message))return {status:'not_registered',identity:null,error:'This mint is not a registered grainpad launch.'};
 return {status:'unavailable',identity:null,error:'Market data is temporarily unavailable.'};
}

export function nativeTapeQuote(record,snapshot,quoteUsd,checkedAt){
 const native=snapshot?.native,quote=native?.priceQuote??snapshot?.quoteStats?.price??null,cap=native?.marketCapQuote??snapshot?.quoteStats?.marketCap??null;
 const usd=quoteUsd&&quoteUsd.freshness!=='expired'?quoteUsd:null;
 const priceUsd=deriveUsd(quote,usd),marketCapUsd=deriveUsd(cap,usd);
 return {priceUsd,marketCapUsd,change24h:native?.changeCoverage==='24h'?native.change24h??null:null,pairAddress:null,fetchedAt:priceUsd===null&&marketCapUsd===null?null:checkedAt,quote:record.quoteAsset||snapshot?.quote?.symbol||'SOL',source:priceUsd===null&&marketCapUsd===null?'pending':'grainpad'};
}
