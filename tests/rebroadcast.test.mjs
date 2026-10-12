import test from 'node:test';import assert from 'node:assert/strict';
import {rebroadcastSigned} from '../lib/rebroadcast.mjs';
function fixture(){
 let height=1,time=0;const wires=[],events=[];const connection={
  getBlockHeight:async()=>height,getSignatureStatuses:async()=>({value:[null]}),
  sendRawTransaction:async bytes=>{wires.push([...bytes]);return 'signature';},
  getLatestBlockhash:()=>{throw Error('MUST NOT REBUILD');}
 };
 return {connection,wires,events,setHeight:h=>{height=h;},options:{connection,wire:Uint8Array.from([1,2,3]),signature:'signature',lastValidBlockHeight:5,now:()=>time,sleep:async ms=>{time+=ms;height++;},onEvent:(stage,detail)=>events.push({stage,...detail})}};
}
test('dropped sends rebroadcast identical bytes until confirmed; no replacement/signing',async()=>{
 const f=fixture();f.connection.getSignatureStatuses=async()=>({value:[f.wires.length===3?{confirmationStatus:'confirmed',err:null}:null]});
 assert.equal(await rebroadcastSigned(f.options),'signature');assert.equal(f.wires.length,3);assert(f.wires.every(w=>JSON.stringify(w)==='[1,2,3]'));
 assert.equal(f.events.at(-1).stage,'confirmed');
});
test('a lost send response with confirmed status succeeds without duplicate review',async()=>{
 const f=fixture();f.connection.sendRawTransaction=async()=>{f.wires.push([1,2,3]);throw Error('Network timeout');};
 f.connection.getSignatureStatuses=async()=>({value:[{confirmationStatus:'finalized',err:null}]});
 assert.equal(await rebroadcastSigned(f.options),'signature');assert.equal(f.wires.length,1);assert(f.events.some(e=>e.stage==='rebroadcast_retry'));
});
test('expiry stops retransmission and a pre-expired transaction is never submitted',async()=>{
 const f=fixture();await assert.rejects(()=>rebroadcastSigned({...f.options,lastValidBlockHeight:3}),/Blockhash expired/);assert.equal(f.wires.length,3);
 const expired=fixture();expired.setHeight(6);await assert.rejects(()=>rebroadcastSigned(expired.options),/Blockhash expired/);assert.equal(expired.wires.length,0);
});
test('on-chain failure and mismatched returned signature stop immediately',async()=>{
 const f=fixture();f.connection.getSignatureStatuses=async()=>({value:[{err:{InstructionError:[1,'Custom']}}]});
 await assert.rejects(()=>rebroadcastSigned(f.options),/Transaction failed/);assert.equal(f.wires.length,1);
 const wrong=fixture();wrong.connection.sendRawTransaction=async()=> 'other-signature';await assert.rejects(()=>rebroadcastSigned(wrong.options),/unexpected signature/);
});
test('unknown height never authorizes a rebroadcast; sustained outage preserves receipt guidance',async()=>{
 const f=fixture();f.connection.getBlockHeight=async()=>{throw Error('offline');};
 await assert.rejects(()=>rebroadcastSigned({...f.options,unavailableMs:5000}),/Keep the saved signature/);assert.equal(f.wires.length,0);
});
const refusal=(forwarded,status=400)=>Error(`${status} Bad Request: ${JSON.stringify({error:'The reviewed lookup slot is too old to create the table. Review again. Nothing was sent.',forwarded})}`);
test('a relay refusal before any forwarding stops at once and reports nothing sent',async()=>{
 const f=fixture();let sleeps=0;f.connection.sendRawTransaction=async bytes=>{f.wires.push([...bytes]);throw refusal(false);};
 await assert.rejects(()=>rebroadcastSigned({...f.options,lastValidBlockHeight:500,sleep:async()=>{sleeps++;}}),error=>error.notSubmitted===true&&/refused this transaction before submission: The reviewed lookup slot is too old.*Nothing was sent\.$/.test(error.message));
 assert.equal(f.wires.length,1);assert.equal(sleeps,0);
 const rejected=f.events.find(e=>e.stage==='relay_rejected');assert.equal(rejected.submissionAttempted,false);assert.equal(rejected.relayRejected,true);
});
test('after an accepted or uncertain send, a refused resend keeps checking status until expiry',async()=>{
 for(const first of ['accepted','timeout']){
  const f=fixture();let confirmedAt=4;
  f.connection.sendRawTransaction=async bytes=>{f.wires.push([...bytes]);if(f.wires.length===1){if(first==='timeout')throw Error('Network timeout');return 'signature';}throw refusal(false);};
  f.connection.getSignatureStatuses=async()=>({value:[f.wires.length>=confirmedAt?{confirmationStatus:'confirmed',err:null}:null]});
  assert.equal(await rebroadcastSigned({...f.options,lastValidBlockHeight:50}),'signature');
  assert.equal(f.events.some(e=>e.stage==='relay_rejected'),false);
  const lost=fixture();lost.connection.sendRawTransaction=async bytes=>{lost.wires.push([...bytes]);if(lost.wires.length===1)return 'signature';throw refusal(false);};
  await assert.rejects(()=>rebroadcastSigned(lost.options),/Blockhash expired/);assert(lost.wires.length>1);
  confirmedAt=0;
 }
});
test('rate limits, forwarded failures and unparseable errors are not treated as refusals',async()=>{
 for(const error of [refusal(true),Error('429 Too Many Requests: {"error":"budget","forwarded":false}'),Error('400 Bad Request: not json'),Error('fetch failed')]){
  const f=fixture();f.connection.sendRawTransaction=async bytes=>{f.wires.push([...bytes]);throw error;};
  await assert.rejects(()=>rebroadcastSigned(f.options),/Blockhash expired/);assert(f.wires.length>1);
 }
});

test('close-only reconciliation recognizes an already landed signature without any resend',async()=>{
 const f=fixture();f.connection.getSignatureStatuses=async()=>({value:[{confirmationStatus:'finalized',err:null}]});
 assert.equal(await rebroadcastSigned({...f.options,reconcileBySignature:true}),'signature');assert.equal(f.wires.length,0);
});
test('close-only success racing a relay refusal is recognized by signature; uncertain refusal preserves receipt',async()=>{
 const f=fixture();f.connection.sendRawTransaction=async bytes=>{f.wires.push([...bytes]);throw refusal(false);};
 f.connection.getSignatureStatuses=async()=>({value:[f.wires.length?{confirmationStatus:'confirmed',err:null}:null]});
 assert.equal(await rebroadcastSigned({...f.options,reconcileBySignature:true}),'signature');assert.equal(f.wires.length,1);
 const uncertain=fixture();uncertain.connection.sendRawTransaction=async()=>{throw refusal(false);};
 await assert.rejects(()=>rebroadcastSigned({...uncertain.options,reconcileBySignature:true}),e=>!e.notSubmitted&&/Keep the saved signature/.test(e.message));
});
