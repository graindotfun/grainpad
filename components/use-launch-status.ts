'use client';
import {useEffect,useState} from 'react';
import {startViewerPolling} from '@/lib/viewer-polling.mjs';
import {launchDeskStatus} from '@/lib/launch-desk-status.mjs';
import type {PlatformStatus} from '@/lib/platform-policy';
export type LaunchPlatform=PlatformStatus&{rewards?:{policyApproved:boolean;configurationReady:boolean;operational:boolean;holdersBps:number;grainBurnBps:number;grainpadBps:number;setup?:{publicAdmissionOpen:boolean}}};
export function useLaunchStatus(){
 const [platform,setPlatform]=useState<LaunchPlatform|null>(null),[error,setError]=useState(false),[now,setNow]=useState(0);
 useEffect(()=>{
  const stop=startViewerPolling(async(signal:AbortSignal)=>{
   try{const response=await fetch('/api/platform',{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(12000)])});if(!response.ok)throw Error();const body=await response.json() as LaunchPlatform;if(typeof body.active!=='boolean'||body.kind!=='grainpad')throw Error();if(!signal.aborted){setPlatform(body);setError(false);setNow(Date.now());}}
   catch{if(!signal.aborted){setError(true);setNow(Date.now());}}
  },{intervalMs:15000});
  const timer=setInterval(()=>setNow(Date.now()),5000);
  return()=>{stop();clearInterval(timer);};
 },[]);
 return {platform,status:launchDeskStatus(platform,{error,now})};
}
