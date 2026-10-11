"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import {Check} from "lucide-react";

/** Shared, display-only step indicator for every launch mode. It never gates an action. */
export function LaunchSteps({steps,current,label="Launch steps"}:{steps:string[];current:number;label?:string}){
 return <ol className="launch-steps" aria-label={label}>{steps.map((step,index)=>{const n=index+1,state=n<current?"done":n===current?"current":"upcoming";return <li key={step} data-state={state} aria-current={state==="current"?"step":undefined}><span className="launch-steps-mark" aria-hidden="true">{state==="done"?<Check size={13}/>:String(n).padStart(2,"0")}</span><span className="launch-steps-label">{step}</span></li>;})}</ol>;
}

const FIELD="input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]),select,textarea";

/**
 * Layout-only wrapper for a launch step's one primary action and its hint. The action, its handler
 * and its disabled state are passed in unchanged as children.
 *
 * Children are the hint paragraph (a .launch-hint-full span, plus an optional aria-hidden
 * .launch-hint-short span shown instead on narrow screens) and the primary button.
 *
 * The bar stays in its place at the end of the form and only docks to the bottom of the viewport
 * once the first field has scrolled clear of it, so it never covers the step indicator or the first
 * field on load. While docked it sits `--launch-dock-gap` above the viewport bottom; on wide screens
 * that gap clears the site-wide price pill, so the two never overlap. Docking uses position:sticky,
 * which keeps the bar's space in the flow: the last field and its validation text are never hidden.
 */
export function LaunchActionBar({label,children}:{label:string;children:ReactNode}){
 const bar=useRef<HTMLDivElement>(null),mark=useRef<HTMLSpanElement>(null),[docked,setDocked]=useState(false);
 useEffect(()=>{
  const node=bar.current,start=mark.current;if(!node||!start)return;let frame=0;
  const measure=()=>{
   frame=0;const style=getComputedStyle(node),declared=parseFloat(style.getPropertyValue("--launch-dock-gap")),gap=Number.isFinite(declared)?declared:window.matchMedia("(max-width:700px)").matches?0:68;
   const stuckTop=window.innerHeight-gap-node.offsetHeight,natural=start.getBoundingClientRect().bottom+(parseFloat(style.marginTop)||0);
   // In place and clear of the bottom band: nothing to do.
   if(natural<=stuckTop){setDocked(false);return;}
   const flow=node.closest(".launch-flow"),anchor=[...(flow?.querySelectorAll(FIELD)??[])].find(field=>field.getClientRects().length)??flow?.querySelector(".launch-steps");
   const anchorBottom=anchor?anchor.getBoundingClientRect().bottom:-Infinity;
   // Dock once the first field is clear of the docked bar; also whenever the bar would otherwise sit in the bottom band.
   setDocked(anchorBottom<=stuckTop||natural<window.innerHeight);
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
  const resize=new ResizeObserver(schedule);resize.observe(node);const flow=node.closest(".launch-flow");if(flow)resize.observe(flow);
  measure();window.addEventListener("scroll",schedule,{passive:true});window.addEventListener("resize",schedule);
  return()=>{if(frame)cancelAnimationFrame(frame);resize.disconnect();window.removeEventListener("scroll",schedule);window.removeEventListener("resize",schedule);};
 },[]);
 return <><span ref={mark} className="launch-step-actions-mark" aria-hidden="true"/><div ref={bar} className="launch-step-actions" data-dock={docked?"floating":"inline"} role="group" aria-label={label}>
  {children}
 </div></>;
}
