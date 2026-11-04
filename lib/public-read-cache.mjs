/** Public display data only. Never quotes, wallet balances, authorization or writes.
 * Edge hits avoid D1 altogether; existing database leases still coordinate RPC
 * refreshes across isolates/locations. This is not a global cache or rate limit. */
import {canonicalCardStyle} from './rewards-card-options.mjs';
// A card is kept 300 s at the edge (keyed by the release flag) but only 60 s by browsers and crawlers, which bounds how
// long a card can outlive a flag change downstream.
export const REWARDS_WALLET_TTL_S=30,CARD_TTL_S=300,CARD_CLIENT_TTL_S=60,CARD_MISSING_TTL_S=60,CARD_MAX_BYTES=2_000_000;
/** A route may cap how long its response stays fresh (epoch ms), e.g. a card converted at a quote that expires sooner. */
export const FRESH_UNTIL_HEADER='X-Grainpad-Fresh-Until';
const frameworkVary=new Set(['rsc','next-router-state-tree','next-router-prefetch','next-router-segment-prefetch','next-url','x-vinext-interception-context','x-vinext-mounted-slots','x-vinext-rsc-render-mode']);
export function publicReadPolicy(request){
 if(request.method!=='GET'||request.headers.has('Authorization'))return null;
 if([...frameworkVary].some(name=>request.headers.has(name)))return null;
 const url=new URL(request.url),mint='[1-9A-HJ-NP-Za-km-z]{32,44}';
 if(url.pathname==='/api/rewards/card'){
  // An image route: one canonical key per rendered card, whatever the crawler's Accept header. The style is the
  // renderer's own canonical style (art written out as the wallet's seeded default when missing or unknown).
  const owner=url.searchParams.get('owner')??'';
  if(!new RegExp(`^${mint}$`).test(owner))return null;
  const style=canonicalCardStyle({theme:url.searchParams.get('theme')??undefined,art:url.searchParams.get('art')??undefined,currency:url.searchParams.get('cur')??undefined},owner);
  // "No payouts" is a fact about the wallet, not the style: one negative entry per wallet answers every style.
  const missingUrl=new URL(url);missingUrl.pathname='/api/rewards/card-missing';missingUrl.search=new URLSearchParams({owner}).toString();missingUrl.hash='';
  url.search=new URLSearchParams({owner,theme:style.theme,art:style.art,cur:style.currency}).toString();url.hash='';
  return {url,missingUrl,ttl:CARD_TTL_S,missingTtl:CARD_MISSING_TTL_S,viewer:'passive',type:'image/png',maxBytes:CARD_MAX_BYTES,clientMaxAge:CARD_CLIENT_TTL_S,gated:true};
 }
 if(request.headers.get('Accept')?.includes('text/html'))return null;
 let ttl,keys=[];
 // Catalog membership depends on current Monero evidence. Never reuse or
 // coalesce a prior eligibility snapshot outside the guarded database query.
 if(url.pathname==='/api/discovery'||url.pathname==='/api/site-overview'||url.pathname==='/api/token-tape'||new RegExp(`^/api/creator/${mint}$`).test(url.pathname))return null;
 if(new RegExp(`^/api/market/${mint}$`).test(url.pathname))ttl=5;
 else if(new RegExp(`^/api/market/${mint}/history$`).test(url.pathname)){ttl=5;keys=['kind','interval','source','range'];}
 else if(new RegExp(`^/api/room/${mint}$`).test(url.pathname)){ttl=5;keys=['before','need'];}
 // Rewards wallet: verified-store reads only, shared by every viewer of the same wallet. The TTL is longer than the
 // page's 20 s poll, so even a single open tab is served from the edge between refreshes. Gated by the release flag,
 // which is part of its key (see `variant`).
 let gated=false;
 if(url.pathname==='/api/rewards/wallet'){ttl=REWARDS_WALLET_TTL_S;keys=['owner'];gated=true;}
 else if(ttl===undefined)return null;
 // Only route-consumed parameters distinguish responses. Tracking/cache-busting
 // parameters cannot fan out cache entries. Keep first-value route semantics.
 const params=new URLSearchParams();
 for(const key of keys){const value=url.searchParams.get(key);if(value!==null)params.set(key,value);}
 url.search=params.toString();url.hash='';
 return {url,ttl,missingTtl:0,viewer:request.headers.get('X-Grainpad-Viewer')==='visible'?'visible':'passive',type:'application/json',maxBytes:Infinity,clientMaxAge:0,gated};
}

/** Reads a body for sharing and storage, never buffering more than `max` bytes: a larger body (declared, or found
 * while reading) is handed on as a stream, uncached. */
async function boundedBody(response,max){
 if(!Number.isFinite(max))return {body:new Uint8Array(await response.arrayBuffer())};
 const declared=Number(response.headers.get('Content-Length')??NaN);
 if(Number.isFinite(declared)&&declared>max)return {stream:response.body};
 const reader=response.body?.getReader();
 if(!reader)return {body:new Uint8Array(0)};
 const chunks=[];let size=0;
 for(;;){
  const {done,value}=await reader.read();
  if(done)break;
  chunks.push(value);size+=value.byteLength;
  if(size>max)return {stream:new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(chunk);},async pull(controller){const next=await reader.read();if(next.done)controller.close();else controller.enqueue(next.value);},cancel(reason){return reader.cancel(reason);}})};
 }
 const body=new Uint8Array(size);let at=0;for(const chunk of chunks){body.set(chunk,at);at+=chunk.byteLength;}
 return {body};
}

/** @typedef {{match:(key:Request)=>Promise<Response|undefined>,put:(key:Request,value:Response)=>Promise<unknown>}} ReadCache */
/** @param {{cache?:ReadCache|(()=>Promise<ReadCache>),version?:string|null,now?:()=>number,maxFlights?:number}} options */
export function createPublicReadCache({cache,version,now=Date.now,maxFlights=256}={}){
 const flights=new Map();
 const seconds=ms=>Math.max(0,Math.floor(ms/1000));
 // Freshness is worked out when the response is handed over, from when it was read (`stored`) and when it stops being
 // fresh (`expires`): `Age` is its age now, and a cacheable response gets max-age = Age + what is left, never more than
 // the client limit. Time spent storing or coalescing counts against it; an expired response goes out as no-store.
 // Data responses stay no-store for clients (their `Age` still tells the page how old the snapshot is).
 const client=(response,state,{stored,expires,clientMaxAge})=>{
  const at=now(),age=Number.isFinite(stored)?seconds(at-stored):0,left=Math.min(clientMaxAge,Number.isFinite(expires)?seconds(expires-at):0);
  const headers=new Headers(response.headers);
  headers.set('Cache-Control',response.status===200&&left>0?`public, max-age=${age+left}`:'no-store');headers.set('Age',String(age));headers.set('X-Grainpad-Read-Cache',state);
  for(const name of ['X-Grainpad-Cache-Expires','X-Grainpad-Cache-Stored',FRESH_UNTIL_HEADER])headers.delete(name);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 };
 const keyFor=(target,policy,variant)=>{const url=new URL(target);url.pathname=`/__grainpad_public_cache/${encodeURIComponent(version)}/${policy.gated?`${encodeURIComponent(variant)}/`:''}${policy.viewer}${url.pathname}`;return new Request(url,{method:'GET'});};
 const fresh=async(storage,key)=>{const hit=await storage.match(key),expires=Number(hit?.headers.get('X-Grainpad-Cache-Expires'));return hit&&expires>now()?{hit,expires,stored:Number(hit.headers.get('X-Grainpad-Cache-Stored'))}:null;};
 /** @param {Request} request @param {()=>Promise<Response>} load @param {(task:Promise<unknown>)=>void} waitUntil
  * @param {string} [variant] release state for gated routes; without it a gated route is never cached, and a flag
  * change moves its entries to another key, so no cached response outlives the flag that produced it at the edge. */
 // Without the cache (absent, failing to open, or a bypassed gated read) the origin response is still bounded by its
 // own deadline: a response past it goes out no-store, one before it keeps no more than the time left, and the internal
 // deadline header never leaves the Worker.
 const uncached=async load=>{
  const response=await load(),until=Number(response.headers.get(FRESH_UNTIL_HEADER)??NaN);
  if(!response.headers.has(FRESH_UNTIL_HEADER))return response;
  const headers=new Headers(response.headers),left=seconds(until-now()),maxAge=Number(/max-age=(\d+)/.exec(headers.get('Cache-Control')??'')?.[1]??0);
  headers.delete(FRESH_UNTIL_HEADER);
  headers.set('Cache-Control',response.status===200&&left>0&&maxAge>0?`public, max-age=${Math.min(maxAge,left)}`:'no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 };
 return async function read(request,load,waitUntil=(_task)=>{},variant){
  const policy=publicReadPolicy(request);
  if(!policy||!cache||!version||(policy.gated&&!variant))return uncached(load);
  let storage;try{storage=typeof cache==='function'?await cache():cache;}catch{return uncached(load);}
  const key=keyFor(policy.url,policy,variant),missingKey=policy.missingUrl?keyFor(policy.missingUrl,policy,variant):null,id=key.url;
  try{
   const found=await fresh(storage,key)??(missingKey?await fresh(storage,missingKey):null);
   if(found)return client(found.hit,'HIT',{stored:found.stored,expires:found.expires,clientMaxAge:policy.clientMaxAge});
  }catch{/* Cache failure must not disable the origin. */}
  let task=flights.get(id),state='COALESCED';
  if(task&&(await task).stream)task=undefined;// an oversized body was streamed to its first caller; load again
  if(!task){
   if(flights.size>=maxFlights)return Response.json({error:'Public data is busy. Please retry shortly.'},{status:503,headers:{'Retry-After':'2','Cache-Control':'no-store'}});
   state='MISS';
   task=(async()=>{
    const response=await load(),stored=now();
    // Buffer once, bounded by the route row limits and the policy byte limit. Repeated
    // Response.clone() on one stream builds a tee chain under large bursts.
    const read=await boundedBody(response,policy.maxBytes);
    if(read.stream)return {stream:read.stream,status:response.status,statusText:response.statusText,headers:new Headers(response.headers),stored,expires:stored};
    const body=read.body,until=Number(response.headers.get(FRESH_UNTIL_HEADER)??NaN);
    const vary=(response.headers.get('Vary')||'').split(',').map(name=>name.trim().toLowerCase()).filter(Boolean);
    const okay=response.status===200&&response.headers.get('Content-Type')?.includes(policy.type),missing=response.status===404&&policy.missingTtl>0;
    const expires=stored+Math.min((okay?policy.ttl:missing?policy.missingTtl:0)*1000,Number.isFinite(until)?until-stored:Infinity);
    if((okay||missing)&&expires>stored&&!response.headers.has('Set-Cookie')&&vary.every(name=>frameworkVary.has(name))){
     const headers=new Headers(response.headers);
     // vinext appends router Vary even to plain JSON. Router requests bypass
     // above; only this identical public representation enters the cache.
     headers.delete('Vary');
     headers.set('Cache-Control',`public, max-age=${seconds(expires-stored)}`);
     headers.set('X-Grainpad-Cache-Expires',String(expires));
     headers.set('X-Grainpad-Cache-Stored',String(stored));
     try{await storage.put(missing&&missingKey?missingKey:key,new Response(body,{status:response.status,headers}));}catch{/* Storage is optional; freshness and origin errors remain unchanged. */}
    }
    return {body,status:response.status,statusText:response.statusText,headers:new Headers(response.headers),stored,expires:okay?expires:stored};
   })();
   flights.set(id,task);
   // Retain origin work through disconnects, and release failed loads as well.
   const settled=task.then(()=>{flights.delete(id);},()=>{flights.delete(id);});
   waitUntil(settled);
  }
  const settled=await task;
  return client(new Response(settled.stream??settled.body,settled),state,{stored:settled.stored,expires:settled.expires,clientMaxAge:policy.clientMaxAge});
 };
}
