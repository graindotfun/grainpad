export const PRIORITY_DEFAULTS=Object.freeze({PRIORITY_FEE_FLOOR_MICROLAMPORTS:10000,PRIORITY_FEE_CAP_MICROLAMPORTS:100000});
export function priorityPolicy(env={}){
 const value=key=>env[key]===undefined||env[key]===''?PRIORITY_DEFAULTS[key]:env[key];
 const floor=Number(value('PRIORITY_FEE_FLOOR_MICROLAMPORTS')),cap=Number(value('PRIORITY_FEE_CAP_MICROLAMPORTS'));
 if(!Number.isSafeInteger(floor)||!Number.isSafeInteger(cap)||floor<0||cap<floor||cap>1_000_000_000)throw Error('Invalid priority fee bounds.');
 return {floor,cap};
}
export function selectPriorityFee(samples,policy,units){
 const {floor,cap}=priorityPolicy({PRIORITY_FEE_FLOOR_MICROLAMPORTS:policy.floor,PRIORITY_FEE_CAP_MICROLAMPORTS:policy.cap});
 const values=(Array.isArray(samples)?samples:[]).map(s=>s.prioritizationFee).filter(n=>Number.isSafeInteger(n)&&n>=0).sort((a,b)=>a-b);
 const sampled=values.length?values[Math.max(0,Math.ceil(values.length*.75)-1)]:floor;
 const microLamports=Math.min(cap,Math.max(floor,sampled));
 return {microLamports,floor,cap,units,lamports:Math.ceil(units*microLamports/1_000_000),source:values.length?'recent-p75':'floor-no-samples',samples:values.length};
}
export async function estimatePriorityFee(connection,instructions,policy,units){
 const locked=[...new Map(instructions.flatMap(ix=>ix.keys.filter(k=>k.isWritable).map(k=>[k.pubkey.toBase58(),k.pubkey]))).values()].slice(0,128);
 try{return selectPriorityFee(await connection.getRecentPrioritizationFees({lockedWritableAccounts:locked}),policy,units);}
 catch{return {...selectPriorityFee([],policy,units),source:'floor-provider-unavailable'};}
}
let cached;
/** Only public bounds leave this endpoint. RPC credentials remain server-side. */
export async function publicPriorityPolicy(){
 if(cached&&cached.expires>Date.now())return cached.policy;
 const r=await fetch('/api/rpc-policy',{cache:'no-store'});if(!r.ok)throw Error('Priority fee bounds are unavailable. Retry the review.');
 const value=await r.json(),policy=priorityPolicy(value);cached={expires:Date.now()+60000,policy};return policy;
}
