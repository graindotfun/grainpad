"use client";
import {useCallback,useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from "react";
import {useSiteWallet,type SiteWalletConnection} from "./use-site-wallet";
import {openSiteWallet} from "@/lib/site-wallet-session.mjs";
import {grainpetIdentityOf} from "@/lib/grainpet-entry.mjs";
import {currentSessionIdentity,signInGrainpet} from "@/lib/grainpet-client";
type Phase="connect"|"checking"|"signing"|"signerr"|"unreachable";
const ROOM="/pet/room.html";
/** Wallet gate for the grainpet room. The room frame only exists while a wallet is connected AND the server has verified that wallet's identity.
 *  A changed identity tears the frame down first (after asking it to flush its save), so two wallets never share memory. */
export function GrainpetEntry(){
 const wallet=useSiteWallet(),identity=grainpetIdentityOf(wallet);
 const search=useSyncExternalStore(()=>()=>{},()=>window.location.search,()=>""),[active,setActive]=useState<string|null>(null),[phase,setPhase]=useState<Phase>("connect"),[note,setNote]=useState(""),[retry,setRetry]=useState(0);
 const stage=useRef<HTMLDivElement>(null),[fit,setFit]=useState<number|null>(null),frame=useRef<HTMLIFrameElement>(null),walletRef=useRef<SiteWalletConnection|null>(null),run=useRef(0),activeRef=useRef<string|null>(null),flushWaiters=useRef(new Map<number,()=>void>());
 useEffect(()=>{walletRef.current=wallet;activeRef.current=active;});
 const post=useCallback((message:Record<string,unknown>)=>{frame.current?.contentWindow?.postMessage({grainpet:1,theme:document.documentElement.dataset.theme==="dark"?"dark":"light",...message},window.location.origin);},[]);
 const flush=useCallback(()=>new Promise<void>(done=>{
  if(!frame.current?.contentWindow||!activeRef.current)return done();
  const id=Date.now();const timer=setTimeout(()=>{flushWaiters.current.delete(id);done();},2500);
  flushWaiters.current.set(id,()=>{clearTimeout(timer);done();});post({type:"flush",id});
 }),[post]);
 useEffect(()=>{
  const id=++run.current,current=()=>run.current===id;
  (async()=>{
   if(activeRef.current&&activeRef.current!==identity){await flush();if(!current())return;setActive(null);}
   if(!identity){setPhase("connect");setNote(walletRef.current?"grainpet runs on solana and robinhood chain. switch wallet to continue.":"");return;}
   if(activeRef.current===identity)return;
   setPhase("checking");setNote("");
   try{
    if(await currentSessionIdentity()!==identity){
     if(!current())return;setPhase("signing");
     await signInGrainpet(walletRef.current as SiteWalletConnection,current);
    }
    if(current())setActive(identity);
   }catch(e){
    if(!current())return;
    const message=e instanceof Error?e.message:"";
    setPhase(/fetch|network|check your sign-in/i.test(message)?"unreachable":"signerr");setNote(/reject|denied|cancel/i.test(message)?"no problem. sign in when you are ready.":"");
   }
  })();
 },[identity,retry,flush]);
 /* the room fills exactly what is left of the window under the site header, so the page itself never scrolls (a scrolling page lets the frame jump when it takes focus) */
 useLayoutEffect(()=>{
  const measure=()=>{const top=stage.current?.getBoundingClientRect().top??0;setFit(Math.max(420,Math.floor(window.innerHeight-top-8)));};
  measure();const t=window.setTimeout(measure,400);window.addEventListener("resize",measure);return()=>{window.clearTimeout(t);window.removeEventListener("resize",measure);};
 },[]);
 useEffect(()=>{
  const sync=()=>post({type:"theme"});
  window.addEventListener("grainpad:theme",sync);const watch=new MutationObserver(sync);watch.observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
  return()=>{window.removeEventListener("grainpad:theme",sync);watch.disconnect();};
 },[post]);
 useEffect(()=>{
  const onMessage=(e:MessageEvent)=>{
   if(e.origin!==window.location.origin||e.source!==frame.current?.contentWindow||e.data?.grainpet!==1)return;
   const d=e.data as {type:string;id?:number;code?:string};
   if(d.type==="hello")post(activeRef.current?{type:"init",identity:activeRef.current,review:new URLSearchParams(search).has("review")}:{type:"gate",phase,note});
   else if(d.type==="connect")openSiteWallet("solana");
   else if(d.type==="retry")setRetry(n=>n+1);
   else if(d.type==="flushed"&&d.id!==undefined){flushWaiters.current.get(d.id)?.();flushWaiters.current.delete(d.id);}
   else if(d.type==="error"&&activeRef.current){setActive(null);setPhase(d.code==="signin"?"signerr":"unreachable");setNote("");}
  };
  window.addEventListener("message",onMessage);return()=>window.removeEventListener("message",onMessage);
 },[post,phase,note,search]);
 useEffect(()=>{if(!active)post({type:"gate",phase,note});},[active,phase,note,post]);
 const src=active?`${ROOM}${search}`:`${ROOM}?gate=1`;
 return <div ref={stage} className="grainpet-stage" style={fit?{height:fit}:undefined}><iframe key={active??"gate"} ref={frame} className="grainpet-frame" title="grainpet" src={src} allow="clipboard-write; fullscreen"/></div>;
}
