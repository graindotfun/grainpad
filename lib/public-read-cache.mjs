/** Public display data only. Never quotes, wallet balances, authorization or writes.
 * Edge hits avoid D1 altogether; existing database leases still coordinate RPC
 * refreshes across isolates/locations. This is not a global cache or rate limit. */
const frameworkVary=new Set(['rsc','next-router-state-tree','next-router-prefetch','next-router-segment-prefetch','next-url','x-vinext-interception-context','x-vinext-mounted-slots','x-vinext-rsc-render-mode']);
export function publicReadPolicy(request){
 if(request.method!=='GET'||request.headers.has('Authorization'))return null;
 if([...frameworkVary].some(name=>request.headers.has(name))||request.headers.get('Accept')?.includes('text/html'))return null;
 const url=new URL(request.url),mint='[1-9A-HJ-NP-Za-km-z]{32,44}';
 let ttl,keys=[];
 if(url.pathname==='/api/discovery'){ttl=10;keys=['q','filter','sort','page','quote'];}
 else if(url.pathname==='/api/site-overview'||url.pathname==='/api/token-tape')ttl=5;
 else if(new RegExp(`^/api/market/${mint}$`).test(url.pathname))ttl=5;
 else if(new RegExp(`^/api/market/${mint}/history$`).test(url.pathname)){ttl=5;keys=['kind','interval','source'];}
 else if(new RegExp(`^/api/room/${mint}$`).test(url.pathname)){ttl=5;keys=['before','need'];}
 else if(new RegExp(`^/api/creator/${mint}$`).test(url.pathname)){ttl=10;keys=['cursor'];}
 else return null;
 // Only route-consumed parameters distinguish responses. Tracking/cache-busting
 // parameters cannot fan out cache entries. Keep first-value route semantics.
 const params=new URLSearchParams();
 for(const key of keys){const value=url.searchParams.get(key);if(value!==null)params.set(key,value);}
 url.search=params.toString();url.hash='';
 return {url,ttl,viewer:request.headers.get('X-Grainpad-Viewer')==='visible'?'visible':'passive'};
}

/** @typedef {{match:(key:Request)=>Promise<Response|undefined>,put:(key:Request,value:Response)=>Promise<unknown>}} ReadCache */
/** @param {{cache?:ReadCache|(()=>Promise<ReadCache>),version?:string|null,now?:()=>number,maxFlights?:number}} options */
export function createPublicReadCache({cache,version,now=Date.now,maxFlights=256}={}){
 const flights=new Map();
 const client=(response,state)=>{const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('X-Grainpad-Read-Cache',state);headers.delete('X-Grainpad-Cache-Expires');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});};
 /** @param {Request} request @param {()=>Promise<Response>} load @param {(task:Promise<unknown>)=>void} waitUntil */
 return async function read(request,load,waitUntil=(_task)=>{}){
  const policy=publicReadPolicy(request);
  if(!policy||!cache||!version)return load();
  let storage;try{storage=typeof cache==='function'?await cache():cache;}catch{return load();}
  const url=policy.url;
  url.pathname=`/__grainpad_public_cache/${encodeURIComponent(version)}/${policy.viewer}${url.pathname}`;
  const key=new Request(url,{method:'GET'}),id=key.url;
  try{const hit=await storage.match(key);if(hit&&Number(hit.headers.get('X-Grainpad-Cache-Expires'))>now())return client(hit,'HIT');}catch{/* Cache failure must not disable the origin. */}
  let task=flights.get(id),state='COALESCED';
  if(!task){
   if(flights.size>=maxFlights)return Response.json({error:'Public data is busy. Please retry shortly.'},{status:503,headers:{'Retry-After':'2','Cache-Control':'no-store'}});
   state='MISS';
   task=(async()=>{
    const response=await load();
    // Buffer once, bounded by the existing public route row limits. Repeated
    // Response.clone() on one stream builds a tee chain under large bursts.
    const body=new Uint8Array(await response.arrayBuffer());
    const snapshot={body,status:response.status,statusText:response.statusText,headers:new Headers(response.headers)};
    const vary=(response.headers.get('Vary')||'').split(',').map(name=>name.trim().toLowerCase()).filter(Boolean);
    if(response.status===200&&response.headers.get('Content-Type')?.includes('application/json')&&!response.headers.has('Set-Cookie')&&vary.every(name=>frameworkVary.has(name))){
     const headers=new Headers(response.headers);
     // vinext appends router Vary even to plain JSON. Router requests bypass
     // above; only this identical public JSON representation enters the cache.
     headers.delete('Vary');
     headers.set('Cache-Control',`public, max-age=${policy.ttl}`);
     headers.set('X-Grainpad-Cache-Expires',String(now()+policy.ttl*1000));
     try{await storage.put(key,new Response(body,{status:200,headers}));}catch{/* Storage is optional; freshness and origin errors remain unchanged. */}
    }
    return snapshot;
   })();
   flights.set(id,task);
   // Retain origin work through disconnects, and release failed loads as well.
   const settled=task.then(()=>{flights.delete(id);},()=>{flights.delete(id);});
   waitUntil(settled);
  }
  return client(await task,state);
 };
}
