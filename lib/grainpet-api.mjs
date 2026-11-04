import {assertSameOrigin,readLimitedJSON} from './request-boundary.mjs';
import {canonicalIdentity,issueChallenge,verifyChallenge,issueSession,sessionIdentity,sessionCookie,clearedSessionCookie} from './grainpet-auth.mjs';
import {validateState,MAX_STATE_BYTES} from './grainpet-store.mjs';
/** Transport-independent grainpet API. The caller identity comes only from the signed session cookie; no request field names an owner. */
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
const deny=(message,status)=>json({error:message},status);
const exact=(body,keys)=>{if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Request body is invalid.');for(const k of Object.keys(body))if(!keys.includes(k))throw Error('Request body has an unknown field.');};
export function createGrainpetApi({secret,store,budget,now=()=>Date.now()}){
 const ip=r=>r.headers.get('cf-connecting-ip')||'local';
 const guard=async(key,limit,windowMs)=>{if(!await budget(key,limit,windowMs))throw Object.assign(Error('Too many requests. Try again in a minute.'),{status:429});};
 const wrap=fn=>async request=>{try{return await fn(request);}catch(e){return deny(e instanceof Error?e.message:'Request failed.',e?.status||400);}};
 const caller=async request=>{const id=await sessionIdentity(secret,request.headers.get('Cookie'),now());if(!id)throw Object.assign(Error('Sign in to load your grain.'),{status:401});return id;};
 return {
  challenge:wrap(async request=>{
   assertSameOrigin(request);await guard('grainpet-challenge:'+ip(request),20);
   const body=await readLimitedJSON(request,2_000);exact(body,['family','networkId','owner']);
   const identity=canonicalIdentity(body),c=await issueChallenge(secret,{origin:new URL(request.url).origin,identity,now:now()});
   return json({identity,message:c.message,token:c.token,expiresAt:c.expiresAt});
  }),
  session:wrap(async request=>{
   if(request.method==='GET'){const id=await sessionIdentity(secret,request.headers.get('Cookie'),now());return json({identity:id});}
   assertSameOrigin(request);
   if(request.method==='DELETE')return json({identity:null},200,{'Set-Cookie':clearedSessionCookie()});
   await guard('grainpet-session:'+ip(request),20);
   const body=await readLimitedJSON(request,4_000);exact(body,['token','signature']);
   const {identity}=await verifyChallenge(secret,{origin:new URL(request.url).origin,token:body.token,signature:body.signature,now:now()});
   const s=await issueSession(secret,identity,now());
   return json({identity,expiresAt:s.expiresAt},200,{'Set-Cookie':sessionCookie(s.token,s.maxAge)});
  }),
  load:wrap(async request=>{
   const id=await caller(request);await guard('grainpet-get:'+id,60);
   const {revision,updatedAt,state}=await store.read(id);
   return json({identity:id,revision,updatedAt,state});
  }),
  save:wrap(async request=>{
   assertSameOrigin(request);const id=await caller(request);await guard('grainpet-put:'+id,30);
   const body=await readLimitedJSON(request,MAX_STATE_BYTES+1_000);exact(body,['baseRevision','state']);
   if(!Number.isSafeInteger(body.baseRevision)||body.baseRevision<0)throw Error('baseRevision is invalid.');
   validateState(body.state);
   const cur=await store.read(id);
   if(cur.etag===null)await guard('grainpet-new:'+ip(request),20,3_600_000);   /* a new grain is a new stored object: few per hour per caller, so throwaway keys cannot fill storage */
   if(cur.revision!==body.baseRevision)return json({error:'This grain changed on another device.',conflict:true,identity:id,revision:cur.revision,updatedAt:cur.updatedAt,state:cur.state},409);
   const rec={revision:cur.revision+1,updatedAt:now(),state:body.state};
   if(!(await store.write(id,rec,cur.etag)).ok){const fresh=await store.read(id);return json({error:'This grain changed on another device.',conflict:true,identity:id,revision:fresh.revision,updatedAt:fresh.updatedAt,state:fresh.state},409);}
   return json({identity:id,revision:rec.revision,updatedAt:rec.updatedAt});
  }),
 };
}
