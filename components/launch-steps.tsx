"use client";
import {useEffect,useRef,useState,useCallback,type ReactNode} from "react";
import {createPortal} from 'react-dom';
import {Check} from "lucide-react";
export function LaunchSteps({steps,current,label="Launch steps"}:{steps:string[];current:number;label?:string}){return <ol className="launch-steps" aria-label={label}>{steps.map((step,index)=>{const n=index+1,state=n<current?"done":n===current?"current":"upcoming";return <li key={step} data-state={state} aria-current={state==="current"?"step":undefined}><span className="launch-steps-mark" aria-hidden="true">{state==="done"?<Check size={13}/>:String(n).padStart(2,"0")}</span><span className="launch-steps-label">{step}</span></li>;})}</ol>;}
const FIELD='input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]),select,textarea';
type Dock={left:number;width:number;bottom:number;height:number};
/** Display-only docking. Portaling keeps the primary action outside clipped/transformed form ancestors. */
export function LaunchActionBar({label,children}:{label:string;children:ReactNode}){
 const observer=useRef<ResizeObserver|null>(null);const bar=useRef<HTMLDivElement>(null),mark=useRef<HTMLSpanElement>(null),[dock,setDock]=useState<Dock|null>(null);
 const setBar=useCallback((node:HTMLDivElement|null)=>{if(bar.current)observer.current?.unobserve(bar.current);bar.current=node;if(node)observer.current?.observe(node);},[]);
 useEffect(()=>{const start=mark.current;if(!start)return;const flow=start.closest('.launch-flow');if(!flow)return;let frame=0;
 const measure=()=>{frame=0;const node=bar.current;if(!node)return;const box=flow.getBoundingClientRect(),header=document.querySelector('.site-header')?.getBoundingClientRect();const mobile=window.matchMedia('(max-width:700px)').matches;
 const bottom=header&&header.top>window.innerHeight/2?Math.max(0,window.innerHeight-header.top)+12:mobile?12:68;
 const top=header&&header.top<window.innerHeight/2&&header.bottom>0?header.bottom+12:12;
 const height=node.offsetHeight,target=window.innerHeight-bottom-height;
 const anchor=[...flow.querySelectorAll(FIELD)].find(field=>field.getClientRects().length)||flow.querySelector('.launch-steps');
 const anchorBottom=anchor?.getBoundingClientRect().bottom??box.top;
 const available=box.bottom>top&&box.top<window.innerHeight-bottom&&target>=top&&anchorBottom<target;
 const next=available?{left:box.left+(mobile?0:16),width:box.width-(mobile?0:32),bottom,height}:null;
 setDock(current=>current?.left===next?.left&&current?.width===next?.width&&current?.bottom===next?.bottom&&current?.height===next?.height?current:next);
 };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};const resize=new ResizeObserver(schedule);observer.current=resize;resize.observe(flow);if(bar.current)resize.observe(bar.current);const header=document.querySelector('.site-header');if(header)resize.observe(header);
 measure();window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);
 return()=>{if(frame)cancelAnimationFrame(frame);resize.disconnect();observer.current=null;window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);};},[]);
 const content=<div ref={setBar} className="launch-step-actions" data-dock={dock?'floating':'inline'} role="group" aria-label={label}>{children}</div>;
 return <><span ref={mark} className="launch-step-actions-mark" style={dock?{height:dock.height+28}:undefined} aria-hidden="true"/>{dock?createPortal(<div className="launch-flow launch-action-portal" style={{position:'fixed',left:dock.left,width:dock.width,bottom:dock.bottom,zIndex:40}}>{content}</div>,document.body):content}</>;
}
