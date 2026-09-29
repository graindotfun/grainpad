export class RegistrationPending extends Error {constructor(){super('Your transaction is submitted. Finalization and directory indexing are still pending; keep your receipt and check again.');}}
/** Poll only the idempotent verifier; never resubmit the signed transaction. */
export async function waitForRegistration(body,{fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),attempts=20}={}){
 for(let attempt=0;attempt<attempts;attempt++){
  const response=await fetcher('/api/launches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if(response.status===202||(response.status===409&&data.error==='Launch is confirmed and still finalizing. Retry shortly.')){if(attempt+1<attempts)await sleep(3000);continue;}
  if(!response.ok)throw Error(data.error||'Launch verification failed. Keep your transaction receipt.');
  if(!data.mint||!data.pool)throw Error('Invalid registration response. Keep your transaction receipt.');
  return data;
 }
 throw new RegistrationPending();
}
