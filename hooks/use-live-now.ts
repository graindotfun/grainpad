'use client';
import {useEffect,useState} from 'react';
import {nextTimeBoundary} from '@/lib/token-time';
/** Wall-clock time that stays current while a page is open. It re-renders every `tickMs`, at the exact moment the next NEW badge expires, and when the tab becomes visible again.
 * `initial` renders the first (server) pass so hydration matches; the client clock takes over right after mount. */
export function useLiveNow(initial?:number,launchTimes:readonly (number|null)[]=[],tickMs=30_000):number{
 const [now,setNow]=useState(()=>initial??Date.now());
 const boundary=nextTimeBoundary(now,launchTimes);
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>;
  const schedule=(first:boolean)=>{
   const current=Date.now();
   timer=setTimeout(()=>{setNow(Date.now());schedule(false);},first?0:Math.max(1,Math.min(tickMs,boundary===null?tickMs:boundary-current+5)));
  };
  const refresh=()=>{if(document.visibilityState==='visible')setNow(Date.now());};
  schedule(true);document.addEventListener('visibilitychange',refresh);
  return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',refresh);};
 },[tickMs,boundary]);
 return now;
}
