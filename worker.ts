import handler from 'vinext/server/fetch-handler';
import {runScheduledIndexer} from './lib/scheduled-indexer.mjs';
import {createPublicReadCache} from './lib/public-read-cache.mjs';

declare const __GRAINPAD_COMMIT__: string | null;
const publicReads = createPublicReadCache({
 // Workers for Platforms disables caches.default in untrusted namespaces.
 // Open this application's isolated named cache inside request context.
 cache: typeof caches === 'undefined' ? undefined : () => caches.open('grainpad-public-read-v1'),
 version: __GRAINPAD_COMMIT__,
});

const worker = {
 fetch(request: Request, env: {INDEXER_SECRET?: string; MONERO_DAEMON_URL?: string}, context: ExecutionContext) {
  // Strip untrusted policies before vinext's nonce extraction, which happens
  // before its middleware request-header overrides are applied.
  const headers = new Headers(request.headers);
  headers.delete('Content-Security-Policy');
  headers.delete('Content-Security-Policy-Report-Only');
  const clean = new Request(request, {headers});
  return publicReads(clean, () => handler.fetch(clean, env, context), (task: Promise<unknown>) => context.waitUntil(task));
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
