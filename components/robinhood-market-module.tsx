'use client';
import {useCallback,useEffect,useState} from 'react';
import {GRAIN_ORANGE} from '@/lib/brand-colors.mjs';
import {ArrowLeftRight} from 'lucide-react';
import {ProChart} from './pro-chart';
import {formatPrice,formatUsd,formatUnits} from '@/lib/price-format';
import type {MainnetLaunchRecord} from '@/lib/chain/robinhood-mainnet-registration.ts';
import {quoteFreshness} from '@/lib/quote-freshness.mjs';
type Snapshot={networkId:string;tokenAddress:string;factory:string;priceQuote:number;marketCapQuote:number;supply:number;realQuote:string;block:string;continuous:boolean;graduated:boolean;coverage:{status:string;notice:string};usd:{price:number;updatedAt:number;source:string;freshness:string}|null};
export function RobinhoodMarketModule({record}:{record:MainnetLaunchRecord}){
 const [market,setMarket]=useState<Snapshot|null>(null),[metric,setMetric]=useState<'price'|'market-cap'>('market-cap'),[style,setStyle]=useState<'line'|'candles'>('line'),[observation,setObservation]=useState<{updatedAt:number;stale:boolean}|null>(null);
 const observe=useCallback((value:unknown,updatedAt:number,stale:boolean)=>{const next=value as Snapshot;if(next?.networkId!=='robinhood:mainnet'||next.tokenAddress!==record.tokenAddress||next.factory!==record.factory||![next.priceQuote,next.marketCapQuote,next.supply].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0))throw Error('Chart identity or market cap unavailable.');setMarket(next);setObservation({updatedAt,stale});},[record.tokenAddress,record.factory]);
 const [now,setNow]=useState(()=>Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const delayed=observation&&(observation.stale||now-observation.updatedAt>300000);
 const usd=market?.usd&&quoteFreshness(market.usd.updatedAt)!=='expired'&&Number.isFinite(market.usd.price)&&market.usd.price>0?market.usd.price:null;
 const value=market?(metric==='market-cap'?market.marketCapQuote:market.priceQuote):null;
 const primary=value===null?'—':usd===null?formatPrice(value,'WETH'):formatUsd(value*usd);
 return <section className="panel corner-panel market-module" aria-labelledby="market-heading">
  <div className="corner-head"><span className="corner-label">grainpad native · Robinhood Chain · {metric==='market-cap'?'market cap':'price'}</span><span className="corner-label is-right">on-chain · WETH</span></div>
  <div className="market-headline"><div><h2 id="market-heading" className="sr-only">market</h2><p className="market-price"><button type="button" className="market-metric-toggle" aria-pressed={metric==='market-cap'} aria-label={`Switch to ${metric==='market-cap'?'price':'market cap'}`} onClick={()=>setMetric(metric==='market-cap'?'price':'market-cap')}><ArrowLeftRight size={16}/><span>{metric==='market-cap'?'Market cap':'Price'}</span></button><strong>{primary}</strong></p><p className="small muted">{market?.continuous||market?.graduated?'Uniswap v3 · WETH pair':'Robinhood Chain · WETH bonding curve'}{delayed?' · delayed snapshot':''}</p></div></div>
  <p className="market-metric-note">Execution-price market-cap history uses current supply{usd!==null?' and the current ETH/USD conversion, not historical USD prices':''}.</p>
  <dl className="market-stats"><div className="market-stat"><dt>Market cap</dt><dd>{market?usd!==null?formatUsd(market.marketCapQuote*usd):formatPrice(market.marketCapQuote,'WETH'):'—'}</dd></div><div className="market-stat"><dt>{market?.continuous||market?.graduated?'Pool WETH':'Curve reserve'}</dt><dd>{market?formatUnits(market.realQuote,18):'—'}</dd></div><div className="market-stat"><dt>24h volume</dt><dd>—</dd></div><div className="market-stat"><dt>Pair</dt><dd>WETH</dd></div></dl>
  <div className="market-chart-toolbar"><div className="segmented" role="group" aria-label="Chart style"><button type="button" aria-pressed={style==='line'} onClick={()=>setStyle('line')}>Line</button><button type="button" aria-pressed={style==='candles'} onClick={()=>setStyle('candles')}>Candles</button></div></div>
  <ProChart network="robinhood" mint={record.tokenAddress} symbol={record.symbol} style={style} metric={metric} setMetric={setMetric} quote="WETH" supply={market?.supply??null} usdRate={usd} colors={{up:GRAIN_ORANGE,down:'#6f6f6f',hollow:true}} live={[]} onMarket={observe}/>
  <div className="market-foot"><span>{market?.coverage.notice??'Reading finalized on-chain executions from the curve and pool.'}{observation?.updatedAt?` · Observed ${new Date(observation.updatedAt).toLocaleString()}`:''}{market?.block?` · block ${BigInt(market.block).toString()}`:''}</span></div>
 </section>;
}
