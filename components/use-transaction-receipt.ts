"use client";
import {useCallback,useEffect,useState} from 'react';
type Receipt={signature:string;status:'pending'|'unknown'|'confirmed'|'finalized'|'failed'|'expired';reason?:string};
/** settleAtConfirmed: trades settle at supermajority confirmation (about a second) instead of waiting
 * for finality; a confirmed signature cannot execute twice, so a new trade may start. */
export function useTransactionReceipt(key:string,{settleAtConfirmed=false}:{settleAtConfirmed?:boolean}={}){
 const [receipt,setReceipt]=useState<Receipt|null>(null),[restored,setRestored]=useState(false);
 // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate an externally persisted receipt after SSR.
 useEffect(()=>{let saved='';try{saved=localStorage.getItem(key)||'';}catch{}setReceipt(saved?{signature:saved,status:'pending'}:null);setRestored(true);},[key]);
 const track=useCallback((signature:string)=>{try{localStorage.setItem(key,signature);}catch{}setReceipt({signature,status:'pending'});},[key]);
 const settledStates=settleAtConfirmed?['confirmed','finalized','failed','expired']:['finalized','failed','expired'];
 const signature=receipt?.signature,terminal=receipt&&settledStates.includes(receipt.status);
 useEffect(()=>{
  if(!signature||terminal)return;
  const settled=settleAtConfirmed?['confirmed','finalized','failed','expired']:['finalized','failed','expired'];
  let cancelled=false,timer:ReturnType<typeof setTimeout>,attempt=0;
  const poll=async()=>{let done=false;try{const {inspectSubmitted}=await import('@/lib/launch');const result=await inspectSubmitted(signature,{acceptConfirmed:settleAtConfirmed});if(cancelled)return;setReceipt({signature,...result} as Receipt);done=settled.includes(result.status);if(done){try{if(localStorage.getItem(key)===signature)localStorage.removeItem(key);}catch{}}}catch{if(!cancelled)setReceipt({signature,status:'unknown',reason:'Confirmation is temporarily unavailable. We are checking again automatically.'});}
   // Fast trades poll every second while a landing is likely, then back off inside the per-signature read budget.
   if(!cancelled&&!done)timer=setTimeout(poll,settleAtConfirmed?(++attempt<20?1000:attempt<60?2000:attempt<75?4000:15000):(++attempt<15?4000:15000));
  };void poll();return()=>{cancelled=true;clearTimeout(timer);};
 },[signature,terminal,key,settleAtConfirmed]);
 const clearResolved=()=>{if(terminal)setReceipt(null);};
 return {receipt,track,clearResolved,locked:!restored||!!receipt&&!terminal};
}
