import {waitUntil} from 'cloudflare:workers';
import {sharedMarketCache as readSharedCache} from './shared-market-cache.mjs';
/** A visitor navigating away must not strand the shared refresh lease. */
export function sharedMarketCache(...args:Parameters<typeof readSharedCache>){
 const task=readSharedCache(...args);
 waitUntil(task.catch(()=>{}));
 return task;
}
