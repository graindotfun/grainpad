"use client";
import {useEffect,useEffectEvent,type RefObject} from 'react';
import {walletSession} from '@/lib/wallet-session.mjs';
import type {Wallet} from '@/lib/wallet';
/** Bind existing action guards to the single site wallet; clear stale reviews on every identity change. */
export function useSharedWallet(ref:RefObject<Wallet|null>,setOwner:(value:string)=>void,onChange?:()=>void,allowedOwner?:string){
 const changed=useEffectEvent(()=>onChange?.());
 useEffect(()=>{
  const sync=()=>{const connected=walletSession.getSnapshot();const next=allowedOwner&&connected?.owner!==allowedOwner?null:connected;ref.current=next?.wallet||null;setOwner(next?.owner||'');changed();};
  const unsubscribe=walletSession.subscribe(sync);sync();return unsubscribe;
 },[ref,setOwner,allowedOwner]);
}
