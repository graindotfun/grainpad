'use client';
import Image from 'next/image';
import {useState,type ReactNode} from 'react';
const TONES=['o','k','g','w'] as const;
function tone(seed:string){let h=0;for(let i=0;i<seed.length;i++)h=(h*31+seed.charCodeAt(i))>>>0;return TONES[h%TONES.length];}
/** Square token artwork. Same accepted sources as TokenImage; anything else, or a failed load, shows the ticker's first letter on a brand tone. */
export function TokenTile({src,symbol,seed,children,small=false}:{src?:string;symbol:string;seed:string;children?:ReactNode;small?:boolean}){
 const [failed,setFailed]=useState<string|null>(null);
 const valid=typeof src==='string'&&(src.startsWith('https://')||src.startsWith('/api/assets/')||src.startsWith('/brand/'));
 const letter=Array.from(symbol.trim())[0]?.toUpperCase()||'?';
 return <div className={`gx-tile is-${tone(seed)}${small?' is-small':''}`}>
  {valid&&failed!==src?<Image unoptimized src={src} alt="" width={small?72:320} height={small?72:272} loading="lazy" onError={()=>setFailed(src)}/>:<span aria-hidden="true">{letter}</span>}
  {children&&<div className="gx-tile-chip">{children}</div>}
 </div>;
}
