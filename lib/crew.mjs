/** Crew Mode: creator budgets, approvals and payment proof on top of signed room records.
 * Pure helpers; the room route supplies the finalized transaction. Grainpad never holds or moves funds. */
import {QUOTES} from './quote-assets.mjs';

const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
/** Budget and payment assets. The project's own token is named by its mint address. */
export const CREW_ASSETS=Object.freeze({
 SOL:Object.freeze({code:'SOL',mint:null,decimals:9}),
 USDC:Object.freeze({code:'USDC',mint:USDC,decimals:6}),
 wXMR:Object.freeze({code:'wXMR',mint:QUOTES.wXMR.mint,decimals:QUOTES.wXMR.decimals}),
});
export const PROJECT_TOKEN_DECIMALS=6;
/** code is 'SOL' | 'USDC' | 'wXMR' | the project mint. */
export function crewAsset(code,projectMint){
 if(Object.hasOwn(CREW_ASSETS,code))return CREW_ASSETS[code];
 if(code===projectMint)return {code,mint:projectMint,decimals:PROJECT_TOKEN_DECIMALS};
 throw Error('Choose SOL, USDC, wXMR or this project’s token.');
}
export function crewAmountPattern(decimals){return new RegExp(`^(0|[1-9]\\d{0,12})(\\.\\d{1,${decimals}})?$`);}
export function toRaw(text,decimals){const [whole,fraction='']=text.split('.');return BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0'));}
export function fromRaw(raw,decimals){const n=BigInt(raw),base=10n**BigInt(decimals),fraction=(n%base).toString().padStart(decimals,'0').replace(/0+$/,'');return (n/base).toString()+(fraction?'.'+fraction:'');}

const keyOf=k=>typeof k?.pubkey==='string'?k.pubkey:String(k?.pubkey??'');
/** Measure a finalized transfer from payer to recipient by balance change, whatever instruction produced it.
 * Expects jsonParsed encoding. Returns the recipient's net receipt in raw units, or throws. */
export function verifyCrewPayment(tx,{payer,recipient,asset,signature}){
 if(!tx)throw Error('Transaction not found at finalized commitment yet. Retry in a minute; your signed record is kept.');
 if(tx.meta?.err)throw Error('This transaction failed on-chain. Record a successful payment.');
 if(!Array.isArray(tx.transaction?.signatures)||tx.transaction.signatures[0]!==signature)throw Error('Transaction does not match the recorded signature.');
 if(payer===recipient)throw Error('The creator cannot record a payment to their own wallet.');
 const keys=tx.transaction?.message?.accountKeys||[],pubkeys=keys.map(keyOf);
 const signer=keys.findIndex(k=>keyOf(k)===payer&&k.signer===true);
 if(signer<0)throw Error('The on-chain creator wallet did not sign this transaction.');
 let received,sent;
 if(asset.mint===null){
  const r=pubkeys.indexOf(recipient);if(r<0)throw Error('The contributor wallet is not part of this transaction.');
  received=BigInt(tx.meta.postBalances[r])-BigInt(tx.meta.preBalances[r]);
  sent=BigInt(tx.meta.preBalances[signer])-BigInt(tx.meta.postBalances[signer]);
 }else{
  const sum=(list,owner)=>(list||[]).filter(b=>b.mint===asset.mint&&b.owner===owner).reduce((n,b)=>n+BigInt(b.uiTokenAmount?.amount??'0'),0n);
  const mismatched=[...(tx.meta.preTokenBalances||[]),...(tx.meta.postTokenBalances||[])].some(b=>b.mint===asset.mint&&b.uiTokenAmount?.decimals!==undefined&&b.uiTokenAmount.decimals!==asset.decimals);
  if(mismatched)throw Error('Token decimals do not match the budget asset.');
  received=sum(tx.meta.postTokenBalances,recipient)-sum(tx.meta.preTokenBalances,recipient);
  sent=sum(tx.meta.preTokenBalances,payer)-sum(tx.meta.postTokenBalances,payer);
 }
 if(received<=0n)throw Error('The contributor wallet received none of this asset in this transaction.');
 if(sent<=0n)throw Error('The creator wallet did not send this asset in this transaction.');
 return {status:'verified',signature,payer,recipient,asset:asset.code,assetMint:asset.mint,decimals:asset.decimals,amountRaw:received.toString(),slot:tx.slot,blockTime:tx.blockTime??null,commitment:'finalized'};
}

/** Group needs, budgets, approvals and verified payments into a task board. Pure. */
export function crewBoard(tasks,approvals,payments){
 const byNeed=new Map(tasks.map(t=>[t.id,{id:t.id,title:t.title,body:t.body,url:t.url,createdAt:t.created_at,closed:Boolean(t.closed),submissions:Number(t.submissions||0),budget:t.budget_amount?{amount:t.budget_amount,asset:t.budget_asset,signature:t.budget_signature}:null,approved:[],payments:[],paid:{}}]));
 for(const a of approvals){const task=byNeed.get(a.need);if(task)task.approved.push({submission:a.submission,contributor:a.contributor,title:a.title,approvedAt:a.created_at});}
 for(const p of payments){const task=byNeed.get(p.need);if(!task)continue;let v;try{v=JSON.parse(p.verification);}catch{continue;}if(v?.status!=='verified')continue;
  task.payments.push({submission:p.submission,contributor:p.contributor,signature:v.signature,asset:v.asset,amountRaw:v.amountRaw,decimals:v.decimals,slot:v.slot,blockTime:v.blockTime});
  const total=task.paid[v.asset]||{raw:0n,decimals:v.decimals};total.raw+=BigInt(v.amountRaw);task.paid[v.asset]=total;}
 return [...byNeed.values()].map(task=>{
  const paidSubmissions=new Set(task.payments.map(p=>p.submission));
  const status=task.approved.length&&task.approved.every(a=>paidSubmissions.has(a.submission))?'paid':task.approved.length?'approved':task.closed?'closed':'open';
  return {...task,status,paid:Object.entries(task.paid).map(([asset,v])=>({asset,raw:v.raw.toString(),decimals:v.decimals}))};
 });
}
