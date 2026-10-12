import test from 'node:test';import assert from 'node:assert/strict';
import {startViewerPolling} from '../lib/viewer-polling.mjs';
const settle=()=>new Promise(r=>setImmediate(r));
test('hidden/unmounted pages stop all future requests, resume on visibility, and abort in-flight requests',async()=>{
 let listener;const timers=new Map(),signals=[];let id=0;
 const document={hidden:true,addEventListener:(_,fn)=>{listener=fn;},removeEventListener:()=>{listener=null;}};
 const stop=startViewerPolling(async signal=>{signals.push(signal);},{document,setTimer:fn=>{timers.set(++id,fn);return id;},clearTimer:id=>timers.delete(id)});
 await settle();assert.equal(signals.length,0);
 document.hidden=false;listener();await settle();assert.equal(signals.length,1);assert.equal(timers.size,1);
 document.hidden=true;listener();assert.equal(signals[0].aborted,true);assert.equal(timers.size,0);
 document.hidden=false;listener();await settle();assert.equal(signals.length,2);
 stop();assert.equal(signals[1].aborted,true);assert.equal(timers.size,0);assert.equal(listener,null);
});
