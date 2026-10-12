"use client";
import {useEffect,useState} from 'react';
let announced=false;
/** Mounted only by the existing, unchanged B2 gate. One pulse per page lifetime. */
export function RulesBadge(){
 const [fresh,setFresh]=useState(false);
 useEffect(()=>{const frame=requestAnimationFrame(()=>{if(announced)return;announced=true;if(!matchMedia('(prefers-reduced-motion: reduce)').matches)setFresh(true);});return()=>cancelAnimationFrame(frame);},[]);
 useEffect(()=>{if(!fresh)return;const timer=setTimeout(()=>setFresh(false),700);return()=>clearTimeout(timer);},[fresh]);
 return <a className={`rules-badge${fresh?' is-new':''}`} href="/docs" onAnimationEnd={()=>setFresh(false)}>Launch rules enforced on-chain</a>;
}
