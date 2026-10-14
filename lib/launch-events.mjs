/** Verifiable on-chain launch and graduation events for a LaunchLab token.
 * A time is only returned when the exact instruction that defines the event was found in a successful, finalized transaction.
 * Signature history is walked to its end with `before` pagination; "oldest transaction in one response" is never taken as the event.
 * Anything unresolved returns a status instead of a guess. */
import {createHash} from 'node:crypto';
import {LAUNCH_PROGRAMS} from './launch-registration.mjs';
import {Buffer} from 'buffer';
import bs58 from 'bs58';
const INITIALIZERS=new Set(['4399af27da102620','25be7ede2c9aab11']);   // initialize_v2, initialize_with_token_2022
function eventMessage(tx){
 const message=tx?.transaction?.message;if(!message)return null;
 const loaded=tx.meta?.loadedAddresses;
 return {...message,accountKeys:[...(message.accountKeys||[]),...(loaded?.writable||[]),...(loaded?.readonly||[])]};
}
function keyAt(message,index){const key=message?.accountKeys?.[index];return typeof key==='string'?key:key?.pubkey||null;}
function accountAt(message,ix,slot){
 const value=ix.accounts?.[slot];
 if(typeof value==='number')return keyAt(message,value);
 if(typeof value==='string'&&message?.accountKeys)return value.length>=32?value:keyAt(message,Number(value));
 return typeof value==='string'?value:null;
}
function programOf(message,ix){
 if(typeof ix.programId==='string')return ix.programId;
 if(typeof ix.programIdIndex==='number')return keyAt(message,ix.programIdIndex);
 return null;
}
function instructionData(ix){
 if(typeof ix.data!=='string'||!ix.data)return null;
 try{return Buffer.from(bs58.decode(ix.data));}catch{return Buffer.from(ix.data,'base64');}
}
/** Mint from an initialize instruction whose platform account is exactly this PlatformConfig (same rule the launch scanner uses). */
function launchMintFromTransaction(tx,platformId){
 const message=eventMessage(tx);
 if(!message||tx?.meta?.err)return null;
 const instructions=[...(message.instructions||[]),...(tx.meta?.innerInstructions||[]).flatMap(inner=>inner.instructions||[])];
 for(const ix of instructions){
  if(programOf(message,ix)!==LAUNCH_PROGRAMS['mainnet-beta'])continue;
  const data=instructionData(ix);
  if(!data||data.length<8||!INITIALIZERS.has(data.subarray(0,8).toString('hex')))continue;
  if(accountAt(message,ix,3)!==platformId)continue;
  return accountAt(message,ix,6);
 }
 return null;
}
const PAGE=1000,MAX_PAGES=40,MAX_CANDIDATES=12;
/** Anchor discriminator of LaunchLab `migrate_to_cpswap`, the instruction that moves a completed curve into its Raydium CPMM pool. */
export const MIGRATE_TO_CPSWAP=createHash('sha256').update('global:migrate_to_cpswap').digest('hex').slice(0,16);
const isoSeconds=seconds=>Number.isSafeInteger(seconds)&&seconds>0&&seconds*1000<=Date.now()+60_000?new Date(seconds*1000).toISOString():null;
/** Every successful signature that touched `address`, newest first, or a status when the walk cannot be completed. */
async function successfulHistory(chain,address,{pageSize=PAGE,maxPages=MAX_PAGES}={}){
 const found=[];let before;
 for(let page=0;page<maxPages;page++){
  const rows=await chain('getSignaturesForAddress',[address,{limit:pageSize,commitment:'finalized',...(before?{before}:{})}]);
  if(!Array.isArray(rows))return {status:'unavailable'};
  found.push(...rows.filter(row=>row&&typeof row.signature==='string'&&!row.err));
  if(rows.length<pageSize)return {status:'complete',signatures:found};
  before=rows.at(-1)?.signature;if(!before)return {status:'unavailable'};
 }
 return {status:'incomplete'};
}
async function firstMatching(chain,history,match){
 // Oldest first. Position inside a slot is not trusted: each candidate is checked by its instructions.
 for(const row of [...history.signatures].reverse().slice(0,MAX_CANDIDATES)){
  const tx=await chain('getTransaction',[row.signature,{encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:0}]);
  if(!tx)return {status:'unavailable'};
  if(tx.meta?.err)continue;
  const verdict=match(tx);
  if(verdict){const at=isoSeconds(tx.blockTime);return at?{status:'found',at,signature:row.signature,slot:tx.slot}:{status:'unavailable'};}
 }
 return {status:'not-found'};
}
/** The transaction that initialized this mint's LaunchLab pool under this PlatformConfig. */
export async function findLaunchEvent(chain,{pool,mint,platformId}){
 const history=await successfulHistory(chain,pool);
 if(history.status!=='complete')return {status:history.status};
 return firstMatching(chain,history,tx=>launchMintFromTransaction(tx,platformId)===mint);
}
function migrationOf(tx,launchPool,cpmmPool){
 const message=eventMessage(tx);if(!message)return false;
 const instructions=[...(message.instructions||[]),...(tx.meta?.innerInstructions||[]).flatMap(inner=>inner.instructions||[])];
 return instructions.some(ix=>{
  if(programOf(message,ix)!==LAUNCH_PROGRAMS['mainnet-beta'])return false;
  const data=instructionData(ix);if(!data||data.length<8||data.subarray(0,8).toString('hex')!==MIGRATE_TO_CPSWAP)return false;
  const accounts=(ix.accounts||[]).map((_,slot)=>accountAt(message,ix,slot));
  return accounts.includes(launchPool)&&accounts.includes(cpmmPool);
 });
}
/** The successful MigrateToCpswap transaction that created this token's CPMM pool. Its block time is the graduation time. */
export async function findGraduationEvent(chain,{launchPool,cpmmPool}){
 const history=await successfulHistory(chain,cpmmPool);
 if(history.status!=='complete')return {status:history.status};
 return firstMatching(chain,history,tx=>migrationOf(tx,launchPool,cpmmPool));
}
