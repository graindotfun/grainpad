import handler from 'vinext/server/fetch-handler';
import {runScheduledIndexer} from './lib/scheduled-indexer.mjs';

const worker = {
 fetch(request: Request, env: {INDEXER_SECRET?: string}, context: ExecutionContext) {
  // Strip untrusted policies before vinext's nonce extraction, which happens
  // before its middleware request-header overrides are applied.
  const headers = new Headers(request.headers);
  headers.delete('Content-Security-Policy');
  headers.delete('Content-Security-Policy-Report-Only');
  return handler.fetch(new Request(request, {headers}), env, context);
 },
 async scheduled(_controller: ScheduledController, env: {INDEXER_SECRET?: string}, context: ExecutionContext) {
  const results=await Promise.allSettled([runScheduledIndexer(handler,env,context),runScheduledIndexer(handler,env,context,'monero')]);
  if(results.some(result=>result.status==='rejected'))throw Error('Scheduled reader failed. Inspect protected job health.');
 },
};
export default worker;
