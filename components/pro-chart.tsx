'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Camera,Maximize2,Minimize2,RotateCcw,ZoomIn,ZoomOut} from 'lucide-react';
import type {IChartApi,ISeriesApi,MouseEventParams,SeriesType,Time,LogicalRange} from 'lightweight-charts';
import {BAR_OPTIONS,RANGE_OPTIONS,mergeBars,minMoveFor,pageCursor,seriesRows,utcLabel,withAlpha,withLiveTrades} from '@/lib/pro-chart-data.mjs';
import {formatNumber,formatPercent} from '@/lib/price-format';
import {startViewerPolling} from '@/lib/viewer-polling.mjs';
import {KeepCase} from './keep-case';
import type {LiveTrade} from './use-live-market';

type Bar={time:number;open:number;high:number;low:number;close:number;volume?:number;lastTime?:number;live?:boolean};
type Page={rows:Bar[];first?:number|null;unit?:string;source?:string;coverage?:{status:string;notice:string};window?:{start?:number;end?:number;resolution?:number};error?:string};
type Legend={time:number;open:number;high:number;low:number;close:number;volume:number}|null;
export type ProChartProps={mint:string;pool?:string;symbol:string;style:'line'|'candles';metric:'price'|'market-cap';setMetric:(m:'price'|'market-cap')=>void;
 quote:string;supply:number|null;usdRate:number|null;colors:{up:string;down:string;hollow:boolean};live:LiveTrade[];onSource?:(source:{unit:string;source:string}|null)=>void};
const PAGE=300;
/** The viewer's clock offset in seconds; the engine draws UTC, so bar times are shifted for display (never sent back). */
const viewerShift=()=>typeof window==='undefined'?0:-new Date().getTimezoneOffset()*60;

/** The pan-and-zoom market chart, on TradingView's open-source engine (lightweight-charts): wheel zooms around the
 * cursor, drag pans back through history (older bars load as you reach them), pinch on touch, crosshair with axis
 * labels, OHLC legend, volume, last-price tag, auto / log / % scales. Display only: the indexed bars are read-only
 * and nothing here signs or sends anything. */
export function ProChart({mint,pool,symbol,style,metric,setMetric,quote,supply,usdRate,colors,live,onSource}:ProChartProps){
 const host=useRef<HTMLDivElement>(null),frame=useRef<HTMLDivElement>(null),chart=useRef<IChartApi|null>(null),main=useRef<ISeriesApi<SeriesType>|null>(null),engine=useRef<typeof import('lightweight-charts')|null>(null),mainStyle=useRef(''),volume=useRef<ISeriesApi<'Histogram'>|null>(null);
 const [ready,setReady]=useState(0),[bar,setBar]=useState(300),[range,setRange]=useState<string|null>('1D'),[mode,setMode]=useState<0|1|2>(0),[auto,setAuto]=useState(true),[full,setFull]=useState(false);
 const [bars,setBars]=useState<Bar[]>([]),[meta,setMeta]=useState<{key:string;first:number|null;unit:string;source:string;coverage?:Page['coverage'];error?:string;loading:boolean;exhausted:boolean;cursor:number|null}>({key:'',first:null,unit:'quote',source:'grainpad',loading:true,exhausted:false,cursor:null});
 const [legend,setLegend]=useState<Legend>(null),[clock,setClock]=useState<number|null>(null),shift=useMemo(viewerShift,[]);
 const [currency,setCurrency]=useState<'usd'|'quote'>('usd');
 const key=`${mint}:${pool}:${bar}`,loadingOlder=useRef(false),pendingRange=useRef<string|null>('1D');
 const usdSeries=meta.unit==='usd',useUsd=!usdSeries&&currency==='usd'&&usdRate!=null;
 // Market cap needs supply; a USD-only external series can only show price in USD.
 const canMarketCap=supply!=null&&!usdSeries,activeMetric=canMarketCap?metric:'price';
 const multiplier=(activeMetric==='market-cap'?supply??1:1)*(useUsd?usdRate??1:1),volumeMultiplier=useUsd?usdRate??1:1;
 const unit=usdSeries||useUsd?'usd':quote;
 const fmt=useCallback((v:number)=>unit==='usd'?formatNumber(v,{sig:4,prefix:'$',compactFrom:1_000_000}):formatNumber(v,{sig:4,compactFrom:1_000_000}),[unit]);
 const fetchPage=useCallback(async(before:number|null,signal?:AbortSignal)=>{
  const r=await fetch(`/api/market/${encodeURIComponent(mint)}/history?kind=candles&bar=${bar}&limit=${PAGE}${before!==null?`&before=${before}`:''}`,{signal,cache:'no-store',headers:{'X-Grainpad-Viewer':'visible'}});
  const body=await r.json() as Page;if(!r.ok)throw Error(body.error||'Price history unavailable.');return body;
 },[mint,bar]);

 // Engine: created once, client-only (dynamic import keeps it out of the server render and the first bundle).
 useEffect(()=>{
  let disposed=false,observer:MutationObserver|null=null;
  void import('lightweight-charts').then(lib=>{
   if(disposed||!host.current)return;
   engine.current=lib;
   const instance=lib.createChart(host.current,{autoSize:true,
    layout:{attributionLogo:false,fontSize:11,background:{type:lib.ColorType.Solid,color:'rgba(0,0,0,0)'}},
    crosshair:{mode:lib.CrosshairMode.Normal},
    rightPriceScale:{borderVisible:false,scaleMargins:{top:.12,bottom:.22}},
    timeScale:{borderVisible:false,rightOffset:6,barSpacing:9,minBarSpacing:.6,timeVisible:true,secondsVisible:false,
     tickMarkFormatter:(time:Time,type:number)=>{const d=new Date(Number(time)*1000);return type===0?String(d.getUTCFullYear()):type===1?d.toLocaleString('en-GB',{month:'short',timeZone:'UTC'}):type===2?d.toLocaleString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}):d.toLocaleString('en-GB',{hour:'2-digit',minute:'2-digit',second:type===4?'2-digit':undefined,hour12:false,timeZone:'UTC'});}},
    localization:{timeFormatter:(time:Time)=>new Date(Number(time)*1000).toLocaleString('en-GB',{day:'numeric',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'UTC'})},
    handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
    handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:{time:true,price:true},axisDoubleClickReset:{time:true,price:true}},
    kineticScroll:{mouse:true,touch:true}});
   chart.current=instance;
   volume.current=instance.addSeries(lib.HistogramSeries,{priceScaleId:'vol',priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false});
   instance.priceScale('vol').applyOptions({scaleMargins:{top:.84,bottom:0}});
   const theme=()=>{const css=getComputedStyle(frame.current||document.body),v=(name:string,fallback:string)=>css.getPropertyValue(name).trim()||fallback;
    const ink=v('--gx-ink','#101010'),mute=v('--gx-mute','#6f6f6f'),rule=v('--gx-rule','#e4e4e4');
    instance.applyOptions({layout:{textColor:mute,fontFamily:v('--gx-mono','IBM Plex Mono, monospace')},grid:{vertLines:{color:withAlpha(rule,.07)},horzLines:{color:withAlpha(rule,.07)}},
     crosshair:{vertLine:{color:mute,labelBackgroundColor:ink,style:lib.LineStyle.Dashed},horzLine:{color:mute,labelBackgroundColor:ink,style:lib.LineStyle.Dashed}}});
    setReady(n=>n+1);};
   theme();observer=new MutationObserver(theme);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class']});
   instance.subscribeCrosshairMove((param:MouseEventParams)=>{const s=main.current,data=s&&param.time!==undefined?param.seriesData.get(s) as {open?:number;high?:number;low?:number;close?:number;value?:number}|undefined:undefined;const vol=volume.current&&param.time!==undefined?param.seriesData.get(volume.current) as {value?:number}|undefined:undefined;
    setLegend(data?{time:Number(param.time),open:data.open??data.value??0,high:data.high??data.value??0,low:data.low??data.value??0,close:data.close??data.value??0,volume:vol?.value??0}:null);});
  });
  return()=>{disposed=true;observer?.disconnect();chart.current?.remove();chart.current=null;main.current=null;volume.current=null;};
 },[]);

 // Main series follows the chart style; candles keep the grains look (solid up, hollow down) unless colors were set.
 useEffect(()=>{
  const instance=chart.current,lib=engine.current;if(!instance||!lib)return;
  {
   if(main.current){instance.removeSeries(main.current);main.current=null;}
   const ink=getComputedStyle(frame.current||document.body).getPropertyValue('--gx-ink').trim()||'#101010';
   main.current=style==='candles'
    ?instance.addSeries(lib.CandlestickSeries,{upColor:colors.up,borderUpColor:colors.up,wickUpColor:colors.up,downColor:colors.hollow?'rgba(0,0,0,0)':colors.down,borderDownColor:colors.hollow?ink:colors.down,wickDownColor:colors.hollow?ink:colors.down,priceLineStyle:lib.LineStyle.Dotted})
    :instance.addSeries(lib.AreaSeries,{lineColor:colors.up,lineWidth:2,topColor:withAlpha(colors.up,.18),bottomColor:'rgba(0,0,0,0)',priceLineStyle:lib.LineStyle.Dotted,crosshairMarkerRadius:4,crosshairMarkerBorderColor:colors.up,crosshairMarkerBackgroundColor:colors.up});
   mainStyle.current=style;drawn.current={first:null,length:0,multiplier:1,key:'',style:''};
  }
 },[style,colors.up,colors.down,colors.hollow,ready>0]);// eslint-disable-line react-hooks/exhaustive-deps -- recreate only when the engine first exists or the look changes.

 // Latest page for the bar size, then a poll that merges the newest bars; older pages load as the view reaches them.
 useEffect(()=>{
  setBars([]);setMeta({key,first:null,unit:'quote',source:'grainpad',loading:true,exhausted:false,cursor:null});
  return startViewerPolling(async(signal:AbortSignal)=>{
   try{const page=await fetchPage(null,signal);if(signal.aborted)return;
    setBars(previous=>mergeBars(previous,page.rows));
    setMeta(previous=>({key,first:page.first??null,unit:page.unit||'quote',source:page.source||'grainpad',coverage:page.coverage,loading:false,...pageCursor(previous.key===key?previous.cursor:null,page)}));
   }catch(e){if(!signal.aborted)setMeta(previous=>({...previous,key,loading:false,error:e instanceof Error?e.message:'Price history unavailable.'}));}
  },{intervalMs:15_000});
 },[key,fetchPage]);
 useEffect(()=>{onSource?.(meta.key===key?{unit:meta.unit,source:meta.source}:null);},[meta.unit,meta.source,meta.key,key,onSource]);
 const loadOlder=useCallback(async()=>{
  // Step back one time window at a time from the oldest window read, even when a window had few or no trades.
  if(loadingOlder.current||meta.exhausted||meta.cursor==null)return;
  loadingOlder.current=true;
  try{const page=await fetchPage(meta.cursor-1);setBars(previous=>mergeBars(page.rows,previous));setMeta(previous=>previous.key!==key?previous:{...previous,...pageCursor(previous.cursor,page)});}
  catch{/* Older history stays where it is; the next pan retries. */}finally{loadingOlder.current=false;}
 },[meta.exhausted,meta.cursor,key,fetchPage]);

 const merged=useMemo(()=>usdSeries?bars:withLiveTrades(bars,live,bar),[bars,live,bar,usdSeries]);
 const rows=useMemo(()=>seriesRows(merged,{multiplier,volumeMultiplier,shift}),[merged,multiplier,volumeMultiplier,shift]);
 const drawn=useRef<{first:number|null;length:number;multiplier:number;key:string;style:string}>({first:null,length:0,multiplier:1,key:'',style:''});
 useEffect(()=>{
  const instance=chart.current,series=main.current,vol=volume.current;if(!instance||!series||!vol||mainStyle.current!==style)return;
  const style_=getComputedStyle(frame.current||document.body),up=withAlpha(colors.up,.45),down=withAlpha(style_.getPropertyValue('--gx-ink').trim()||'#888',.22);
  const data=style==='candles'?rows.candles:rows.candles.map(c=>({time:c.time,value:c.close}));
  const volumes=rows.volumes.map(v=>({time:v.time,value:v.value,color:v.up?up:down}));
  const before=drawn.current,firstTime=rows.candles[0]?.time??null,sameShape=before.key===key&&before.style===style&&before.multiplier===multiplier&&before.first===firstTime;
  series.applyOptions({priceFormat:{type:'custom',formatter:fmt,minMove:minMoveFor(rows.candles.map(c=>c.low))}});
  const grew=rows.candles.length-before.length,replace=()=>{
   const logical=instance.timeScale().getVisibleLogicalRange(),prepended=before.key===key&&before.first!==null&&firstTime!==null&&firstTime<before.first?rows.candles.findIndex(c=>c.time===before.first):0;
   series.setData(data as never);vol.setData(volumes);
   if(logical&&prepended>0)instance.timeScale().setVisibleLogicalRange({from:logical.from+prepended,to:logical.to+prepended});
  };
  // Only the tail moved: update in place so the view does not jump. The engine updates the last bar or appends one.
  // A chart error must never take the page down: fall back to a full redraw, then to leaving the last good frame.
  try{if(sameShape&&before.length>0&&(grew===0||grew===1)){try{const tail=grew===1?-2:-1;for(const point of data.slice(tail))series.update(point as never);for(const point of volumes.slice(tail))vol.update(point);}catch{replace();}}
  else replace();}catch{return;}
  drawn.current={first:firstTime,length:rows.candles.length,multiplier,key,style};
 },[rows,style,multiplier,key,fmt,colors.up,ready]);

 // Range buttons: load back far enough, then show exactly that span (All: everything since the first trade).
 useEffect(()=>{
  const want=pendingRange.current,instance=chart.current;if(!want||!instance||!rows.candles.length||meta.key!==key)return;
  const option=RANGE_OPTIONS.find(([label])=>label===want);if(!option)return;
  // Live trades can reach the chart before the first history page: read the earliest bar from what is drawn (history
  // plus live), never from the fetched history alone, which may still be empty.
  const earliest=merged[0]?.time;if(earliest===undefined)return;
  const span=option[1],now=Math.floor(Date.now()/1000),from=span===null?(meta.first??earliest):now-span;
  if((meta.cursor??earliest)>from&&!meta.exhausted){void loadOlder();return;}
  // Apply once the bars are drawn; the engine cannot map a time range onto an empty series.
  if(!main.current||drawn.current.key!==key||!drawn.current.length)return;
  pendingRange.current=null;
  try{if(span===null)instance.timeScale().fitContent();else instance.timeScale().setVisibleRange({from:(Math.max(from,earliest)+shift) as Time,to:(now+shift+bar*6) as Time});}
  catch{instance.timeScale().fitContent();}
 },[rows,merged,meta,key,loadOlder,shift,bar,ready]);
 // Panning near the left edge pulls the previous page.
 useEffect(()=>{
  const instance=chart.current;if(!instance)return;
  const onRange=(logical:LogicalRange|null)=>{if(logical&&logical.from<15)void loadOlder();};
  instance.timeScale().subscribeVisibleLogicalRangeChange(onRange);return()=>instance.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
 },[loadOlder,ready]);
 useEffect(()=>{chart.current?.applyOptions({timeScale:{secondsVisible:bar<60}});},[bar,ready]);
 // Once the first trade is loaded there is nothing older: panning stops at the start of history, as on TradingView.
 const atStart=meta.key===key&&meta.exhausted;
 useEffect(()=>{chart.current?.applyOptions({timeScale:{fixLeftEdge:atStart}});},[atStart,ready]);
 useEffect(()=>{chart.current?.priceScale('right').applyOptions({mode,autoScale:auto});},[mode,auto,ready]);
 useEffect(()=>{setClock(Date.now());const id=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(id);},[]);
 useEffect(()=>{const onChange=()=>setFull(document.fullscreenElement===frame.current);document.addEventListener('fullscreenchange',onChange);return()=>document.removeEventListener('fullscreenchange',onChange);},[]);

 const chooseRange=(label:string)=>{const option=RANGE_OPTIONS.find(([l])=>l===label);if(!option)return;pendingRange.current=label;setRange(label);
  // A range picks a bar size that draws it with a sensible bar count; All picks one from the lifetime.
  const life=meta.first!=null?Math.floor(Date.now()/1000)-meta.first:86400,next=option[2]??(BAR_OPTIONS.map(([,s])=>s).find(s=>s>=60&&life/s<=600)??86400);
  if(next!==bar)setBar(next);else setReady(n=>n+1);};
 const zoom=(factor:number)=>{const scale=chart.current?.timeScale(),logical=scale?.getVisibleLogicalRange();if(!scale||!logical)return;const width=(logical.to-logical.from)*factor;scale.setVisibleLogicalRange({from:logical.to-width,to:logical.to});setRange(null);};
 const reset=()=>{chart.current?.timeScale().resetTimeScale();setAuto(true);setRange(null);};
 const fullscreen=()=>{if(document.fullscreenElement)void document.exitFullscreen();else void frame.current?.requestFullscreen?.();};
 const screenshot=()=>{const canvas=chart.current?.takeScreenshot();if(!canvas)return;const link=document.createElement('a');link.download=`${symbol||'grainpad'}-${new Date().toISOString().slice(0,16).replace(':','')}.png`;link.href=canvas.toDataURL('image/png');link.click();};

 const shown=legend??(rows.candles.length?{...rows.candles.at(-1)!,volume:rows.volumes.at(-1)?.value??0}:null);
 const previous=legend?rows.candles[rows.candles.findIndex(c=>c.time===legend.time)-1]:rows.candles.at(-2);
 const change=shown&&previous?(shown.close-previous.close)/previous.close*100:null;
 const barLabel=BAR_OPTIONS.find(([,s])=>s===bar)?.[0]??'';
 const empty=meta.key===key&&!meta.loading&&!rows.candles.length;
 return <div ref={frame} className="pro-chart" data-full={full||undefined}>
  <div className="pro-toolbar">
   <div className="pro-group" role="group" aria-label="Bar size">{BAR_OPTIONS.map(([label,s])=><button key={label} type="button" aria-pressed={bar===s} onClick={()=>{setBar(s);setRange(null);pendingRange.current=null;}} title={`${label} bars`}>{label}</button>)}</div>
   <div className="pro-group" role="group" aria-label="Metric"><button type="button" aria-pressed={activeMetric==='price'} onClick={()=>setMetric('price')}>Price</button><button type="button" aria-pressed={activeMetric==='market-cap'} disabled={!canMarketCap} onClick={()=>setMetric('market-cap')}>MCap</button></div>
   {!usdSeries&&<div className="pro-group" role="group" aria-label="Currency"><button type="button" aria-pressed={useUsd} disabled={usdRate==null} onClick={()=>setCurrency('usd')} title="USD at the current conversion, not historical USD prices">USD</button><button type="button" aria-pressed={!useUsd} onClick={()=>setCurrency('quote')}><KeepCase>{quote}</KeepCase></button></div>}
   <div className="pro-tools">
    <button type="button" className="pro-icon" aria-label="Zoom in" title="Zoom in" onClick={()=>zoom(.6)}><ZoomIn size={16}/></button>
    <button type="button" className="pro-icon" aria-label="Zoom out" title="Zoom out" onClick={()=>zoom(1.6)}><ZoomOut size={16}/></button>
    <button type="button" className="pro-icon" aria-label="Reset chart view" title="Reset view" onClick={reset}><RotateCcw size={15}/></button>
    <button type="button" className="pro-icon" aria-label={full?'Exit full screen':'Full screen'} title={full?'Exit full screen':'Full screen'} onClick={fullscreen}>{full?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button>
    <button type="button" className="pro-icon" aria-label="Save chart image" title="Save chart image" onClick={screenshot}><Camera size={16}/></button>
   </div>
  </div>
  <div className="pro-stage">
   <div ref={host} className="pro-canvas" role="img" aria-label={`${activeMetric==='market-cap'?'Market cap':'Price'} chart in ${unit==='usd'?'USD':quote}, ${barLabel} bars. Scroll to zoom, drag to pan.`}/>
   {shown&&<div className="pro-legend" aria-live="off">
    <p><strong>{symbol||'token'}</strong><span>· {barLabel} · {activeMetric==='market-cap'?'mcap':'price'} · <KeepCase>{unit==='usd'?'USD':quote}</KeepCase></span>
     {style==='candles'?<><span>O <b>{fmt(shown.open)}</b></span><span>H <b>{fmt(shown.high)}</b></span><span>L <b>{fmt(shown.low)}</b></span><span>C <b>{fmt(shown.close)}</b></span></>:<span><b>{fmt(shown.close)}</b></span>}
     {change!=null&&Number.isFinite(change)&&<span className={change>=0?'is-up':'is-down'}>{formatPercent(change,{signed:true})}</span>}</p>
    <p><span>Vol <b>{unit==='usd'?formatNumber(shown.volume,{sig:3,prefix:'$'}):formatNumber(shown.volume,{sig:3})}</b>{unit!=='usd'&&<> <KeepCase>{quote}</KeepCase></>}</span></p>
   </div>}
   {meta.key===key&&meta.loading&&!rows.candles.length&&<div className="pro-empty" role="status">Reading the index…</div>}
   {empty&&<div className="pro-empty" role="status"><strong>{meta.error?'Price history unavailable':meta.coverage?.status==='no-trades'?'No trades yet':'No indexed trades for these bars'}</strong><span>{meta.error||meta.coverage?.notice||'Try a larger bar size. Missing history is never drawn as zero.'}</span></div>}
  </div>
  <div className="pro-foot">
   <div className="pro-group" role="group" aria-label="Range">{RANGE_OPTIONS.map(([label])=><button key={label} type="button" aria-pressed={range===label} onClick={()=>chooseRange(label)}>{label.toLowerCase()==='all'?'All':label.toLowerCase()}</button>)}</div>
   <span className="pro-clock">{clock!==null&&<>{new Date(clock).toLocaleTimeString('en-GB',{hour12:false})} {utcLabel(-new Date(clock).getTimezoneOffset())}</>}</span>
   <div className="pro-group" role="group" aria-label="Price scale"><button type="button" aria-pressed={mode===2} onClick={()=>setMode(mode===2?0:2)} title="Percent from the first visible bar">%</button><button type="button" aria-pressed={mode===1} onClick={()=>setMode(mode===1?0:1)} title="Logarithmic scale">log</button><button type="button" aria-pressed={auto} onClick={()=>setAuto(!auto)} title="Fit the price scale to the visible bars">auto</button></div>
  </div>
 </div>;
}
