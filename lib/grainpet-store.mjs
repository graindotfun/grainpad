import {parseIdentity} from './grainpet-auth.mjs';
/** grainpet save storage: one small JSON record per wallet identity in R2, written with etag compare-and-set so two devices never silently overwrite each other. */
export const MAX_STATE_BYTES=48_000,SCHEMA=1;
const TOP=['v','id','type','name','prefs','needs','bond','dust','dent','coll','notes','ideas','home','finds','memories','notesRead','born','seen','sessions','flags'];
const TYPES=['mori','nori','pip','rolo','peb'];
function bounded(value,depth=0){
 if(value===null||typeof value==='boolean')return;
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Save contains an invalid number.');return;}
 if(typeof value==='string'){if(value.length>200)throw Error('Save contains text that is too long.');return;}
 if(depth>5)throw Error('Save is nested too deeply.');
 if(Array.isArray(value)){if(value.length>80)throw Error('Save contains a list that is too long.');for(const item of value)bounded(item,depth+1);return;}
 if(typeof value==='object'){
  if(Object.getPrototypeOf(value)!==Object.prototype)throw Error('Save contains an invalid object.');
  const keys=Object.keys(value);if(keys.length>40)throw Error('Save contains too many fields.');
  for(const k of keys){if(!/^[A-Za-z0-9_-]{1,24}$/.test(k)||k==='__proto__')throw Error('Save contains an invalid field name.');bounded(value[k],depth+1);}
  return;
 }
 throw Error('Save contains an unsupported value.');
}
/** Full structural validation. The game re-sanitises on load; this keeps the server record bounded and well-formed whatever a client sends. */
export function validateState(state){
 if(!state||typeof state!=='object'||Array.isArray(state))throw Error('Save must be an object.');
 for(const k of Object.keys(state))if(!TOP.includes(k))throw Error('Save has an unknown field.');
 if(state.v!==1||!TYPES.includes(state.type)||typeof state.id!=='string'||typeof state.name!=='string')throw Error('Save is not a grainpet save.');
 for(const k of ['prefs','needs','bond','home','finds','memories','flags'])if(!state[k]||typeof state[k]!=='object'||Array.isArray(state[k]))throw Error('Save is incomplete.');
 for(const k of ['coll','notes','ideas','notesRead'])if(!Array.isArray(state[k]))throw Error('Save is incomplete.');
 bounded(state);
 if(new TextEncoder().encode(JSON.stringify(state)).length>MAX_STATE_BYTES)throw Error('Save is too large.');
 return state;
}
const keyFor=async identity=>{
 parseIdentity(identity);
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
 return 'grainpet/v1/'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')+'.json';
};
export function r2Store(bucket){
 return {
  async read(identity){
   const object=await bucket.get(await keyFor(identity));
   if(!object)return {revision:0,updatedAt:0,state:null,etag:null};
   const rec=await object.json();
   if(rec?.identity!==identity||rec.schema!==SCHEMA)throw Error('Stored save does not belong to this wallet.');
   return {revision:rec.revision,updatedAt:rec.updatedAt,state:rec.state,etag:object.etag};
  },
  /** @returns {Promise<{ok:boolean}>} ok=false when the stored record changed since `etag` (null = must not exist yet). */
  async write(identity,{revision,updatedAt,state},etag){
   const body=JSON.stringify({schema:SCHEMA,identity,revision,updatedAt,state});
   const put=await bucket.put(await keyFor(identity),body,{httpMetadata:{contentType:'application/json'},onlyIf:etag===null?{etagDoesNotMatch:'*'}:{etagMatches:etag}});
   return {ok:put!==null};
  },
 };
}
/** In-memory store with the same contract, for tests. */
export function memoryStore(){
 const map=new Map(),tag=r=>`etag-${r.revision}`;
 return {
  async read(identity){parseIdentity(identity);const r=map.get(identity);return r?{...structuredClone(r),etag:tag(r)}:{revision:0,updatedAt:0,state:null,etag:null};},
  async write(identity,rec,etag){parseIdentity(identity);const cur=map.get(identity),curTag=cur?tag(cur):null;if(curTag!==etag)return {ok:false};map.set(identity,structuredClone(rec));return {ok:true};},
 };
}
