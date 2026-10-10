import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPendingLaunchRecovery,PENDING_LAUNCH_KEY} from '../lib/launch-pending-recovery.mjs';
import {waitForRegistration,RegistrationPending} from '../lib/registration-poll.mjs';
const receipt={network:'mainnet-beta',mint:'original-mint',owner:'original-creator',metadataHash:'original-hash',signature:'original-signature'};
const row={network:receipt.network,mint:receipt.mint,creator:receipt.owner,pool:'verified-pool'};
function memory(value=receipt){let stored=JSON.stringify(value),removals=0;return{getItem:key=>{assert.equal(key,PENDING_LAUNCH_KEY);return stored;},removeItem:key=>{assert.equal(key,PENDING_LAUNCH_KEY);stored=null;removals++;},replace:value=>{stored=JSON.stringify(value);},get value(){return stored;},get removals(){return removals;}};}
test('restored receipt verifies original creator through normal registration, with no wallet or resubmission',async()=>{
 const storage=memory();let calls=0;
 const result=await createPendingLaunchRecovery().check(receipt,{storage,isCurrent:()=>true,register:body=>waitForRegistration(body,{attempts:1,fetcher:async(url,init)=>{calls++;assert.equal(url,'/api/launches');assert.equal(init.method,'POST');assert.deepEqual(JSON.parse(init.body),{network:receipt.network,mint:receipt.mint,owner:receipt.owner,metadataHash:receipt.metadataHash});return Response.json(row);}})});
 assert.deepEqual(result,row);assert.equal(calls,1);assert.equal(storage.value,null);assert.equal(storage.removals,1);
});
test('unknown finality and terminal verification failure preserve receipt and permit a later check',async()=>{
 const recovery=createPendingLaunchRecovery(),storage=memory();
 for(const status of [202,400])await assert.rejects(recovery.check(receipt,{storage,isCurrent:()=>true,register:body=>waitForRegistration(body,{attempts:1,fetcher:async()=>Response.json({error:'unverified'},{status})})}),status===202?RegistrationPending:/unverified/);
 assert.equal(storage.value,JSON.stringify(receipt));assert.equal(storage.removals,0);
 assert.deepEqual(await recovery.check(receipt,{storage,isCurrent:()=>true,register:async()=>row}),row);
});
test('automatic and manual checks share the same in-flight observation',async()=>{
 let resolve,calls=0;const storage=memory(),recovery=createPendingLaunchRecovery();const options={storage,isCurrent:()=>true,register:()=>{calls++;return new Promise(done=>{resolve=done;});}};
 const first=recovery.check(receipt,options),second=recovery.check({...receipt},options);assert.equal(first,second);resolve(row);await Promise.all([first,second]);assert.equal(calls,1);assert.equal(storage.removals,1);
});
test('late observation after unmount or changed pending identity cannot clear storage',async()=>{
 let resolve,current=true;const storage=memory();const observation=createPendingLaunchRecovery().check(receipt,{storage,isCurrent:()=>current,register:()=>new Promise(done=>{resolve=done;})});current=false;resolve(row);assert.equal(await observation,null);assert.equal(storage.removals,0);
});
test('another tab receipt is not discarded by a late successful observation',async()=>{
 let resolve;const storage=memory();const observation=createPendingLaunchRecovery().check(receipt,{storage,isCurrent:()=>true,register:()=>new Promise(done=>{resolve=done;})});const next={...receipt,mint:'next-mint',signature:'next-signature'};storage.replace(next);resolve(row);await assert.rejects(observation,/Another launch receipt/);assert.equal(storage.value,JSON.stringify(next));assert.equal(storage.removals,0);
});
for(const field of ['mint','creator','network','pool'])test(`wrong registered ${field} cannot unlock another launch`,async()=>{
 const storage=memory();await assert.rejects(createPendingLaunchRecovery().check(receipt,{storage,isCurrent:()=>true,register:async()=>({...row,[field]:field==='pool'?'':'foreign'})}),/different identity/);assert.equal(storage.removals,0);
});
test('storage failure retains pending state instead of claiming successful recovery',async()=>{
 await assert.rejects(createPendingLaunchRecovery().check(receipt,{storage:{getItem:()=>JSON.stringify(receipt),removeItem:()=>{throw Error('storage denied');}},isCurrent:()=>true,register:async()=>row}),/storage denied/);
});
test('workspace places receipt recovery before disabled fields and only verified launches can reset',()=>{
 const source=readFileSync(new URL('../components/launch-workspace.tsx',import.meta.url),'utf8');
 assert.ok(source.indexOf('aria-label="Previous launch receipt"')<source.indexOf('<h2>Token identity</h2>'));
 assert.match(source,/void recover\(pendingData,true\)/);
 assert.match(source,/automatic\?\{attempts:1\}:undefined/);
 assert.match(source,/function prepareAnother\(\)\{if\(!result\|\|pending.current\|\|busy\)return/);
 assert.match(source,/async function prepare\(\)\{if\(pending.current\|\|signature\|\|busy\|\|uploadsPending.current\)return/);
 assert.match(source,/const locked=!!busy\|\|!!signature/);
});

function archivedMemory(){const values=new Map([[PENDING_LAUNCH_KEY,JSON.stringify(receipt)]]);return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
for(const status of ['failed','expired'])test(`proven ${status} archives the original receipt before unlocking, without registration`,async()=>{
 const storage=archivedMemory();let registered=false;
 const result=await createPendingLaunchRecovery().check(receipt,{storage,isCurrent:()=>true,inspect:async saved=>{assert.deepEqual(saved,receipt);return {status};},register:async()=>{registered=true;return row;}});
 assert.deepEqual(result,{settledStatus:status});assert.equal(registered,false);assert.equal(storage.getItem(PENDING_LAUNCH_KEY),null);
 const archive=JSON.parse(storage.getItem(`grainpad-launch-history:${receipt.signature}`));assert.deepEqual(archive.receipt,receipt);assert.equal(archive.status,status);
});
for(const status of ['unknown','pending'])test(`${status} chain observation keeps the launch locked and never registers`,async()=>{
 const storage=archivedMemory();await assert.rejects(createPendingLaunchRecovery().check(receipt,{storage,isCurrent:()=>true,inspect:async()=>({status}),register:()=>{throw Error('must not register');}}),/still pending/);
 assert.equal(storage.getItem(PENDING_LAUNCH_KEY),JSON.stringify(receipt));assert.equal(storage.values.size,1);
});
test('finalized successful observation proceeds to identity registration',async()=>{
 const storage=archivedMemory();assert.deepEqual(await createPendingLaunchRecovery().check(receipt,{storage,isCurrent:()=>true,inspect:async()=>({status:'finalized'}),register:async()=>row}),row);
});
test('failed archival storage leaves the unresolved receipt locked',async()=>{
 const storage=archivedMemory();storage.setItem=()=>{throw Error('archive unavailable');};await assert.rejects(createPendingLaunchRecovery().check(receipt,{storage,isCurrent:()=>true,inspect:async()=>({status:'expired'}),register:async()=>row}),/archive unavailable/);assert.equal(storage.getItem(PENDING_LAUNCH_KEY),JSON.stringify(receipt));
});
test('a newer receipt cannot be released by a settled old attempt',async()=>{
 const storage=archivedMemory();let resolve;const pending=createPendingLaunchRecovery().check(receipt,{storage,isCurrent:()=>true,inspect:()=>new Promise(done=>{resolve=done;}),register:async()=>row});const newer={...receipt,signature:'new-signature'};storage.setItem(PENDING_LAUNCH_KEY,JSON.stringify(newer));resolve({status:'expired'});await assert.rejects(pending,/Another launch receipt/);assert.equal(storage.getItem(PENDING_LAUNCH_KEY),JSON.stringify(newer));
});
