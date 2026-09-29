'use client';
import {useEffect,useState} from 'react';
import type {Network} from '@/lib/site-config';
import {blockhashCountdown,HEIGHT_POLL_MS} from '@/lib/blockhash-window.mjs';
export function useBlockhashCountdown(network:Network,lastValidBlockHeight:number|undefined,enabled:boolean){
 const [samples,setSamples]=useState<{height:number;at:number}[]>([]),[now,setNow]=useState(Date.now());
 useEffect(()=>{
  if(!enabled){setSamples([]);return;}
  let stopped=false,timer:ReturnType<typeof setTimeout>;
  setSamples([]);
  async function poll(){try{
   const {rpc}=await import('@/lib/launch');
   const height=await rpc(network).getBlockHeight('confirmed');
   if(!stopped){const at=Date.now();setNow(at);setSamples(previous=>previous.length&&height<previous.at(-1)!.height?[]:[...previous,{height,at}].slice(-6));}
  }catch{if(!stopped)setSamples([]);}finally{if(!stopped)timer=setTimeout(poll,HEIGHT_POLL_MS);}}
  void poll();const tick=setInterval(()=>setNow(Date.now()),1000);
  return()=>{stopped=true;clearTimeout(timer);clearInterval(tick);};
 },[network,enabled]);
 return blockhashCountdown(lastValidBlockHeight,samples,now);
}
