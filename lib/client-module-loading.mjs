/** Bound code loading only. This never retries an action, reloads, connects or signs. */
export const MODULE_UPDATE_ERROR='This page could not load a required file after a site update. Keep the same creator wallet. Reload the page and recover any existing launch or allocated address before trying again.';
export function clientModuleError(error){
 const message=error instanceof Error?error.message:String(error??'');
 return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Required page code did not load in time/i.test(message)?MODULE_UPDATE_ERROR:message||'The request failed. Please retry.';
}
export async function loadClientModule(load,{timeoutMs=15000}={}){
 if(typeof load!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw Error('Invalid code-loading request.');
 let timer;
 try{return await Promise.race([Promise.resolve().then(load),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Required page code did not load in time.')),timeoutMs);})]);}
 finally{clearTimeout(timer);}
}
