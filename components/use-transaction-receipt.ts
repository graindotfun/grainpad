"use client";
import {useCallback,useEffect,useState} from 'react';
type Receipt={signature:string;status:'pending'|'unknown'|'finalized'|'failed'|'expired';reason?:string};
export function useTransactionReceipt(key:string){
 const [receipt,setReceipt]=useState<Receipt|null>(null),[restored,setRestored]=useState(false);
 // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate an externally persisted receipt after SSR.
 useEffect(()=>{let saved='';try{saved=localStorage.getItem(key)||'';}catch{}setReceipt(saved?{signature:saved,status:'pending'}:null);setRestored(true);},[key]);
 const track=useCallback((signature:string)=>{try{localStorage.setItem(key,signature);}catch{}setReceipt({signature,status:'pending'});},[key]);
 const signature=receipt?.signature,terminal=receipt&&['finalized','failed','expired'].includes(receipt.status);
 useEffect(()=>{
  if(!signature||terminal)return;
  let cancelled=false,timer:ReturnType<typeof setTimeout>,attempt=0;
  const poll=async()=>{let settled=false;try{const {inspectSubmitted}=await import('@/lib/launch');const result=await inspectSubmitted(signature);if(cancelled)return;setReceipt({signature,...result} as Receipt);settled=['finalized','failed','expired'].includes(result.status);if(settled){try{if(localStorage.getItem(key)===signature)localStorage.removeItem(key);}catch{}}}catch{if(!cancelled)setReceipt({signature,status:'unknown',reason:'Confirmation is temporarily unavailable. We are checking again automatically.'});}
   if(!cancelled&&!settled)timer=setTimeout(poll,++attempt<15?4000:15000);
  };void poll();return()=>{cancelled=true;clearTimeout(timer);};
 },[signature,terminal,key]);
 const clearResolved=()=>{if(terminal)setReceipt(null);};
 return {receipt,track,clearResolved,locked:!restored||!!receipt&&!terminal};
}
