import test from 'node:test';import assert from 'node:assert/strict';
import {createSolSpeculation,SOL_SPECULATIVE_DEBOUNCE_MS,SOL_SPECULATIVE_REFRESH_MS,SOL_SPECULATIVE_MAX_REFRESHES,SOL_SPECULATIVE_MIN_REMAINING_MS} from '../lib/sol-trade-speculation.mjs';
function harness({visible=()=>true,fail=false}={}){
 let clock=1_000_000,seq=0;const timers=new Map(),calls=[];
 const s=createSolSpeculation({now:()=>clock,visible,setTimer:(fn,ms)=>{const id=++seq;timers.set(id,{fn,at:clock+ms});return id;},clearTimer:id=>timers.delete(id),
  prepare:async input=>{calls.push(input);if(fail)throw Error('route unavailable');return {id:'r'+calls.length,expiresAt:clock+60_000};}});
 const advance=async ms=>{clock+=ms;for(const [id,t] of [...timers])if(t.at<=clock){timers.delete(id);t.fn();}for(let i=0;i<5;i++)await Promise.resolve();};
 return {s,calls,advance,timers,now:()=>clock};
}
test('prepares once inputs settle and hands the review out exactly once for the same key',async()=>{
 const h=harness();h.s.update('k1',{a:1});await h.advance(SOL_SPECULATIVE_DEBOUNCE_MS-1);assert.equal(h.calls.length,0);
 await h.advance(1);assert.equal(h.calls.length,1);
 assert.equal(await h.s.take('other'),null);
 const entry=await h.s.take('k1');assert.equal(entry.review.id,'r1');assert.equal(entry.key,'k1');
 assert.equal(await h.s.take('k1'),null);
});
test('changing inputs before the debounce never prepares the stale input',async()=>{
 const h=harness();h.s.update('k1',{a:1});await h.advance(300);h.s.update('k2',{a:2});await h.advance(SOL_SPECULATIVE_DEBOUNCE_MS);
 assert.deepEqual(h.calls,[{a:2}]);assert.equal(await h.s.take('k1'),null);assert.equal((await h.s.take('k2')).review.id,'r1');
});
test('a click waits for a matching in-flight request instead of preparing twice',async()=>{
 const h=harness();h.s.update('k1',{a:1});await h.advance(SOL_SPECULATIVE_DEBOUNCE_MS-1);
 const pending=h.advance(1).then(()=>h.s.take('k1'));
 assert.equal((await pending).review.id,'r1');assert.equal(h.calls.length,1);
});
test('reviews refresh before they age out, stop after the refresh limit, and expiring reviews are never handed out',async()=>{
 const h=harness();h.s.update('k1',{a:1});await h.advance(SOL_SPECULATIVE_DEBOUNCE_MS);
 for(let i=0;i<SOL_SPECULATIVE_MAX_REFRESHES+3;i++)await h.advance(SOL_SPECULATIVE_REFRESH_MS);
 assert.equal(h.calls.length,SOL_SPECULATIVE_MAX_REFRESHES);
 await h.advance(60_000-SOL_SPECULATIVE_MIN_REMAINING_MS);assert.equal(await h.s.take('k1'),null);
});
test('background failures are silent and stop work; a hidden tab does not prepare; an empty key stops',async()=>{
 const failing=harness({fail:true});failing.s.update('k1',{a:1});await failing.advance(SOL_SPECULATIVE_DEBOUNCE_MS);
 assert.equal(await failing.s.take('k1'),null);await failing.advance(SOL_SPECULATIVE_REFRESH_MS*3);assert.equal(failing.calls.length,1);
 const hidden=harness({visible:()=>false});hidden.s.update('k1',{a:1});await hidden.advance(SOL_SPECULATIVE_DEBOUNCE_MS+SOL_SPECULATIVE_REFRESH_MS*2);assert.equal(hidden.calls.length,0);
 const stopped=harness();stopped.s.update('k1',{a:1});await stopped.advance(SOL_SPECULATIVE_DEBOUNCE_MS);stopped.s.update('',null);
 assert.equal(await stopped.s.take('k1'),null);assert.equal(stopped.timers.size,0);
});
