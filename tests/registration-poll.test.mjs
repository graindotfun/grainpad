import test from 'node:test';import assert from 'node:assert/strict';
import {waitForRegistration,RegistrationPending} from '../lib/registration-poll.mjs';
const ok=()=>Response.json({mint:'mint',pool:'pool'});
test('bounded verifier retries rate limits, outages and transport loss without resending chain transactions',async()=>{
 let calls=0;const fetcher=async(path,init)=>{assert.equal(path,'/api/launches');assert.equal(init.method,'POST');calls++;if(calls===1)throw new TypeError('network');if(calls===2)return new Response('',{status:503});if(calls===3)return Response.json({},{status:429});return ok();};
 assert.equal((await waitForRegistration({mint:'mint'},{fetcher,sleep:async()=>{},attempts:4})).pool,'pool');assert.equal(calls,4);
});
test('hanging request times out; terminal rejection and mismatched identity do not retry',async()=>{
 await assert.rejects(waitForRegistration({mint:'mint'},{fetcher:()=>new Promise(()=>{}),attempts:1,timeoutMs:5}),RegistrationPending);
 await assert.rejects(waitForRegistration({mint:'mint'},{fetcher:async()=>Response.json({error:'wrong creator'},{status:400})}),/wrong creator/);
 await assert.rejects(waitForRegistration({mint:'other'},{fetcher:ok}),/Invalid registration/);
});
