import {AsyncLocalStorage} from 'node:async_hooks';
// Server-only scope, entered only after the relay verifies every signature.
// Buyback policy validation still runs; its reads cannot be daily-budget blocked.
const validation=new AsyncLocalStorage();
export const withSubmissionValidation=task=>validation.run(true,task);
export const isSubmissionValidation=()=>validation.getStore()===true;
