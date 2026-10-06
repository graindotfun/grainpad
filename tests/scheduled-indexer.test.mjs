import test from 'node:test';
import assert from 'node:assert/strict';
import {INDEXER_CRON,INDEXER_JOB_URL,runScheduledIndexer,refreshMoneroOnIndexerTick} from '../lib/scheduled-indexer.mjs';
test('the scheduled job targets the protected route and keeps the secret out of the URL',()=>{
 assert.equal(INDEXER_JOB_URL,'https://grainpad.fun/api/internal/indexer');
 assert.equal(new URL(INDEXER_JOB_URL).search,'');
 assert.equal(INDEXER_CRON,'* * * * *');
});
test('scheduled ingestion uses the protected route and accepts an active lease',async()=>{
 const env={INDEXER_SECRET:'test-only-indexer-credential-123456'},context={};let calls=0;
 for(const status of [200,202])await runScheduledIndexer({fetch:async(request,actualEnv,actualContext)=>{
  calls++;assert.equal(request.url,'https://grainpad.fun/api/internal/indexer');
  assert.equal(request.method,'POST');assert.equal(request.headers.get('Authorization'),`Bearer ${env.INDEXER_SECRET}`);
  assert.equal(actualEnv,env);assert.equal(actualContext,context);return new Response('{}',{status});
 }},env,context);
 assert.equal(calls,2);
});
test('scheduled failures remain failures without exposing credentials or provider diagnostics',async()=>{
 const env={INDEXER_SECRET:'test-only-indexer-credential-123456'};
 for(const status of [401,429,500,503])await assert.rejects(runScheduledIndexer({fetch:async()=>new Response('private diagnostic '+env.INDEXER_SECRET,{status})},env,{}),error=>{
  assert.match(error.message,new RegExp(`^Scheduled indexer failed \\(HTTP ${status}\\)\\.$`));
  assert.equal(error.message.includes(env.INDEXER_SECRET),false);
  assert.equal(error.message.includes('private diagnostic'),false);
  return true;
 });
 await assert.rejects(runScheduledIndexer({fetch:()=>assert.fail('Must not run without a credential')},{},{}),/requires INDEXER_SECRET/);
 await assert.rejects(runScheduledIndexer({fetch:()=>assert.fail('Must not run without a credential')},{INDEXER_SECRET:'too-short'},{}),/requires INDEXER_SECRET/);
});
test('the independent Monero invocation uses the same protected secret without a Solana lease',async()=>{let target;await runScheduledIndexer({fetch:async(request)=>{target=request.url;return new Response('{}');}},{INDEXER_SECRET:'test-only-indexer-credential-123456'},{},'monero');assert.equal(target,INDEXER_JOB_URL+'?action=monero');});
test('authenticated external indexer ticks refresh Monero through the existing secret and independent lease path',async()=>{
 const env={INDEXER_SECRET:'test-only-indexer-credential-123456',MONERO_DAEMON_URL:'https://daemon.test'},tasks=[];let calls=0;
 const context={waitUntil:task=>tasks.push(task)},handler={fetch:async request=>{calls++;assert.equal(request.url,INDEXER_JOB_URL+'?action=monero');assert.equal(request.headers.get('Authorization'),'Bearer '+env.INDEXER_SECRET);return new Response('{}',{status:202});}};
 const tick=new Request(INDEXER_JOB_URL,{method:'POST',headers:{Authorization:'Bearer '+env.INDEXER_SECRET}});
 assert.equal(refreshMoneroOnIndexerTick(tick,handler,env,context),true);await Promise.all(tasks);assert.equal(calls,1);
});
test('public requests, wrong credentials and explicit actions cannot trigger background Monero work',()=>{
 const env={INDEXER_SECRET:'test-only-indexer-credential-123456',MONERO_DAEMON_URL:'https://daemon.test'},context={waitUntil:()=>assert.fail('Must not schedule')},handler={fetch:()=>assert.fail('Must not invoke')};
 for(const request of [new Request(INDEXER_JOB_URL),new Request(INDEXER_JOB_URL,{method:'POST'}),new Request(INDEXER_JOB_URL+'?action=monero',{method:'POST',headers:{Authorization:'Bearer '+env.INDEXER_SECRET}}),new Request('https://grainpad.fun/',{method:'POST',headers:{Authorization:'Bearer '+env.INDEXER_SECRET}})])assert.equal(refreshMoneroOnIndexerTick(request,handler,env,context),false);
 assert.equal(refreshMoneroOnIndexerTick(new Request(INDEXER_JOB_URL,{method:'POST',headers:{Authorization:'Bearer '+env.INDEXER_SECRET}}),handler,{INDEXER_SECRET:env.INDEXER_SECRET},context),false);
});
