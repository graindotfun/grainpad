/** Browser-only durable draft storage. Images stay out of the small transaction-hash journal. */
function database():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{const request=indexedDB.open("grainpad-rh-launch",1);request.onupgradeneeded=()=>request.result.createObjectStore("drafts");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error("Launch draft storage is unavailable. Enable browser storage before creating."));request.onblocked=()=>reject(Error("Close other launch tabs, then retry draft storage."));});
}
export async function saveMainnetDraft(key:string,value:unknown):Promise<void> {
  const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction("drafts","readwrite");tx.objectStore("drafts").put(value,key);tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(Error("Your launch draft could not be saved. Free browser storage before creating."));});}finally{db.close();}
}
export async function readMainnetDraft(key:string):Promise<Record<string,unknown>|null> {
  const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction("drafts","readonly"),request=tx.objectStore("drafts").get(key);let value:unknown;request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>resolve(value&&typeof value==="object"?value as Record<string,unknown>:null);tx.onerror=tx.onabort=()=>reject(Error("Your saved launch draft is unavailable."));});}finally{db.close();}
}
/** Read-only picker summaries; never creates a database or returns image/signature payloads. */
export async function listMainnetLaunchDrafts():Promise<{key:string;value:Record<string,unknown>}[]> {
 const db=await new Promise<IDBDatabase|null>((resolve,reject)=>{
  const request=indexedDB.open('grainpad-rh-launch',1);
  request.onupgradeneeded=()=>{request.transaction?.abort();};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>request.error?.name==='AbortError'?resolve(null):reject(Error('Saved launch summaries are unavailable.'));
  request.onblocked=()=>reject(Error('Saved launch summaries are unavailable.'));
 });
 if(!db)return [];try{
  if(!db.objectStoreNames.contains('drafts'))return [];
  return await new Promise((resolve,reject)=>{const results:{key:string;value:Record<string,unknown>}[]=[],tx=db.transaction('drafts','readonly'),request=tx.objectStore('drafts').openCursor();
   request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const key=cursor.key,value=cursor.value;
    if(typeof key==='string'&&/^grainpad:(4663|46630):create:0x[0-9a-f]{40}$/i.test(key)&&value&&typeof value==='object'&&!Array.isArray(value)){
     const summary:Record<string,unknown>={};for(const field of ['version','id','hash','reservedHash','submissionRequested'])if(Object.hasOwn(value,field))summary[field]=value[field];
     if(Object.hasOwn(value,'draft'))summary.draft=true;results.push({key,value:summary});
    }cursor.continue();};tx.oncomplete=()=>resolve(results);tx.onerror=tx.onabort=()=>reject(Error('Saved launch summaries are unavailable.'));
  });
 }finally{db.close();}
}
