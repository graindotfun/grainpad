/** Invoke the same protected job inside the Worker, without an HTTP round trip. */
export async function runScheduledIndexer(handler, env, context) {
 const secret=env.INDEXER_SECRET;
 if(typeof secret!=='string'||secret.length<32)throw Error('Scheduled indexer requires INDEXER_SECRET.');
 const response=await handler.fetch(new Request('https://grainpad.fun/api/internal/indexer',{
  method:'POST',headers:{Authorization:`Bearer ${secret}`},
 }),env,context);
 // Do not log the request, credential or response diagnostics containing provider data.
 await response.body?.cancel();
 if(response.status!==200&&response.status!==202)throw Error(`Scheduled indexer failed (HTTP ${response.status}).`);
}
