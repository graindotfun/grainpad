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
