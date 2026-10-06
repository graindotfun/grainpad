'use client';
import {useEffect,useRef} from 'react';
import {liveChartPoints,smoothChartSegments} from '@/lib/live-chart.mjs';
import {formatNumber,formatPrice} from '@/lib/price-format';
import type {LiveTrade} from './use-live-market';
/** A moving 2-minute time window. Repaint follows the clock; prices follow real trade events. */
export function LiveMarketChart({events,multiplier,unit}:{events:LiveTrade[];multiplier:number;unit:string}){
 const canvas=useRef<HTMLCanvasElement>(null),values=useRef({events,multiplier,unit});
 useEffect(()=>{values.current={events,multiplier,unit};},[events,multiplier,unit]);
 useEffect(()=>{
  const node=canvas.current;if(!node)return;const ctx=node.getContext('2d');if(!ctx)return;
  const media=matchMedia('(prefers-reduced-motion: reduce)');let frame=0,previous=performance.now(),tip:number|null=null,low:number|null=null,high:number|null=null;
  const draw=(stamp:number)=>{
   const {events,multiplier,unit}=values.current,now=Date.now()/1000,points=liveChartPoints(events,multiplier,now);
   const w=node.clientWidth,h=node.clientHeight,dpr=Math.min(devicePixelRatio||1,2),dt=Math.min(100,stamp-previous);previous=stamp;
   if(node.width!==Math.round(w*dpr)||node.height!==Math.round(h*dpr)){node.width=Math.round(w*dpr);node.height=Math.round(h*dpr);}
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
   const style=getComputedStyle(node),orange=style.getPropertyValue('--grain-orange').trim()||'currentColor',tick=style.getPropertyValue('--chart-tick').trim()||'#889294',grid=style.getPropertyValue('--chart-grid').trim()||'#303638';
   const left=2,right=w-74,top=14,bottom=h-28;
   if(points.length&&right>left){
    const target=points.at(-1)!.value,alpha=media.matches?1:1-Math.exp(-dt/45);tip=tip===null?target:tip+(target-tip)*alpha;
    const min=Math.min(...points.map(point=>point.value)),max=Math.max(...points.map(point=>point.value)),padding=Math.max((max-min)*.16,max*.003,Number.MIN_VALUE);
    const nextLow=Math.max(0,min-padding),nextHigh=max+padding;low=low===null?nextLow:low+(nextLow-low)*alpha;high=high===null?nextHigh:high+(nextHigh-high)*alpha;
    const x=(time:number)=>left+(time-(now-120))/120*(right-left),y=(value:number)=>bottom-(value-low!)/(high!-low!)*(bottom-top);
    ctx.font='10px "IBM Plex Mono",monospace';ctx.fillStyle=tick;ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.setLineDash([2,4]);
    for(let i=0;i<5;i++){const yy=top+(bottom-top)*i/4;ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();const value=high-(high-low)*i/4;ctx.fillText(formatNumber(value,{sig:4,prefix:unit==='usd'?'$':''}),right+10,yy+3);}
    ctx.setLineDash([]);ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();
    const coordinates=points.map((point,index)=>({x:x(point.time),y:y(index===points.length-1?tip!:point.value)})),path=new Path2D();path.moveTo(coordinates[0].x,coordinates[0].y);for(const segment of smoothChartSegments(coordinates))path.bezierCurveTo(segment.x1,segment.y1,segment.x2,segment.y2,segment.x,segment.y);
    const area=new Path2D(path);area.lineTo(right,bottom);area.lineTo(x(points[0].time),bottom);area.closePath();const gradient=ctx.createLinearGradient(0,top,0,bottom);gradient.addColorStop(0,orange);gradient.addColorStop(1,'transparent');ctx.fillStyle=gradient;ctx.globalAlpha=.16;ctx.fill(area);ctx.globalAlpha=1;ctx.strokeStyle=orange;ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke(path);ctx.restore();
    const yy=y(tip),pulse=media.matches?0:(stamp%1600)/1600;ctx.beginPath();ctx.arc(right,yy,4+9*pulse,0,Math.PI*2);ctx.strokeStyle=orange;ctx.globalAlpha=1-pulse;ctx.lineWidth=1;ctx.stroke();ctx.globalAlpha=1;ctx.beginPath();ctx.arc(right,yy,4,0,Math.PI*2);ctx.fillStyle=orange;ctx.fill();
    ctx.fillStyle=tick;for(let i=0;i<4;i++){const time=now-120+120*i/3,text=new Date(time*1000).toLocaleTimeString('en-US',{hour12:false,minute:'2-digit',second:'2-digit'});ctx.fillText(text,left+(right-left)*i/3-(i===3?30:0),h-6);}
   }
   frame=requestAnimationFrame(draw);
  };frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
 },[]);
 const last=events.at(-1);return <canvas ref={canvas} className="grain-live-chart" role="img" aria-label={`Live confirmed trades, moving two-minute window. Last execution ${last?formatPrice(last.value*multiplier,unit==='usd'?'USD':unit):'unavailable'}.`}/>;
}
