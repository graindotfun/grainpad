'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {formatNumber,formatPrice} from '@/lib/price-format';

/** A trade drawn on the chart. Side and amount come from the indexed tape; nothing here is estimated. */
export type ChartTrade={id:string;time:number;side:'buy'|'sell';amount:number};
export type ChartVolume={time:number;volume:number};
type Point={time:number;value:number|null};

const H=330,TOP=14,PRICE_BOTTOM=232,VOLUME_BASE=296,AXIS=70;
function hash(text:string){let h=0;for(let i=0;i<text.length;i++)h=(h*31+text.charCodeAt(i))|0;return h;}

/** Grainpad's native chart: the price as an ink line, each indexed trade as a grain on it (buy = filled orange square,
 * sell = hollow square, size by amount) and volume as stacks of small squares under the baseline. Empty periods stay empty. */
export function GrainsChart({points,interval,now,unit,label,trades,volumes,resolution}:{points:Point[];interval:number;now:number;unit:string;label:string;trades:ChartTrade[];volumes:ChartVolume[];resolution:number}){
 const frame=useRef<HTMLDivElement>(null),[width,setWidth]=useState(800),[hover,setHover]=useState<number|null>(null);
 useEffect(()=>{const node=frame.current;if(!node)return;const observer=new ResizeObserver(([entry])=>setWidth(Math.max(280,Math.round(entry.contentRect.width))));observer.observe(node);return()=>observer.disconnect();},[]);
 const valid=useMemo(()=>points.filter((p):p is {time:number;value:number}=>p.value!==null&&Number.isFinite(p.value)),[points]);
 const right=width-AXIS,start=now-interval;
 const scale=useMemo(()=>{
  if(!valid.length)return null;
  const values=valid.map(p=>p.value),min=Math.min(...values),max=Math.max(...values),padding=Math.max((max-min)*.16,max*.01,Number.MIN_VALUE);
  const lo=Math.max(0,min-padding),hi=max+padding;
  return {lo,hi,x:(t:number)=>8+(t-start)/interval*(right-8),y:(v:number)=>TOP+(1-(v-lo)/(hi-lo||1))*(PRICE_BOTTOM-TOP)};
 },[valid,start,interval,right]);
 if(!scale)return null;
 const {x,y,lo,hi}=scale,tick=(v:number)=>unit==='usd'?formatNumber(v,{sig:3,prefix:'$'}):formatNumber(v,{sig:3});
 const coords=valid.map(p=>[x(p.time),y(p.value)] as const);
 const line=coords.map(([cx,cy],i)=>`${i?'L':'M'}${cx.toFixed(1)},${cy.toFixed(1)}`).join(' ');
 const area=coords.length>1?`${line} L${coords.at(-1)![0].toFixed(1)},${PRICE_BOTTOM} L${coords[0][0].toFixed(1)},${PRICE_BOTTOM}Z`:'';
 // A trade sits on the line at its time; the line is the record, the grain marks who moved it.
 const valueAt=(t:number)=>{const i=valid.findIndex(p=>p.time>=t);if(i<=0)return valid[Math.max(0,i)]?.value??valid.at(-1)!.value;const a=valid[i-1],b=valid[i];return a.value+(b.value-a.value)*((t-a.time)/((b.time-a.time)||1));};
 const visibleTrades=trades.filter(t=>t.time>=start&&t.time<=now&&Number.isFinite(t.amount)&&t.amount>0);
 const maxAmount=Math.max(0,...visibleTrades.map(t=>t.amount));
 const visibleVolumes=volumes.filter(v=>v.time+resolution>=start&&v.time<=now&&v.volume>0),maxVolume=Math.max(0,...visibleVolumes.map(v=>v.volume));
 const bucketWidth=Math.max(3,resolution/interval*(right-8));
 const last=valid.at(-1)!,lx=x(last.time),ly=y(last.value);
 const ticks=[0,1,2,3,4].map(i=>lo+(hi-lo)*(4-i)/4);
 const timeTicks=[0,1,2,3].map(i=>start+interval*i/3);
 const timeLabel=(t:number)=>interval<=300?new Date(t*1000).toLocaleTimeString('en-US',{hour12:false,minute:'2-digit',second:'2-digit'}):new Date(t*1000).toLocaleString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false});
 const hovered=hover===null?null:valid.reduce((best,p)=>Math.abs(x(p.time)-hover)<Math.abs(x(best.time)-hover)?p:best,valid[0]);
 return <div ref={frame} className="grains-chart" role="img" aria-label={`${label}${interval===86400?' · past 24 hours':''}. Last ${formatPrice(last.value,unit==='usd'?'USD':unit)}. ${visibleTrades.length} indexed trades shown as grains.`}
  onPointerMove={e=>{const box=e.currentTarget.getBoundingClientRect();setHover(e.clientX-box.left);}} onPointerLeave={()=>setHover(null)}>
  <svg viewBox={`0 0 ${width} ${H}`} width="100%" height={H} aria-hidden="true">
   {ticks.map((v,i)=>{const ty=y(v);return <g key={i}><line x1={8} x2={right} y1={ty} y2={ty} className="gc-grid"/><text x={right+8} y={ty+3.5} className="gc-tick">{tick(v)}</text></g>;})}
   {area&&<path d={area} className="gc-area"/>}
   <path d={line} className="gc-line"/>
   {visibleVolumes.map(v=>{const trades=visibleTrades.filter(t=>t.time>=v.time&&t.time<v.time+resolution),buy=trades.filter(t=>t.side==='buy').reduce((s,t)=>s+t.amount,0),sell=trades.filter(t=>t.side==='sell').reduce((s,t)=>s+t.amount,0);
    const count=Math.max(1,Math.round(v.volume/maxVolume*7)),bx=x(v.time)+bucketWidth*.18,bw=Math.max(2,bucketWidth*.64),cls=buy>sell?'gc-vol is-buy':'gc-vol';
    return <g key={v.time}>{Array.from({length:count},(_,j)=><rect key={j} x={bx} y={VOLUME_BASE-(j+1)*7} width={bw} height={5} rx={1} className={cls}/>)}</g>;})}
   <line x1={8} x2={right} y1={VOLUME_BASE+2} y2={VOLUME_BASE+2} className="gc-base"/>
   {visibleTrades.map(t=>{const cx=x(t.time),cy=y(valueAt(t.time)),size=4+9*Math.sqrt(t.amount/(maxAmount||1)),rot=(hash(t.id)%50)-25;
    return <rect key={t.id} x={cx-size/2} y={cy-size/2} width={size} height={size} transform={`rotate(${rot} ${cx.toFixed(1)} ${cy.toFixed(1)})`} className={t.side==='buy'?'gc-grain is-buy':'gc-grain is-sell'}/>;})}
   <circle cx={lx} cy={ly} r={13} className="gc-ring"/><circle cx={lx} cy={ly} r={6} className="gc-last"/>
   {timeTicks.map((t,i)=><text key={i} x={i===3?right:x(t)} y={H-4} textAnchor={i===0?'start':i===3?'end':'middle'} className="gc-tick">{timeLabel(t)}</text>)}
   {hovered&&<line x1={x(hovered.time)} x2={x(hovered.time)} y1={TOP} y2={VOLUME_BASE} className="gc-cursor"/>}
  </svg>
  {hovered&&<div className="grain-tooltip gc-tooltip" style={{left:Math.min(width-150,Math.max(0,x(hovered.time)+10))}}><strong>{formatPrice(hovered.value,unit==='usd'?'USD':unit)}</strong><span>{new Date(hovered.time*1000).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div>}
 </div>;
}
