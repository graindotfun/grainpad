import {crewAsset,crewAmountPattern,toRaw} from './crew.mjs';

/** Coverage is a wallet-balance indicator for a stated budget. It is not escrow and nothing is locked. */
export const FUNDING_MAX_AGE_MS=60_000;

/** Lamports from a getBalance result. Throws when the response is not a plain integer. */
export function lamportBalance(result){
 const value=result?.value;
 if(!Number.isSafeInteger(value)||value<0)throw Error('Balance unavailable.');
 return BigInt(value);
}

/** Sum every account of one mint from a jsonParsed getTokenAccountsByOwner result. Decimals must match exactly. */
export function tokenBalance(result,asset){
 if(!Array.isArray(result?.value))throw Error('Balance unavailable.');
 let total=0n;
 for(const row of result.value){
  const info=row?.account?.data?.parsed?.info,amount=info?.tokenAmount;
  if(info?.mint!==asset.mint)throw Error('Token account does not match the budget asset.');
  if(amount?.decimals!==asset.decimals||typeof amount.amount!=='string'||!/^\d+$/.test(amount.amount))throw Error('Token decimals do not match the budget asset.');
  total+=BigInt(amount.amount);
 }
 return total;
}

/** Distinct budget assets of tasks that could still be funded, resolved against the project mint. */
export function fundingAssets(tasks,projectMint){
 const found=new Map();
 for(const task of tasks){
  if(!task.budget||task.closed||(task.status!=='open'&&task.status!=='approved'))continue;
  try{const asset=crewAsset(task.budget.asset,projectMint);found.set(asset.code===projectMint?projectMint:asset.code,asset);}catch{/* unresolved asset is never Funded */}
 }
 return [...found.values()];
}

/** Pure. A task is Funded only for a resolved asset, a parsed amount and a fresh balance that covers it. */
export function taskCoverage(task,projectMint,balances,{now=Date.now(),maxAge=FUNDING_MAX_AGE_MS}={}){
 if(!task.budget||task.closed||(task.status!=='open'&&task.status!=='approved'))return null;
 let asset;try{asset=crewAsset(task.budget.asset,projectMint);}catch{return null;}
 const key=asset.code===projectMint?projectMint:asset.code,entry=balances[key];
 if(!entry||entry.decimals!==asset.decimals||!Number.isFinite(entry.checkedAt)||now-entry.checkedAt>maxAge||entry.checkedAt>now+60_000)return null;
 if(!crewAmountPattern(asset.decimals).test(task.budget.amount))return null;
 let required,balance;try{required=toRaw(task.budget.amount,asset.decimals);balance=BigInt(entry.raw);}catch{return null;}
 if(required<=0n)return null;
 return {funded:balance>=required,asset:key,decimals:asset.decimals,requiredRaw:required.toString(),balanceRaw:balance.toString(),checkedAt:entry.checkedAt};
}

/** Narrow funding-status cache: one row per (creator wallet, asset) in `room_funding_status`, nothing else.
 * A row is usable for at most FUNDING_MAX_AGE_MS. When it is not usable and a refresh is not allowed or fails,
 * the result is null and no Funded state is shown. `allowRefresh` is the caller's rate limit. */
export async function fundingBalance(db,{creator,key,asset},load,allowRefresh,{now=Date.now(),maxAge=FUNDING_MAX_AGE_MS}={}){
 const row=await db.prepare('SELECT balance_raw,decimals,checked_at FROM room_funding_status WHERE creator=? AND asset=?').bind(creator,key).first();
 if(row&&row.decimals===asset.decimals&&Number.isFinite(row.checked_at)&&now-row.checked_at<=maxAge&&row.checked_at<=now+5_000)return {raw:row.balance_raw,decimals:row.decimals,checkedAt:row.checked_at};
 if(!await allowRefresh())return null;
 const raw=(await load()).toString();
 await db.prepare('INSERT INTO room_funding_status(creator,asset,balance_raw,decimals,checked_at) VALUES(?,?,?,?,?) ON CONFLICT(creator,asset) DO UPDATE SET balance_raw=excluded.balance_raw,decimals=excluded.decimals,checked_at=excluded.checked_at').bind(creator,key,raw,asset.decimals,now).run();
 await db.prepare('DELETE FROM room_funding_status WHERE checked_at<?').bind(now-86_400_000).run();
 return {raw,decimals:asset.decimals,checkedAt:now};
}

/** The public shape of a Funded task: coverage and the minimum needed to explain it. Never the wallet's balance. */
export function publicCoverage(coverage){
 if(!coverage||!coverage.funded)return null;
 return {funded:true,asset:coverage.asset,decimals:coverage.decimals,requiredRaw:coverage.requiredRaw,checkedAt:coverage.checkedAt};
}
