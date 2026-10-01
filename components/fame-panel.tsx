'use client';
import {useEffect,useState,useSyncExternalStore} from 'react';
import {walletSession} from '@/lib/wallet-session.mjs';
import {fameMessage} from '@/lib/wallet-fame.mjs';

export type FameSummary={target:string;score:number;up:number;down:number;viewer?:{wallet:string;value:number;updatedAt:number;canVote:boolean;reason:string|null;message:string}|null};
const signedScore=(n:number)=>n>0?`+${n}`:String(n);
const subscribe=(fn:()=>void)=>walletSession.subscribe(fn);

/** Profile reputation: a score for everyone, and a vote only for a wallet with a username and verified X. */
export function FamePanel({target,initial}:{target:string;initial:FameSummary}){
 const session=useSyncExternalStore(subscribe,()=>walletSession.getSnapshot(),()=>null);
 const owner=session?.owner||'';
 const [fame,setFame]=useState<FameSummary>(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  fetch(`/api/identity/fame?target=${encodeURIComponent(target)}${owner?`&viewer=${encodeURIComponent(owner)}`:''}`,{signal:controller.signal,cache:'no-store'})
   .then(r=>r.ok?r.json():null).then(next=>{if(next)setFame(next as FameSummary);}).catch(()=>{});
  return()=>controller.abort();
 },[target,owner]);
 const viewer=owner&&fame.viewer?.wallet===owner?fame.viewer:null;
 async function cast(value:1|-1){
  if(!session||!viewer?.canVote)return;
  setBusy(true);setError('');
  try{
   const next=viewer.value===value?0:value;
   const payload={origin:window.location.origin,voter:owner,target,value:next,baseUpdatedAt:viewer.updatedAt,nonce:crypto.randomUUID(),expires:Date.now()+10*60*1000};
   const signed=await session.wallet.signMessage(new TextEncoder().encode(fameMessage(payload)));
   const bytes=signed instanceof Uint8Array?signed:signed.signature;
   const signature=(await import('bs58')).default.encode(bytes);
   const response=await fetch('/api/identity/fame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature})});
   const result=await response.json() as {error?:string;fame?:FameSummary};
   if(!response.ok||!result.fame)throw Error(result.error||'Fame vote failed.');
   setFame(result.fame);
  }catch(e){setError(e instanceof Error?e.message:'Fame vote failed.');}finally{setBusy(false);}
 }
 const note=!owner?'Connect a wallet to give fame.':viewer&&!viewer.canVote?viewer.message:'';
 return <section className="fame-panel" aria-label="Fame">
  <span className="fame-score" aria-live="polite">Fame {signedScore(fame.score)}</span>
  {viewer?.canVote&&<span className="fame-votes">
   <button type="button" aria-pressed={viewer.value===1} disabled={busy} onClick={()=>void cast(1)}>▲ Fame</button>
   <button type="button" aria-pressed={viewer.value===-1} disabled={busy} onClick={()=>void cast(-1)}>▼ Fame</button>
  </span>}
  {note&&<p className="fame-note">{note}</p>}
  {viewer?.canVote&&<p className="fame-note">One vote per profile. Select your vote again to withdraw it. Fame is a light signal, not proof of trust.</p>}
  {error&&<p className="fame-note" role="alert">{error}</p>}
 </section>;
}
