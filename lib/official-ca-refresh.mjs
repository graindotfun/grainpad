import {OFFICIAL_LAUNCH_PINS} from './official-launch-policy.mjs';
/** Pending pages observe publication; this never publishes or requests a wallet. */
export function watchOfficialContract({onResult=(result)=>{void result;},fetchImpl=fetch,visibility=globalThis.document,interval=setInterval,cancelInterval=clearInterval}={}){
 const abort=new AbortController();let busy=false,verified=false,stopped=false;
 let timer;
 const refresh=async()=>{
  if(stopped||verified||busy||visibility?.visibilityState==='hidden')return;
  busy=true;
  try{
   const response=await fetchImpl('/api/token',{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(12000)])});
   if(!response.ok)throw Error('Official record unavailable.');
   const data=await response.json();
   if(data.network!=='mainnet-beta'||(data.token&&data.token.mint!==OFFICIAL_LAUNCH_PINS.mint))throw Error('Official identity mismatch.');
   if(stopped)return;
   verified=Boolean(data.token);
   onResult({mint:data.token?.mint??null,state:verified?'verified':'pending'});
   if(verified){cancelInterval(timer);visibility?.removeEventListener('visibilitychange',refresh);}
  }catch{if(!stopped)onResult({mint:null,state:'unavailable'});}
  finally{busy=false;}
 };
 timer=interval(refresh,30000);visibility?.addEventListener('visibilitychange',refresh);void refresh();
 return ()=>{stopped=true;abort.abort();cancelInterval(timer);visibility?.removeEventListener('visibilitychange',refresh);};
}
