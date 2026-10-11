'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Area,CartesianGrid,ComposedChart,ReferenceLine,ResponsiveContainer,Tooltip,XAxis,YAxis,usePlotArea,useXAxisScale,useYAxisScale} from 'recharts';
import {formatNumber,formatPrice} from '@/lib/price-format';
import {candleSeconds,DEFAULT_CHART_PREFERENCES} from '@/lib/chart-candles.mjs';
import type {Candle} from '@/lib/market-display';
type ExecutionCandle=Pick<Candle,'time'|'open'|'high'|'low'|'close'>&{carried?:boolean;openFromPrevious?:boolean};
type Colors={up:string;down:string};
/** Default colours draw grains candles: an up candle is a solid orange grain, a down candle a hollow ink grain (like a
 * sell on the tape). Colours the viewer picked keep the filled style they chose. */
const grainsStyle=(colors:Colors)=>colors.up.toLowerCase()===DEFAULT_CHART_PREFERENCES.up.toLowerCase()&&colors.down.toLowerCase()===DEFAULT_CHART_PREFERENCES.down.toLowerCase();
const INK='var(--gx-ink, var(--foreground))';
type Props={candles:ExecutionCandle[];colors:Colors;unit:string;now:number;interval:number;resolution?:number;lastPrice:number|null;label:string};
function bounds(candles:ExecutionCandle[],lastPrice:number|null){
 const prices=candles.flatMap(row=>[row.low,row.high]).concat(lastPrice!=null?[lastPrice]:[]).filter(value=>Number.isFinite(value)&&value>0);
 if(!prices.length)return [0,1];const min=Math.min(...prices),max=Math.max(...prices),padding=Math.max((max-min)*.16,max*.01,Number.MIN_VALUE);return [Math.max(0,min-padding),max+padding];
}
function lastCandleLabel(candles:ExecutionCandle[],unit:string){const last=candles.at(-1);return last?` Last candle: open ${formatPrice(last.open,unit==='usd'?'USD':unit)}, high ${formatPrice(last.high,unit==='usd'?'USD':unit)}, low ${formatPrice(last.low,unit==='usd'?'USD':unit)}, close ${formatPrice(last.close,unit==='usd'?'USD':unit)}.`:'';}
function CandleReadout({candle,unit}:{candle:ExecutionCandle;unit:string}){
 return <><strong>{new Date(candle.time*1000).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})}</strong>{candle.carried?<span>Last known price · no indexed execution</span>:candle.openFromPrevious?<span>Open from previous close</span>:null}<dl className="candle-readout">{(['open','high','low','close'] as const).map(key=><div key={key}><dt>{key}</dt><dd>{formatPrice(candle[key],unit==='usd'?'USD':unit)}</dd></div>)}</dl></>;
}
export function CandleBodies({candles,colors,interval,resolution}:{candles:ExecutionCandle[];colors:Colors;interval:number;resolution:number}){
 const plot=usePlotArea(),x=useXAxisScale(),y=useYAxisScale(),id=useId();
 if(!plot||!x||!y)return null;
 const width=Math.max(.65,Math.min(10,plot.width*resolution/interval*.65)),grains=grainsStyle(colors);
 return <g className={`candle-bodies${grains?' is-grains':''}`} pointerEvents="none"><defs><clipPath id={id}><rect x={plot.x} y={plot.y} width={plot.width} height={plot.height}/></clipPath></defs><g clipPath={`url(#${id})`}>{candles.map(candle=>{
  const mapped=x(candle.time),open=y(candle.open),close=y(candle.close),high=y(candle.high),low=y(candle.low);if([mapped,open,close,high,low].some(value=>value===undefined||!Number.isFinite(value)))return null;
  const center=Math.max(plot.x+width/2,Math.min(plot.x+plot.width-width/2,mapped!)),up=candle.close>=candle.open,color=candle.carried?'var(--chart-tick)':up?colors.up:grains?INK:colors.down,hollow=grains&&!up&&!candle.carried,height=Math.abs(open!-close!);
  return <g key={candle.time} data-direction={candle.close>=candle.open?'up':'down'}><line x1={center} x2={center} y1={high} y2={low} stroke={color} strokeWidth={Math.min(1.25,width)} strokeLinecap="round"/>{height<1?<line x1={center-width/2} x2={center+width/2} y1={close} y2={close} stroke={color} strokeWidth={Math.min(2,Math.max(.8,width))} strokeLinecap="round"/>:hollow?<rect x={center-width/2+.6} y={Math.min(open!,close!)+.6} width={Math.max(.4,width-1.2)} height={Math.max(.4,height-1.2)} rx={Math.min(1,width/4,height/2)} fill="var(--gx-card, transparent)" stroke={color} strokeWidth={1.2}/>:<rect x={center-width/2} y={Math.min(open!,close!)} width={width} height={height} rx={grains?Math.min(1,width/4,height/2):Math.min(1.5,width/3,height/2)} fill={color}/>}</g>;
 })}</g></g>;
}
export function CandlestickMarketChart({candles,colors,unit,now,interval,resolution=candleSeconds(interval),lastPrice,label}:Props){
 const first=candles[0]?.time??now-interval,last=candles.at(-1)?.time??now;
 const timeDomain:[number,number]=[Math.max(now-interval,first-resolution/2),last+resolution/2],span=Math.max(resolution,timeDomain[1]-timeDomain[0]);
 const domain=bounds(candles,lastPrice),tick=(value:number)=>formatNumber(value,{sig:3,prefix:unit==='usd'?'$':''});
 return <div className="grain-chart" role="img" aria-label={`${label}. Price candles. ${candles.length} candles in this window.${lastCandleLabel(candles,unit)}`}><ResponsiveContainer width="100%" height="100%" minWidth={0}><ComposedChart data={candles} margin={{top:14,right:0,bottom:0,left:0}}>
  <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="2 4"/>
  <XAxis type="number" dataKey="time" domain={timeDomain} allowDataOverflow tickFormatter={value=>new Date(value*1000).toLocaleString('en-US',{month:interval>86400?'short':undefined,day:interval>86400?'numeric':undefined,hour12:false,hour:interval>300?'2-digit':undefined,minute:'2-digit',second:interval<=300?'2-digit':undefined})} minTickGap={56} tickMargin={8} axisLine={false} tickLine={false} tick={{fill:'var(--chart-tick)',fontSize:10.5,fontFamily:'var(--font-code)'}}/>
  <YAxis type="number" dataKey="close" orientation="right" domain={domain} allowDataOverflow tickCount={5} tickFormatter={tick} width={84} tickMargin={6} axisLine={false} tickLine={false} tick={{fill:'var(--chart-tick)',fontSize:10.5,fontFamily:'var(--font-code)'}}/>
  <Area dataKey="close" stroke="none" fill="none" isAnimationActive={false} dot={false} activeDot={false}/>
  <CandleBodies candles={candles} colors={colors} interval={span} resolution={resolution}/>
  {lastPrice!=null&&(grainsStyle(colors)?<ReferenceLine y={lastPrice} stroke="var(--grain-orange)" strokeWidth={1} strokeDasharray="2 4"/>:<ReferenceLine y={lastPrice} stroke="var(--chart-tick)" strokeOpacity={.55} strokeDasharray="3 5"/>)}
  <Tooltip cursor={{stroke:'var(--chart-tick)',strokeDasharray:'2 3'}} isAnimationActive={false} content={({active,payload})=>{const candle=payload?.[0]?.payload as ExecutionCandle|undefined;return active&&candle?<div className="grain-tooltip"><CandleReadout candle={candle} unit={unit}/></div>:null;}}/>
 </ComposedChart></ResponsiveContainer>{!candles.length&&<span className="candle-quiet-note">No candles in this window · last known execution</span>}</div>;
}
/** The live candle changes on each receipt; the time window scrolls on animation frames. */
export function LiveCandlestickMarketChart({candles,colors,unit,lastPrice,label}:Omit<Props,'now'|'interval'>){
 const canvas=useRef<HTMLCanvasElement>(null),values=useRef({candles,colors,unit,lastPrice}),[hoverTime,setHoverTime]=useState<number|null>(null);
 useEffect(()=>{values.current={candles,colors,unit,lastPrice};},[candles,colors,unit,lastPrice]);
 useEffect(()=>{
  const node=canvas.current;if(!node)return;const ctx=node.getContext('2d');if(!ctx)return;let frame=0;
  const draw=()=>{
   const {candles,colors,unit,lastPrice}=values.current,now=Date.now()/1000,w=node.clientWidth,h=node.clientHeight,dpr=Math.min(devicePixelRatio||1,2),left=2,right=w-84,top=14,bottom=h-28;
   if(node.width!==Math.round(w*dpr)||node.height!==Math.round(h*dpr)){node.width=Math.round(w*dpr);node.height=Math.round(h*dpr);}
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
   const visible=candles.filter(row=>row.time+1>now-120&&row.time<=now+5),[low,high]=bounds(visible,lastPrice),style=getComputedStyle(node),tick=style.getPropertyValue('--chart-tick').trim()||'#889294',grid=style.getPropertyValue('--chart-grid').trim()||'#303638';
   if(right>left){
    const x=(time:number)=>left+(time-(now-120))/120*(right-left),y=(price:number)=>bottom-(price-low)/(high-low)*(bottom-top),width=Math.max(.65,Math.min(10,(right-left)/120*.65));
    ctx.font='10px "IBM Plex Mono",monospace';ctx.fillStyle=tick;ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.setLineDash([2,4]);
    for(let i=0;i<5;i++){const yy=top+(bottom-top)*i/4;ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.fillText(formatNumber(high-(high-low)*i/4,{sig:4,prefix:unit==='usd'?'$':''}),right+10,yy+3);}
    ctx.setLineDash([]);ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();ctx.lineCap='round';
    const grains=grainsStyle(colors),ink=style.getPropertyValue('--gx-ink').trim()||style.color,card=style.getPropertyValue('--gx-card').trim()||'transparent',orange=style.getPropertyValue('--grain-orange').trim()||colors.up;
    for(const candle of visible){const center=Math.max(left+width/2,Math.min(right-width/2,x(candle.time))),open=y(candle.open),close=y(candle.close),height=Math.abs(open-close),up=candle.close>=candle.open,color=candle.carried?tick:up?colors.up:grains?ink:colors.down,hollow=grains&&!up&&!candle.carried;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=Math.min(1.25,width);ctx.beginPath();ctx.moveTo(center,y(candle.high));ctx.lineTo(center,y(candle.low));ctx.stroke();ctx.beginPath();if(height<1){ctx.lineWidth=Math.min(2,Math.max(.8,width));ctx.moveTo(center-width/2,close);ctx.lineTo(center+width/2,close);ctx.stroke();}else if(hollow){ctx.lineWidth=1.2;ctx.fillStyle=card;ctx.roundRect(center-width/2+.6,Math.min(open,close)+.6,Math.max(.4,width-1.2),Math.max(.4,height-1.2),Math.min(1,width/4,height/2));ctx.fill();ctx.stroke();}else{ctx.roundRect(center-width/2,Math.min(open,close),width,height,grains?Math.min(1,width/4,height/2):Math.min(1.5,width/3,height/2));ctx.fill();}}
    if(lastPrice!=null){ctx.setLineDash(grains?[2,4]:[3,5]);ctx.strokeStyle=grains?orange:tick;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,y(lastPrice));ctx.lineTo(right,y(lastPrice));ctx.stroke();}
    ctx.restore();ctx.fillStyle=tick;for(let i=0;i<4;i++){const time=now-120+120*i/3,text=new Date(time*1000).toLocaleTimeString('en-US',{hour12:false,minute:'2-digit',second:'2-digit'});ctx.fillText(text,left+(right-left)*i/3-(i===3?30:0),h-6);}
   }
   frame=requestAnimationFrame(draw);
  };frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
 },[]);
 const hovered=candles.find(row=>row.time===hoverTime);
 return <div className="grain-live-candles"><canvas ref={canvas} className="grain-live-chart" role="img" aria-label={`${label}. Live price candles, moving two-minute window.${lastCandleLabel(candles,unit)}`} onPointerLeave={()=>setHoverTime(null)} onPointerMove={event=>{const rect=event.currentTarget.getBoundingClientRect(),time=Date.now()/1000-120+(event.clientX-rect.left-2)/(rect.width-86)*120,nearest=candles.reduce<ExecutionCandle|null>((best,row)=>Math.abs(row.time-time)<Math.abs((best?.time??Infinity)-time)?row:best,null);setHoverTime(nearest&&Math.abs(nearest.time-time)<1?nearest.time:null);}}/>{hovered&&<div className="grain-tooltip live-candle-tooltip"><CandleReadout candle={hovered} unit={unit}/></div>}{!candles.length&&<span className="candle-quiet-note">No candles in this window · last known execution</span>}</div>;
}
