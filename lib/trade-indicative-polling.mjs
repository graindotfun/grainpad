/** Cancelling also suppresses an already running read's result and error. */
export function startIndicativeQuote({read,publish,delayMs=350,lifetimeMs=15_000,timeoutMs=20_000}){
 const controller=new AbortController();let expiry,deadline;
 publish({status:'loading',quote:null,error:''});
 const timer=setTimeout(async()=>{
  deadline=setTimeout(()=>{publish({status:'unavailable',quote:null,error:'Estimate is taking too long. Edit the amount to retry.'});controller.abort();},timeoutMs);
  try{const quote=await read(controller.signal);if(controller.signal.aborted)return;
   if(!Number.isSafeInteger(quote?.expiresAt)||quote.expiresAt<=Date.now()){publish({status:'expired',quote:null,error:'Estimate expired. Edit the amount to refresh.'});return;}
   publish({status:'ready',quote,error:''});
   expiry=setTimeout(()=>{if(!controller.signal.aborted)publish({status:'expired',quote:null,error:'Estimate expired. Edit the amount to refresh.'});},Math.max(0,Math.min(lifetimeMs,quote.expiresAt-Date.now())));
  }catch(error){if(!controller.signal.aborted)publish({status:'unavailable',quote:null,error:error instanceof Error?error.message:'Estimate unavailable.'});}
  finally{clearTimeout(deadline);}
 },delayMs);
 return ()=>{controller.abort();clearTimeout(timer);clearTimeout(expiry);clearTimeout(deadline);};
}
