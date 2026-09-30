export class RegistrationPending extends Error {constructor(){super('Your transaction is submitted. Finalization and directory indexing are still pending; keep your receipt and check again.');}}
/** Bounded idempotent verification only; never signs or resubmits a transaction. */
export async function waitForRegistration(body,{fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),attempts=20,timeoutMs=10000}={}){
 for(let attempt=0;attempt<attempts;attempt++){
  const controller=new AbortController();let timer;
  try{
   const {response,data}=await Promise.race([(async()=>{const response=await fetcher('/api/launches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});return {response,data:await response.json().catch(()=>({}))};})(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new RegistrationPending());},timeoutMs);})]);
   if(response.status===202||response.status===429||response.status>=500||(response.status===409&&data.error==='Launch is confirmed and still finalizing. Retry shortly.'))throw new RegistrationPending();
   if(!response.ok)throw Error(data.error||'Launch verification failed. Keep your transaction receipt.');
   if(data.mint!==body.mint||!data.pool)throw Error('Invalid registration response. Keep your transaction receipt.');
   return data;
  }catch(error){if(!(error instanceof RegistrationPending)&&!(error instanceof TypeError)&&error?.name!=='AbortError')throw error;}
  finally{clearTimeout(timer);}
  if(attempt+1<attempts)await sleep(Math.min(1000*2**attempt,10000));
 }
 throw new RegistrationPending();
}
