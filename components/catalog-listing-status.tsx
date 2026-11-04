"use client";
import {useEffect,useState} from 'react';
import {startViewerPolling} from '@/lib/viewer-polling.mjs';
type Listing={title:string;detail:string;listed:boolean;expiresAt?:number|null};
export function CatalogListingStatus({network,token}:{network:'mainnet-beta'|'robinhood:mainnet';token:string}){
 const [saved,setSaved]=useState<{network:string;token:string;value:Listing}|null>(null);
 const status=saved?.network===network&&saved.token===token?saved.value:null;
 useEffect(()=>{if(!status?.listed||!status.expiresAt)return;const timer=setTimeout(()=>setSaved({network,token,value:{title:'Checking Monero verification',detail:'Waiting for a fresh verification of the Monero record. Keep the original launch receipt.',listed:false}}),Math.max(0,status.expiresAt-Date.now()));return()=>clearTimeout(timer);},[status,network,token]);
 useEffect(()=>{
  return startViewerPolling(async(signal:AbortSignal)=>{
   try{
    const r=await fetch('/api/catalog/status?'+new URLSearchParams({network,token}),{cache:'no-store',signal});
    const body=await r.json() as Partial<Listing>&{error?:string};if(signal.aborted)return;
    setSaved({network,token,value:r.ok&&typeof body.title==='string'&&typeof body.detail==='string'?{title:body.title,detail:body.detail,listed:body.listed===true,expiresAt:body.expiresAt}:{title:'Checking catalog listing',detail:body.error??'Keep your original receipt. Do not launch again.',listed:false}});
   }catch{if(!signal.aborted)setSaved({network,token,value:{title:'Listing verification unavailable',detail:'Your token is saved. Catalog listing waits for verified Monero evidence and 10 confirmations. Do not launch again.',listed:false}});}
  },{intervalMs:30_000});
 },[network,token]);
 return <section className="setup-note" aria-label="Catalog listing status" role="status" aria-live="polite"><strong>{status?.title??'Checking Monero launch record'}</strong><p>{status?.detail??'Your token creation is confirmed. It will appear in the catalog only after its Monero record is verified with 10 confirmations. Do not launch again.'}</p></section>;
}
