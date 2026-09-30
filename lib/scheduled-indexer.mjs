/** In-Worker target for the protected job. The secret belongs in the Authorization header, never this URL. */
export const INDEXER_JOB_URL='https://grainpad.fun/api/internal/indexer';
/** Requested host schedule. A matching wrangler cron is not proof the host invokes it. */
export const INDEXER_CRON='* * * * *';
/** Invoke the same protected job inside the Worker, without an HTTP round trip. */
/** @param {string|null} action */
export async function runScheduledIndexer(handler, env, context,action=null) {
 const secret=env.INDEXER_SECRET;
 if(typeof secret!=='string'||secret.length<32)throw Error('Scheduled indexer requires INDEXER_SECRET.');
 const response=await handler.fetch(new Request(INDEXER_JOB_URL+(action==='monero'?'?action=monero':''),{
  method:'POST',headers:{Authorization:`Bearer ${secret}`},
 }),env,context);
 // Do not log the request, credential or response diagnostics containing provider data.
 await response.body?.cancel();
 if(response.status!==200&&response.status!==202)throw Error(`Scheduled indexer failed (HTTP ${response.status}).`);
}
