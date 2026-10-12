/** No background polling. A visible token page owns each cancellable request. */
export function startViewerPolling(task,{document=globalThis.document,intervalMs=30000,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let stopped=false,running=false,timer,controller;
 const pause=()=>{clearTimer(timer);timer=undefined;controller?.abort();};
 async function run(){
  if(stopped||document.hidden||running)return;
  clearTimer(timer);running=true;controller=new AbortController();
  try{await task(controller.signal);}catch{/* The caller owns visible error reporting. */}
  finally{running=false;if(!stopped&&!document.hidden)timer=setTimer(()=>void run(),intervalMs);}
 }
 const visibility=()=>{if(document.hidden)pause();else void run();};
 document.addEventListener('visibilitychange',visibility);void run();
 return()=>{stopped=true;pause();document.removeEventListener('visibilitychange',visibility);};
}
