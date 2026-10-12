'use client';
import {useEffect,useState} from 'react';
export type LiveTrade={id:string;time:number;value:number;slot:number;signature:string;receivedAt:number};
type LiveState={key:string;connected:boolean;events:LiveTrade[];lastMessage:number;gap:boolean};
export function useLiveMarket(mint:string,pool?:string){
 const key=`${mint}:${pool}`,[state,setState]=useState<LiveState>({key:'',connected:false,events:[],lastMessage:0,gap:false});
 useEffect(()=>{
  if(!pool)return;let stopped=false,socket:WebSocket|null=null,timer:ReturnType<typeof setTimeout>|undefined,retries=0;
  const update=(change:Partial<LiveState>)=>setState(previous=>({...previous,...change,key,events:previous.key===key?previous.events:[]}));
  const connect=()=>{
   if(stopped||document.hidden||socket)return;
   const url=new URL(`/api/market/${encodeURIComponent(mint)}/live`,location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';
   const current=new WebSocket(url.href);socket=current;
   current.onmessage=event=>{
    try{const body=JSON.parse(event.data);
     if(body.type==='ready'&&body.pool===pool&&body.mint===mint){retries=0;update({connected:true,lastMessage:Date.now(),gap:false});}
     else if(body.type==='heartbeat')update({lastMessage:Date.now()});
     else if(body.type==='gap')update({gap:true});
     else if(body.type==='trade'&&body.pool===pool&&body.mint===mint&&typeof body.id==='string'&&Number.isFinite(body.time)&&Number.isFinite(body.value)&&body.value>0&&Number.isSafeInteger(body.slot)){
      setState(previous=>{const events=previous.key===key?previous.events:[];return {key,connected:true,gap:previous.gap,lastMessage:Date.now(),events:events.some(row=>row.id===body.id)?events:[...events,body].filter(row=>row.time>Date.now()/1000-86400).sort((a,b)=>a.time-b.time||a.slot-b.slot||a.id.localeCompare(b.id)).slice(-2000)};});
     }
    }catch{/* Ignore malformed frames. */}
   };
   current.onclose=()=>{if(socket!==current)return;socket=null;update({connected:false});if(!stopped&&!document.hidden)timer=setTimeout(connect,Math.min(15000,1000*2**retries++));};
   current.onerror=()=>current.close();
  };
  const visibility=()=>{clearTimeout(timer);if(document.hidden){const current=socket;socket=null;current?.close();update({connected:false});}else connect();};
  document.addEventListener('visibilitychange',visibility);connect();
  return()=>{stopped=true;clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);socket?.close();};
 },[key,mint,pool]);
 return state.key===key?state:{key,connected:false,events:[],lastMessage:0,gap:false};
}
