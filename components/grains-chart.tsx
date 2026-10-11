'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {formatNumber,formatPrice} from '@/lib/price-format';

/** A trade drawn on the chart. Side and amount come from the indexed tape; nothing here is estimated. */
export type ChartTrade={id:string;time:number;side:'buy'|'sell';amount:number};
type Point={time:number;value:number|null};
/** Indexed bars: when a bar has trades, its slice shows a solid grain. */
export type ChartActivity={time:number;trades:number};

const H=300,TOP=12,BOTTOM=262,AXIS=70,CELL=5,GAP=2,PITCH=CELL+GAP;
/** Axis time label for the window: seconds for short windows, clock time within a day, dates beyond. */
export function chartTimeLabel(t:number,interval:number){
 const d=new Date(t*1000);
 return interval<=300?d.toLocaleTimeString('en-US',{hour12:false,minute:'2-digit',second:'2-digit'}):interval<=86400?d.toLocaleString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false}):d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

/** Grainpad's own chart: the price as a field of grains. Each column is one slice of time, filled with grains up to the
 * price at its close, like sand settling in a glass. The top grain is solid when the slice had indexed trades and
 * hollow when nothing traded and the last price carried. Empty history stays empty; nothing is drawn before the first
 * observed price. Buy and sell counts come from the tape and appear only where the tape covers the slice. */
export function GrainsChart({points,interval,now,unit,label,trades=[],activity=[],resolution}:{points:Point[];interval:number;now:number;unit:string;label:string;trades?:ChartTrade[];activity?:ChartActivity[];resolution:number}){
 const frame=useRef<HTMLDivElement>(null),[width,setWidth]=useState(800),[hover,setHover]=useState<number|null>(null);
 useEffect(()=>{const node=frame.current;if(!node)return;const observer=new ResizeObserver(([entry])=>setWidth(Math.max(280,Math.round(entry.contentRect.width))));observer.observe(node);return()=>observer.disconnect();},[]);
 const valid=useMemo(()=>points.filter((p):p is {time:number;value:number}=>p.value!==null&&Number.isFinite(p.value)).sort((a,b)=>a.time-b.time),[points]);
 const right=width-AXIS,start=now-interval,columns=Math.max(12,Math.floor((right-8+GAP)/PITCH)),rows=Math.floor((BOTTOM-TOP+GAP)/PITCH),slice=interval/columns;
 const field=useMemo(()=>{
  if(!valid.length)return null;
  const values=valid.map(p=>p.value),min=Math.min(...values),max=Math.max(...values),padding=Math.max((max-min)*.12,max*.01,Number.MIN_VALUE);
  const lo=Math.max(0,min-padding*2),hi=max+padding;
  // Price at a slice's close: the last observation at or before it (step, never interpolated across a gap).
  let j=0;const cols=[];
  for(let i=0;i<columns;i++){
   const end=start+(i+1)*slice;while(j<valid.length&&valid[j].time<=end)j++;
   const value=j?valid[j-1].value:null;
   const inSlice=trades.filter(t=>t.time>end-slice&&t.time<=end&&Number.isFinite(t.amount)&&t.amount>0);
   const buys=inSlice.filter(t=>t.side==='buy').length,sells=inSlice.length-buys;
   // A bar overlaps the slice when its own period [time, time+resolution) intersects (end-slice, end].
   const traded=inSlice.length>0||activity.some(a=>a.trades>0&&a.time<end&&a.time+resolution>end-slice);
   cols.push({end,value,height:value===null?0:Math.max(1,Math.round((value-lo)/((hi-lo)||1)*rows)),traded,buys,sells});
  }
  return {lo,hi,cols};
 },[valid,trades,activity,resolution,columns,rows,start,slice]);
 if(!field)return null;
 const {lo,hi,cols}=field,tick=(v:number)=>unit==='usd'?formatNumber(v,{sig:3,prefix:'$'}):formatNumber(v,{sig:3});
 const x=(i:number)=>8+i*PITCH,y=(r:number)=>BOTTOM-(r+1)*PITCH+GAP;
 const ticks=[0,1,2,3].map(i=>lo+(hi-lo)*(3-i)/3),valueY=(v:number)=>BOTTOM-(v-lo)/((hi-lo)||1)*(BOTTOM-TOP);
 const timeTicks=[0,1,2,3].map(i=>start+interval*i/3);
 const hoverIndex=hover===null?null:Math.min(columns-1,Math.max(0,Math.floor((hover-8)/PITCH)));
 const hovered=hoverIndex===null?null:cols[hoverIndex],lastIndex=cols.findLastIndex(c=>c.value!==null),last=cols[lastIndex];
 return <div ref={frame} className="grains-chart" role="img" aria-label={`${label}${interval===86400?' · past 24 hours':''}. Last ${last?formatPrice(last.value,unit==='usd'?'USD':unit):'unavailable'}. Each column is one time slice; a solid top grain marks a slice with trades.`}
  onPointerMove={e=>{const box=e.currentTarget.getBoundingClientRect();setHover(e.clientX-box.left);}} onPointerLeave={()=>setHover(null)}>
  <svg viewBox={`0 0 ${width} ${H}`} width="100%" height={H} aria-hidden="true">
   {ticks.map((v,i)=><text key={i} x={right+10} y={valueY(v)+3.5} className="gc-tick">{tick(v)}</text>)}
   {cols.map((c,i)=>c.height>0&&<g key={i} className={i===hoverIndex?'gc-col is-hover':'gc-col'}>
    {Array.from({length:c.height-1},(_,r)=><rect key={r} x={x(i)} y={y(r)} width={CELL} height={CELL} rx={1.2} className="gc-sand" style={{opacity:.16+.5*((r+1)/c.height)**2}}/>)}
    {c.traded?<rect x={x(i)} y={y(c.height-1)} width={CELL} height={CELL} rx={1.2} className="gc-cap is-traded"/>:<rect x={x(i)+.6} y={y(c.height-1)+.6} width={CELL-1.2} height={CELL-1.2} rx={1} className="gc-cap is-carried"/>}
   </g>)}
   {last&&<g className="gc-now" style={{transform:`translate(${x(lastIndex)+CELL/2}px, ${y(last.height-1)+CELL/2}px)`}}><circle r={9} className="gc-ring"/></g>}
   {timeTicks.map((t,i)=><text key={i} x={i===3?right:i===0?8:x(Math.round((t-start)/slice))} y={H-6} textAnchor={i===0?'start':i===3?'end':'middle'} className="gc-tick">{chartTimeLabel(t,interval)}</text>)}
  </svg>
  {hovered&&hovered.value!==null&&<div className="grain-tooltip gc-tooltip" style={{left:Math.min(width-170,Math.max(0,x(hoverIndex!)+12))}}><strong>{formatPrice(hovered.value,unit==='usd'?'USD':unit)}</strong><span>{new Date(hovered.end*1000).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span><span>{hovered.buys+hovered.sells?`${hovered.buys} buy${hovered.buys===1?'':'s'} · ${hovered.sells} sell${hovered.sells===1?'':'s'}`:hovered.traded?'traded':'no trades · last price carried'}</span></div>}
 </div>;
}
