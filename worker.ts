import handler from 'vinext/server/fetch-handler';
import {runScheduledIndexer} from './lib/scheduled-indexer.mjs';

const worker = {
 fetch(request: Request, env: {INDEXER_SECRET?: string; MONERO_DAEMON_URL?: string}, context: ExecutionContext) {
  // Strip untrusted policies before vinext's nonce extraction, which happens
  // before its middleware request-header overrides are applied.
  const headers = new Headers(request.headers);
  headers.delete('Content-Security-Policy');
  headers.delete('Content-Security-Policy-Report-Only');
  return handler.fetch(new Request(request, {headers}), env, context);
 },
 async scheduled(_controller: ScheduledController, env: {INDEXER_SECRET?: string; MONERO_DAEMON_URL?: string}, context: ExecutionContext) {
  const jobs=[runScheduledIndexer(handler,env,context)];
  // The Monero reader is activated only when its daemon binding exists. A missing
  // operator service must not turn a successful Solana indexer tick into failure.
  if(env.MONERO_DAEMON_URL)jobs.push(runScheduledIndexer(handler,env,context,'monero'));
  const results=await Promise.allSettled(jobs);
  if(results.some(result=>result.status==='rejected'))throw Error('Scheduled indexing failed. Inspect protected job health.');
 },
};
export default worker;
