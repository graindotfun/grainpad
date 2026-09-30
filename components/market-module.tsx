'use client';
import {useEffect,useState} from 'react';
import {Area,AreaChart,CartesianGrid,ReferenceDot,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {ArrowUpRight} from 'lucide-react';
import {startViewerPolling} from '@/lib/viewer-polling.mjs';
import {formatNumber,formatPercent,formatPrice,formatUnits,formatUsd,relativeTime} from '@/lib/price-format';
import type {MarketView} from '@/lib/server-market';
import type {Candle} from '@/lib/market-display';
import type {TapeState} from './native-tape';
export type MarketSource='grainpad'|'usd';
export type SeriesPoint={time:number;value:number};
export const INTERVALS:[string,number][]=[['1m',60],['5m',300],['1h',3600],['1d',86400]];
/** Response of /api/market/[mint]/history. `source`, `unit` and `coverage` are optional so this module works with
 * the current GeckoTerminal-only route and with the native-history route when it lands (integration point). */
type History={rows:Candle[];available:boolean;stale:boolean;updatedAt?:number;pool:string;source?:string;unit?:string;coverage?:{status:string;notice:string}};
/** External USD candles. Fetched only while the USD source is selected. */
function useUsdHistory(market:MarketView|null,mint:string,interval:string,enabled:boolean){
 const key=`${mint}:${market?.pool}:${interval}`,[state,setState]=useState<{key:string;data?:History;error?:string}>({key:''});
 useEffect(()=>{
  if(!enabled||!market?.chart.available)return;
  return startViewerPolling(async(signal:AbortSignal)=>{
   try{const r=await fetch(`/api/market/${encodeURIComponent(mint)}/history?kind=candles&interval=${interval}`,{signal,cache:'no-store',headers:{'X-Grainpad-Viewer':'visible'}});
    const body=await r.json() as History&{error?:string};if(!r.ok)throw Error(body.error||'USD history unavailable.');
    if(body.pool!==market.pool)throw Error('Pool changed. Refreshing market…');
    setState({key,data:body});
   }catch(e){if(!signal.aborted)setState(previous=>({key,data:previous.key===key?previous.data:undefined,error:e instanceof Error?e.message:'USD history unavailable.'}));}
  },{intervalMs:60_000});
 },[key,mint,interval,enabled,market?.pool,market?.chart.available]);
 const current:{data?:History;error?:string}=state.key===key?state:{};
 // A route that answers with Grainpad quote candles is not a USD series; never label it as one.
 const usd=!current.data||(current.data.unit??'usd')==='usd'&&(current.data.source??'geckoterminal')==='geckoterminal';
 return usd?current:{data:undefined,error:'USD series not available.'};
}
const tickTime=(seconds:number,interval:number)=>new Date(seconds*1000).toLocaleString('en-US',interval>=86400?{month:'short',day:'numeric'}:{hour:'2-digit',minute:'2-digit',hour12:false});
/** The one chart spec for every source: right axis, mono ticks, dashed horizontal grid, orange line, marked last point. */
export function GrainChart({points,interval,unit,label}:{points:SeriesPoint[];interval:number;unit:'usd'|string;label:string}){
 const last=points.at(-1),tick=(v:number)=>unit==='usd'?formatNumber(v,{sig:3,prefix:'$'}):formatNumber(v,{sig:3});
 const width=Math.min(84,Math.max(44,Math.max(...points.map(p=>tick(p.value).length))*7+10));
 return <div className="grain-chart" role="img" aria-label={`${label}. Last ${last?formatPrice(last.value,unit==='usd'?'USD':unit):'unavailable'}.`}>
  <ResponsiveContainer width="100%" height="100%" minWidth={0}><AreaChart data={points} margin={{top:14,right:0,bottom:0,left:0}}>
   <defs><linearGradient id="grain-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--xmr-orange)" stopOpacity={.16}/><stop offset="100%" stopColor="var(--xmr-orange)" stopOpacity={0}/></linearGradient></defs>
   <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="2 4"/>
   <XAxis type="number" dataKey="time" domain={['dataMin','dataMax']} tickFormatter={v=>tickTime(v,interval)} minTickGap={56} tickMargin={8} axisLine={false} tickLine={false} tick={{fill:'var(--chart-tick)',fontSize:10.5,fontFamily:'var(--font-code)'}}/>
   <YAxis orientation="right" dataKey="value" domain={['auto','auto']} tickCount={5} tickFormatter={tick} width={width} tickMargin={6} axisLine={false} tickLine={false} tick={{fill:'var(--chart-tick)',fontSize:10.5,fontFamily:'var(--font-code)'}}/>
   <Tooltip cursor={{stroke:'var(--chart-tick)',strokeDasharray:'2 3'}} isAnimationActive={false} content={({active,payload})=>{const p=payload?.[0]?.payload as SeriesPoint|undefined;return active&&p?<div className="grain-tooltip"><strong>{formatPrice(p.value,unit==='usd'?'USD':unit)}</strong><span>{new Date(p.time*1000).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div>:null;}}/>
   <Area type="linear" dataKey="value" stroke="var(--xmr-orange)" strokeWidth={2} fill="url(#grain-chart-fill)" isAnimationActive={false} dot={false} activeDot={{r:3.5,fill:'var(--xmr-orange)',stroke:'var(--chart-surface)',strokeWidth:2}}/>
   {last&&<ReferenceDot x={last.time} y={last.value} r={4.5} fill="var(--xmr-orange)" stroke="var(--chart-surface)" strokeWidth={2.5}/>}
  </AreaChart></ResponsiveContainer>
 </div>;
}
function Stat({label,value,note}:{label:string;value:string;note?:string}){return <div className="market-stat"><dt>{label}</dt><dd>{value}{note&&<small>{note}</small>}</dd></div>;}
/** Indexed quote volume over 24h, only when the loaded events reach back 24h. Otherwise withheld, never zero. */
function indexedVolume(tape:TapeState,decimals:number){
 const data=tape.data;if(!data)return null;const since=Date.now()/1000-86400,events=data.events;
 const reaches=!data.nextCursor||events.some(e=>e.blockTime!==null&&e.blockTime<since);if(!reaches)return null;
 let total=0n;for(const e of events)if((e.kind==='buy'||e.kind==='sell')&&e.blockTime!==null&&e.blockTime>=since&&e.quoteAmount)total+=BigInt(e.quoteAmount);
 return formatUnits(total.toString(),decimals,3);
}
type Props={market:MarketView|null;mint:string;error?:string;tape:TapeState;seconds:number;setSeconds:(n:number)=>void};
/** One market module, two sources. Grainpad's indexed record is the default; external USD is a toggle when a pool index has it. */
export function MarketModule({market,mint,error,tape,seconds,setSeconds}:Props){
 const usdAvailable=!!market?.chart.available,[choice,setChoice]=useState<MarketSource|null>(null);
 const source:MarketSource=choice==='usd'&&usdAvailable?'usd':choice==='grainpad'||!usdAvailable||market?.route!=='cpmm'?'grainpad':'usd';
 const interval=INTERVALS.find(([,s])=>s===seconds)?.[0]||'5m',usd=useUsdHistory(market,mint,interval,source==='usd');
 const [now,setNow]=useState(()=>Date.now());useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),15_000);return()=>clearInterval(id);},[]);
 const q=market?.quote,unit=q?.symbol||'SOL',stats=market?.stats;
 const native=(tape.data?.candles||[]).map(c=>({time:c.time,value:c.close})).filter(p=>Number.isFinite(p.value)&&p.value>0);
 const external=(usd.data?.rows||[]).map(c=>({time:c.time,value:c.close}));
 const points=source==='usd'?external:native;
 // Headline: curve spot price while the curve is open, otherwise the last indexed execution price.
 const nativePrice=market?.quoteStats?.price??native.at(-1)?.value??null;
 const headline=source==='usd'?formatPrice(stats?.price??external.at(-1)?.value,'USD'):formatPrice(nativePrice,unit);
 const change=source==='usd'?stats?.change:null;
 const delayedMs=market?.stale?now-market.updatedAt:source==='usd'&&(usd.data?.stale||market?.chart.stale)&&usd.data?.updatedAt?now-usd.data.updatedAt:0;
 const stale=delayedMs>0;
 const raised=market?.progress&&q?formatUnits(market.progress.raised,q.decimals,3):null,target=market?.progress&&q?formatUnits(market.progress.target,q.decimals,3):null;
 const pct=market?.progress&&Number(market.progress.target)>0?Math.min(100,Math.max(0,Number(market.progress.raised)/Number(market.progress.target)*100)):null;
 const volume=q?indexedVolume(tape,q.decimals):null;
 const statItems:[string,string,string?][]=[
  ['Market cap',source==='usd'||market?.route==='cpmm'&&stats?.marketCap!=null?formatUsd(stats?.marketCap):formatPrice(market?.quoteStats?.marketCap,unit)],
  market?.route==='cpmm'?['Liquidity',formatUsd(stats?.liquidity),stats?.liquidity!=null?'external':undefined]:['Curve reserve',raised?`${raised} ${unit}`:'—'],
  ['24h volume',volume?`${volume} ${unit}`:stats?.volume!=null?formatUsd(stats.volume):'—',volume?'indexed':stats?.volume!=null?'external':undefined],
  ['Pair',unit],
 ];
 const empty=error?'Market unavailable':!market?'Reading the pool…':source==='usd'?usd.error?'USD history unavailable':!usd.data?'Loading USD history…':'No USD history in this interval':tape.error&&!tape.data?'Ledger unavailable':!tape.data?'Reading the ledger…':market.activity==='none'?'Waiting for the first trade':'No indexed trades in this interval';
 return <section className="panel corner-panel market-module" aria-labelledby="market-heading" data-stale={stale||undefined}>
  <div className="corner-head"><span className="corner-label">Market</span><span className="corner-label is-right">{source==='usd'?'USD · GeckoTerminal':`on-chain · ${unit}`}</span></div>
  <div className="market-headline">
   <div>
    <h2 id="market-heading" className="sr-only">Market</h2>
    <p className="market-price"><strong className="stale-value">{headline}</strong>{stale&&<span className="delay-chip" role="status" title={market?`Last updated ${new Date(market.updatedAt).toLocaleTimeString()}`:undefined}>delayed {relativeTime(now-delayedMs,now)}</span>}</p>
    <p className="market-subline">{source==='usd'?<>{change!=null&&<span className={change>=0?'is-up':'is-down'}>{formatPercent(change,{signed:true})} 24h</span>}<span>USD price from an external pool index</span></>:<span>{market?.quoteStats?.price!=null?'Curve spot price, before fees':native.length?'Last indexed execution price':'Price appears with the first indexed trade'}{stats?.price!=null&&<> · ≈ {formatPrice(stats.price,'USD')}</>}</span>}</p>
   </div>
   <div className="market-controls">
    {usdAvailable&&<div className="segmented" role="group" aria-label="Price source"><button aria-pressed={source==='grainpad'} onClick={()=>setChoice('grainpad')}>On-chain</button><button aria-pressed={source==='usd'} onClick={()=>setChoice('usd')}>USD</button></div>}
    <div className="segmented" role="group" aria-label="Chart interval">{INTERVALS.map(([label,s])=><button key={label} aria-pressed={seconds===s} onClick={()=>setSeconds(s)}>{label}</button>)}</div>
   </div>
  </div>
  <dl className="market-stats stale-value">{statItems.map(([label,value,note])=><Stat key={label} label={label} value={value} note={note}/>)}</dl>
  <div className="market-chart-frame">{points.length?<GrainChart points={points} interval={seconds} unit={source==='usd'?'usd':unit} label={source==='usd'?'USD price':`Price in ${unit}`}/>:<div className="market-empty" role="status"><strong>{empty}</strong><span>{error?'Check the token address or try again shortly.':source==='usd'?'Swaps use a separate on-chain quote.':'Empty periods stay empty. Missing history is never drawn as zero.'}</span></div>}</div>
  <div className="market-foot"><span>{source==='usd'?'External USD series. Swaps quote from chain.':`Grainpad index · ${unit} per token · execution prices include fees`}</span>{source==='usd'&&market?<a href={`https://www.geckoterminal.com/solana/pools/${market.pool}`} target="_blank" rel="noreferrer">Source <ArrowUpRight size={12}/></a>:null}</div>
  {market&&pct!==null&&<div className="lifecycle-progress">
   <div><span>{market.route==='cpmm'?'Graduated':market.route==='graduating'?'Curve complete':'Bonding curve'}</span>{market.route==='curve'&&pct>=80&&<span className="record-tape">Near graduation</span>}{market.route!=='curve'&&<span className="record-tape">{market.route==='cpmm'?'On Raydium':'Migrating'}</span>}<strong>{market.route==='cpmm'?'100%':formatPercent(pct)}</strong></div>
   <div className="progress-track" role="progressbar" aria-label="Graduation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(market.route==='cpmm'?100:pct)}><i style={{transform:`scaleX(${(market.route==='cpmm'?100:pct)/100})`}}/></div>
   <small>{market.route==='cpmm'?'Trading in the Raydium pool':market.route==='graduating'?`${raised} / ${target} ${unit} raised`:`${raised} / ${target} ${unit} to graduate`}</small>
  </div>}
 </section>;
}
