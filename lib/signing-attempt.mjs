/** Public diagnostics only: never retain a signed transaction or a private key. */
export const REVIEW_WINDOW_MS=120000;
export const PLATFORM_ATTEMPT_KEY='grainpad-platform-attempt-v1';
export function diagnosticText(value){return String(value).replace(/https?:\/\/[^\s"']+/g,'[URL]').slice(0,3000);}
export function safeStore(key,value){try{globalThis.localStorage?.setItem(key,value);return !!globalThis.localStorage;}catch{return false;}}
export function safeRead(key){try{return globalThis.localStorage?.getItem(key)||null;}catch{return null;}}
export function safeRemove(key){try{globalThis.localStorage?.removeItem(key);}catch{/* A storage failure must not hide the transaction outcome. */}}
/** @typedef {{id:string,stage:string,failedAt?:string,owner:string,target?:string,step?:string,createdAt:number,updatedAt:number,reviewCreatedAt:number,lastValidBlockHeight:number,blockhash:string,walletReturned:boolean,submissionAttempted:boolean,rpcAccepted:boolean,signature?:string,error?:string,errorName?:string,errorCode?:string,logs?:string[],storageAvailable?:boolean,events:Array<{stage:string,at:number}>,[key:string]:any}} SigningAttempt */
/** @param {any} prepared @param {(value:SigningAttempt)=>void} [observer] */
export function createSigningAttempt(prepared,observer){
 /** @type {SigningAttempt} */
 let current={id:`${Date.now()}-${Math.random().toString(36).slice(2,10)}`,stage:'preflight',owner:prepared.owner,target:prepared.targetAccount,step:prepared.setupStep,createdAt:Date.now(),updatedAt:Date.now(),reviewCreatedAt:prepared.createdAt,lastValidBlockHeight:prepared.lastValidBlockHeight,blockhash:prepared.blockhash,walletReturned:false,submissionAttempted:false,rpcAccepted:false,events:[]};
 function update(stage,details={}){
  current={...current,...details,stage,updatedAt:Date.now(),events:[...current.events,{stage,at:Date.now()}].slice(-24)};
  // Diagnostic observers cannot prevent a send or conceal its outcome.
  try{observer?.(structuredClone(current));}catch{}
  return current;
 }
 function fail(error){
  const failedAt=current.stage;
  const detail=diagnosticText(error?.message??error);
  const message=current.submissionAttempted
   ? `Submission was attempted; check this signature before retrying. ${detail}`
   : current.walletReturned
    ? `Phantom returned a transaction, but it was not submitted. ${detail}`
    : `No submission was attempted. ${detail}`;
  update('error',{failedAt,error:message,errorName:diagnosticText(error?.name||'Error'),errorCode:error?.code==null?undefined:diagnosticText(error.code),logs:Array.isArray(error?.logs??error?.transactionLogs)?(error.logs??error.transactionLogs).slice(-25).map(diagnosticText):undefined});
  return Error(message,{cause:error});
 }
 update('preflight');
 return {update,fail,get:()=>current};
}
/** @param {SigningAttempt} attempt */
export function savePlatformAttempt(attempt){
 const value={...attempt,storageAvailable:true};
 if(!safeStore(PLATFORM_ATTEMPT_KEY,JSON.stringify(value)))value.storageAvailable=false;
 return value;
}
/** @returns {SigningAttempt|null} */
export function readPlatformAttempt(){
 try{const a=JSON.parse(safeRead(PLATFORM_ATTEMPT_KEY)||'null');return a&&typeof a.id==='string'&&Array.isArray(a.events)?a:null;}catch{return null;}
}
export function assertReviewFresh(prepared,afterWallet=false){
 if(Date.now()-prepared.createdAt>REVIEW_WINDOW_MS)throw Error(afterWallet
  ? 'The 120-second review expired while the wallet was open. Prepare a fresh review; this transaction was not sent.'
  : 'The quote is older than 120 seconds. Prepare again for a fresh review.');
}
