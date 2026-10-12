"use client";
import Image from 'next/image';
import {useState} from 'react';
import {displayAssetSrc} from '@/lib/asset-src.mjs';
/** Fixed dimensions preserve the row when an image is absent, invalid or fails to load. */
export function TokenImage({src:rawSrc,symbol,size=48}:{src?:string;symbol:string;size?:number}){
 const [failed,setFailed]=useState<string|null>(null),src=displayAssetSrc(rawSrc);
 const valid=typeof src==='string'&&(src.startsWith('https://')||src.startsWith('/api/assets/')||src.startsWith('/brand/'));
 return <span className="token-avatar" style={{width:size,height:size}} aria-hidden="true">
  {valid&&failed!==src?<Image unoptimized src={src} alt="" width={size} height={size} loading="lazy" onError={()=>setFailed(src)}/>:<span>{Array.from(symbol.trim()).slice(0,2).join('').toUpperCase()||'?'}</span>}
 </span>;
}
