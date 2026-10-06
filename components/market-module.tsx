'use client';
import {useEffect,useMemo,useState} from 'react';
import {useLiveMarket} from './use-live-market';
import {LiveMarketChart} from './live-market-chart';
import {chartHistoryPoints} from '@/lib/live-chart.mjs';
import {Area,AreaChart,CartesianGrid,ReferenceDot,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {marketMetricSeries} from '@/lib/market-metric.mjs';
import {ArrowUpRight,ArrowLeftRight} from 'lucide-react';
import {startViewerPolling} from '@/lib/viewer-polling.mjs';
import {formatNumber,formatPercent,formatPrice,formatUnits,formatUsd,relativeTime} from '@/lib/price-format';
import type {MarketView} from '@/lib/server-market';
import type {Candle} from '@/lib/market-display';
export type MarketSource='grainpad'|'usd';
export type SeriesPoint={time:number;value:number|null};
export const INTERVALS:[string,number][]=[['Live',0],['1m',60],['5m',300],['1h',3600],['1d',86400]];
/** /api/market/[mint]/history (PR #39 contract). `source`/`unit` say which series this is: Grainpad's indexed quote
 * candles by default, GeckoTerminal USD only as the labeled fallback for launches the index has not seen. */
export type Coverage={status:'indexed'|'partial'|'not-indexed'|'no-trades'|'external-fallback'|string;notice:string};
type History={rows:Candle[];available:boolean;stale:boolean;updatedAt?:number;pool:string;source?:string;unit?:string;quote?:string;coverage?:Coverage};
function useHistory(market:MarketView|null,mint:string,interval:string,external:boolean){
 const key=`${mint}:${market?.pool}:${interval}:${external}`,[state,setState]=useState<{key:string;data?:History;error?:string}>({key:''});
 useEffect(()=>{
  if(!market)return;
  return startViewerPolling(async(signal:AbortSignal)=>{
   try{const r=await fetch(`/api/market/${encodeURIComponent(mint)}/history?kind=candles&interval=${interval==='1d'?'5m&range=1d':interval}${external?'&source=external':''}`,{signal,cache:'no-store',headers:{'X-Grainpad-Viewer':'visible'}});
    const body=await r.json() as History&{error?:string};if(!r.ok)throw Error(body.error||'Price history unavailable.');
    if(body.pool!==market.pool)throw Error('Pool changed. Refreshing market…');
    setState({key,data:body});
   }catch(e){if(!signal.aborted)setState(previous=>({key,data:previous.key===key?previous.data:undefined,error:e instanceof Error?e.message:'Price history unavailable.'}));}
  },{intervalMs:15_000});
 },[key,mint,interval,external,market?.pool,!!market]);// eslint-disable-line react-hooks/exhaustive-deps -- market identity is the pool; other fields refresh every poll.
 const current:{data?:History;error?:string}=state.key===key?state:{};
 return current;
}
const isUsd=(h?:History)=>(h?.unit??'quote')==='usd';
const tickTime=(seconds:number)=>new Date(seconds*1000).toLocaleString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false});
/** The one chart spec for every source: right axis, mono ticks, dashed horizontal grid, orange line, marked last point. */
export function GrainChart({points,interval,unit,label,live=false}:{points:SeriesPoint[];interval:number;unit:'usd'|string;label:string;live?:boolean}){
 const [reducedMotion,setReducedMotion]=useState(true);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReducedMotion(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 const animate=live&&!reducedMotion;
 const last=points.filter(point=>point.value!==null).at(-1),tick=(v:number)=>unit==='usd'?formatNumber(v,{sig:3,prefix:'$'}):formatNumber(v,{sig:3});
 const width=Math.min(84,Math.max(44,Math.max(...points.map(p=>tick(p.value??0).length))*7+10));
 return <div className="grain-chart" role="img" aria-label={`${label}${interval===86400?' · past 24 hours':''}. Last ${last?formatPrice(last.value,unit==='usd'?'USD':unit):'unavailable'}.`}>
  <ResponsiveContainer width="100%" height="100%" minWidth={0}><AreaChart data={points} margin={{top:14,right:0,bottom:0,left:0}}>
   <defs><linearGradient id="grain-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--xmr-orange)" stopOpacity={.16}/><stop offset="100%" stopColor="var(--xmr-orange)" stopOpacity={0}/></linearGradient></defs>
   <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="2 4"/>
   <XAxis type="number" dataKey="time" domain={['dataMin','dataMax']} tickFormatter={v=>tickTime(v)} minTickGap={56} tickMargin={8} axisLine={false} tickLine={false} tick={{fill:'var(--chart-tick)',fontSize:10.5,fontFamily:'var(--font-code)'}}/>
   <YAxis orientation="right" dataKey="value" domain={['auto','auto']} tickCount={5} tickFormatter={tick} width={width} tickMargin={6} axisLine={false} tickLine={false} tick={{fill:'var(--chart-tick)',fontSize:10.5,fontFamily:'var(--font-code)'}}/>
   <Tooltip cursor={{stroke:'var(--chart-tick)',strokeDasharray:'2 3'}} isAnimationActive={false} content={({active,payload})=>{const p=payload?.[0]?.payload as SeriesPoint|undefined;return active&&p?<div className="grain-tooltip"><strong>{formatPrice(p.value,unit==='usd'?'USD':unit)}</strong><span>{new Date(p.time*1000).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div>:null;}}/>
   <Area type="linear" dataKey="value" stroke="var(--xmr-orange)" strokeWidth={2} fill="url(#grain-chart-fill)" isAnimationActive={animate} animationDuration={450} animationEasing="ease-out" dot={false} activeDot={{r:3.5,fill:'var(--xmr-orange)',stroke:'var(--chart-surface)',strokeWidth:2}}/>
   {last&&last.value!==null&&<ReferenceDot x={last.time} y={last.value} shape={({cx,cy}:{cx?:number;cy?:number})=><g className="market-live-tip" style={{transform:`translate(${cx??0}px, ${cy??0}px)`}}>{animate&&<circle className="market-live-ring" r={5} fill="none" stroke="var(--xmr-orange)" strokeWidth={1.5}/>}<circle r={4.5} fill="var(--xmr-orange)" stroke="var(--chart-surface)" strokeWidth={2.5}/></g>}/>}
  </AreaChart></ResponsiveContainer>
 </div>;
}
function Stat({label,value,note}:{label:string;value:string;note?:string}){return <div className="market-stat"><dt>{label}</dt><dd>{value}{note&&<small>{note}</small>}</dd></div>;}
const COVERAGE_LABEL:Record<string,string>={indexed:'indexed',partial:'partial index','not-indexed':'not indexed yet','no-trades':'no trades yet','external-fallback':'external fallback'};
type Props={market:MarketView|null;mint:string;quoteSymbol?:string;error?:string;seconds:number;setSeconds:(n:number)=>void};
/** One market module. Grainpad's native figures and indexed candles are the default; an external USD pool series is a
 * toggle only when a pool index has it (market.chart.available), and the index's own GeckoTerminal fallback is labeled. */
export function MarketModule({market,mint,quoteSymbol,error,seconds,setSeconds}:Props){
 const usdAvailable=!!market?.chart.available,[choice,setChoice]=useState<MarketSource>('grainpad'),[metric,setMetric]=useState<'price'|'market-cap'>('price');
 const source:MarketSource=choice==='usd'&&usdAvailable?'usd':'grainpad';
 const feed=useLiveMarket(mint,market?.pool),liveView=seconds===0;
 const interval=INTERVALS.find(([,s])=>s===seconds)?.[0]||'5m',history=useHistory(market,mint,liveView?'1m':interval,source==='usd');
 const [now,setNow]=useState(()=>Date.now());useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),15_000);return()=>clearInterval(id);},[]);
 const q=market?.quote,unit=q?.symbol||quoteSymbol||'—',n=market?.native,graduated=market?.route==='cpmm';
 const rows=history.data?.rows||[],usdSeries=isUsd(history.data);
 const metricOptions={nativePrice:n?.priceQuote??market?.quoteStats?.price??null,nativeMarketCap:n?.marketCapQuote??market?.quoteStats?.marketCap??null,quoteUsd:n?.usd??null,usdSeries:usdSeries||source==='usd'};
 const canMarketCap=marketMetricSeries([],{...metricOptions,metric:'market-cap'}).available,activeMetric=canMarketCap?metric:'price';
 const display=useMemo(()=>marketMetricSeries(rows,{nativePrice:metricOptions.nativePrice,nativeMarketCap:metricOptions.nativeMarketCap,quoteUsd:n?.usd??null,usdSeries:usdSeries||source==='usd',metric:activeMetric}),[rows,metricOptions.nativePrice,metricOptions.nativeMarketCap,n?.usd,usdSeries,source,activeMetric]),seriesUnit=display.usd?'usd':unit;
 const points=useMemo(()=>chartHistoryPoints(rows,display.multiplier??1,{partial:history.data?.coverage?.status==='partial',seconds:seconds===86400?300:seconds||60}),[rows,display.multiplier,history.data?.coverage?.status,seconds]);
 const liveEvents=useMemo(()=>feed.events.map(row=>({...row})),[feed.events]);
 const coverage=history.data?.coverage;
 const priceQuote=n?.priceQuote??market?.quoteStats?.price??null;
 const price=source==='usd'?market?.stats?.price??null:usdSeries?rows.at(-1)?.close??null:priceQuote;
 const liveValue=liveView?liveEvents.at(-1)?.value:null;
 const headlineValue=liveValue!=null?liveValue*(display.multiplier??1):activeMetric==='market-cap'?(price!=null&&display.multiplier!=null?price*display.multiplier:points.at(-1)?.value):price??points.at(-1)?.value;
 const headline=activeMetric==='market-cap'&&display.usd?`${display.estimatedUsd?'≈ ':''}${formatUsd(headlineValue)}`:formatPrice(headlineValue,seriesUnit);
 const metricLabel=activeMetric==='market-cap'?'Market cap':'Price';
 const change=source==='usd'?market?.stats?.change??null:n?.changeCoverage==='24h'?n.change24h:null;
 const usdNote=(value:number|null|undefined)=>value!=null&&n?.usd&&n.usd.freshness!=='expired'?`≈ ${formatUsd(value,3)}`:undefined;
 const delayedMs=market?.stale?now-market.updatedAt:history.data?.stale&&history.data.updatedAt?now-history.data.updatedAt:0,stale=delayedMs>0;
 const live=feed.connected&&!feed.gap&&now-feed.lastMessage<30_000;
 const raised=market?.progress&&q?formatUnits(market.progress.raised,q.decimals,3):null,target=market?.progress&&q?formatUnits(market.progress.target,q.decimals,3):null;
 const pct=market?.progress&&Number(market.progress.target)>0?Math.min(100,Math.max(0,Number(market.progress.raised)/Number(market.progress.target)*100)):null;
 const liquidity=n?.liquidityQuote??null,volume=n?.volumeCoverage==='unavailable'?null:n?.volume24hQuote??null;
 const statItems:[string,string,string?][]=source==='usd'?[
  ['Market cap',formatUsd(market?.stats?.marketCap)],['Liquidity',formatUsd(market?.stats?.liquidity)],['24h volume',formatUsd(market?.stats?.volume)],['Pair',unit],
 ]:[
  ['Market cap',formatPrice(n?.marketCapQuote??market?.quoteStats?.marketCap,unit,3),usdNote(n?.marketCapUsd)],
  [n?.liquidityKind==='cpmm-reserves-at-spot'||graduated?'Pool liquidity':'Curve reserve',liquidity!=null?formatPrice(liquidity,unit,3):raised?`${raised} ${unit}`:'—',usdNote(n?.liquidityUsd)],
  ['24h volume',volume!=null?formatPrice(volume,unit,3):'—',n?.volumeCoverage==='partial'?'partial':volume!=null?'indexed':undefined],
  ['Pair',unit],
 ];
 const emptyTitle=error?'Market unavailable':!market?'Reading the pool…':history.error&&!history.data?'Price history unavailable':!history.data?'Reading the index…':coverage?.status==='no-trades'?'No trades yet':coverage?.status==='not-indexed'?'Trade history not indexed yet':'No indexed trades in this interval';
 const emptyNote=error?'Check the token address or try again shortly.':coverage?.notice||'Empty periods stay empty. Missing history is never drawn as zero.';
 const missingPriceNote=!market?(error?'Price temporarily unavailable':'Reading the pool…'):coverage?.status==='no-trades'||market.activity==='none'?'Price appears with the first trade':history.error?'Price history unavailable':'No verified price available';
 const seriesLabel=source==='usd'?'USD · external pool index':usdSeries?'USD · GeckoTerminal fallback':`on-chain · ${unit}`;
 return <section className="panel corner-panel market-module" aria-labelledby="market-heading" data-stale={stale||undefined}>
  <div className="corner-head"><span className="corner-label">Market</span><span className="corner-label is-right">{seriesLabel}</span></div>
  <div className="market-headline">
   <div>
    <h2 id="market-heading" className="sr-only">Market</h2>
    <p className="market-price"><button type="button" className="market-metric-toggle" aria-pressed={activeMetric==='market-cap'} aria-label={`Switch to ${activeMetric==='price'?'market cap':'price'}`} disabled={!canMarketCap} onClick={()=>setMetric(activeMetric==='price'?'market-cap':'price')} title="Switch price and market cap"><ArrowLeftRight size={16} aria-hidden="true"/><span>{metricLabel}</span></button><strong className="stale-value">{headline}</strong>{stale&&<span className="delay-chip" role="status" title={market?`Last updated ${new Date(market.updatedAt).toLocaleTimeString()}`:undefined}>delayed {relativeTime(now-delayedMs,now)}</span>}</p>
    <p className="market-subline">{change!=null&&<span className={change>=0?'is-up':'is-down'}>{formatPercent(change,{signed:true})} 24h</span>}<span>{liveView&&liveValue!=null?'Last confirmed execution · fees included':activeMetric==='market-cap'?'Market cap from current supply; spot price before fees':source==='usd'?'USD price from an external pool index':priceQuote!=null?<>{graduated?'Pool spot price':'Curve spot price'}, before fees{n?.priceUsd!=null&&n.usd?.freshness!=='expired'&&<> · ≈ {formatPrice(n.priceUsd,'USD')}</>}</>:points.length&&!usdSeries?'Last indexed execution price':missingPriceNote}</span></p>
   {activeMetric==='market-cap'&&<p className="market-metric-note">{display.estimatedUsd?'USD estimate using the current quote-asset conversion, not historical USD prices. ':''}Market-cap history uses current supply.</p>}
   </div>
   <div className="market-controls">
    {points.length>0&&<span className="market-live-status" data-live={live||undefined} title={live?'Confirmed trades streamed directly from the pool':'Reconnecting to the live pool'}><i aria-hidden="true"/>{live?'Live':'Delayed'}</span>}
    {usdAvailable&&<div className="segmented" role="group" aria-label="Price source"><button aria-pressed={source==='grainpad'} onClick={()=>setChoice('grainpad')}>On-chain</button><button aria-pressed={source==='usd'} onClick={()=>setChoice('usd')}>USD</button></div>}
    <div className="segmented" role="group" aria-label="Chart view">{INTERVALS.map(([label,s])=><button key={label} aria-pressed={seconds===s} onClick={()=>setSeconds(s)} title={s===0?'Live trades · moving 2-minute window':s===86400?'Past 24 hours · 5-minute resolution':`${label} candles`}>{label==='1d'?'1D':label}</button>)}</div>
   </div>
  </div>
  <dl className="market-stats stale-value">{statItems.map(([label,value,note])=><Stat key={label} label={label} value={value} note={note}/>)}</dl>
  <div className="market-chart-frame">{liveView?(liveEvents.length?<LiveMarketChart events={liveEvents} multiplier={display.multiplier??1} unit={seriesUnit}/>:<div className="market-empty" role="status"><strong>{live?'Waiting for the first trade':'Connecting to live trades…'}</strong><span>Prices move when confirmed pool trades arrive.</span></div>):points.length?<GrainChart points={points} live={live} interval={seconds} unit={seriesUnit} label={`${metricLabel} in ${seriesUnit}${display.estimatedUsd?' · current USD conversion estimate':''}${activeMetric==='market-cap'?' · current supply':''}`}/>:<div className="market-empty" role="status"><strong>{emptyTitle}</strong><span>{emptyNote}</span></div>}</div>
  <div className="market-foot"><span>{liveView?<span>Live confirmed executions · moving 2-minute window · fees included</span>:<>{activeMetric==='market-cap'&&<>Market cap · current supply{display.estimatedUsd?' · current USD conversion estimate':''} · </>}{usdSeries?(history.data?.source==='geckoterminal'&&source!=='usd'?'GeckoTerminal USD fallback · not the Grainpad record':'External USD series. Swaps quote from chain.'):activeMetric==='market-cap'?'Grainpad index · execution prices × current supply · fees included':`Grainpad index · ${unit} per token · execution prices include fees`}</>}{coverage&&coverage.status!=='indexed'&&points.length>0&&<> · <span className="coverage-note" title={coverage.notice}>{COVERAGE_LABEL[coverage.status]||coverage.status}</span></>}</span>{usdSeries&&market?<a href={market.links?.gecko||`https://www.geckoterminal.com/solana/pools/${market.pool}`} target="_blank" rel="noreferrer">Source <ArrowUpRight size={12}/></a>:null}</div>
  {market&&pct!==null&&<div className="lifecycle-progress">
   <div><span>{market.route==='cpmm'?'Graduated':market.route==='graduating'?'Curve complete':'Bonding curve'}</span>{market.route==='curve'&&pct>=80&&<span className="record-tape">Near graduation</span>}{market.route!=='curve'&&<span className="record-tape">{market.route==='cpmm'?'On Raydium':'Migrating'}</span>}<strong>{market.route==='cpmm'?'100%':formatPercent(pct)}</strong></div>
   <div className="progress-track" role="progressbar" aria-label="Graduation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(market.route==='cpmm'?100:pct)}><i style={{transform:`scaleX(${(market.route==='cpmm'?100:pct)/100})`}}/></div>
   <small>{market.route==='cpmm'?'Trading in the Raydium pool':market.route==='graduating'?`${raised} / ${target} ${unit} raised`:`${raised} / ${target} ${unit} to graduate`}</small>
  </div>}
 </section>;
}
