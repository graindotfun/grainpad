/** Background preparation of the SOL review for the inputs on screen, so a click can open the wallet at once.
 * It only calls the ordinary prepare endpoint: the server still builds, guards and simulates the review, and the
 * wallet request still passes the same client checks. A prepared review is handed out at most once, only for the
 * identical input key, and only while ample review lifetime remains. Background failures stay silent; the click
 * prepares again and reports its own error. */
// Refreshing every 6 s keeps the held review inside the client's 10 s fresh-simulation window, so a click normally
// skips the separate preflight; 20 rounds bound an idle page to about two minutes of background work.
export const SOL_SPECULATIVE_DEBOUNCE_MS=600,SOL_SPECULATIVE_REFRESH_MS=6_000,SOL_SPECULATIVE_MAX_REFRESHES=20,SOL_SPECULATIVE_MIN_REMAINING_MS=20_000;
export function createSolSpeculation({prepare,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,visible=()=>true}){
 let activeKey='',current=null,inflight=null,timer=null,refreshes=0;const handed=new WeakSet();
 function cancel(){if(timer)clearTimer(timer);timer=null;}
 function stop(){activeKey='';current=null;inflight=null;cancel();}
 function schedule(key,input,ms){cancel();timer=setTimer(()=>{timer=null;run(key,input);},ms);}
 function run(key,input){
  if(key!==activeKey)return;
  // A hidden tab neither spends budget nor keeps a review it would not use.
  if(!visible()){schedule(key,input,SOL_SPECULATIVE_REFRESH_MS);return;}
  const promise=Promise.resolve().then(()=>prepare(input)).then(review=>({key,review,preparedAt:now()}));
  inflight={key,promise};
  promise.then(entry=>{
   if(inflight?.promise===promise)inflight=null;
   if(key!==activeKey)return;
   current=entry;
   if(++refreshes<SOL_SPECULATIVE_MAX_REFRESHES)schedule(key,input,SOL_SPECULATIVE_REFRESH_MS);
  },()=>{if(inflight?.promise===promise)inflight=null;});
 }
 const usable=(entry,key)=>!!entry&&entry.key===key&&entry.review?.expiresAt-now()>=SOL_SPECULATIVE_MIN_REMAINING_MS;
 return {
  /** Track the current inputs; an empty key stops background work. Unchanged keys keep the running schedule. */
  update(key,input){if(key===activeKey)return;stop();if(!key)return;activeKey=key;refreshes=0;schedule(key,input,SOL_SPECULATIVE_DEBOUNCE_MS);},
  /** One-time handoff of a review prepared for exactly this key, waiting for a matching request already in flight. */
  async take(key){
   let entry=usable(current,key)?current:null;
   if(!entry&&inflight?.key===key){try{const awaited=await inflight.promise;entry=usable(awaited,key)?awaited:null;}catch{entry=null;}}
   // Never hand the same review out twice; the completed in-flight request may also have stored it as current.
   if(entry&&current===entry)current=null;
   if(!entry||handed.has(entry.review))return null;
   handed.add(entry.review);return entry;
  },
  stop,
 };
}
