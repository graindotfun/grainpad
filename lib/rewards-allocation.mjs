import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {REWARDS_POLICY} from './rewards-policy.mjs';

const U64 = (1n<<64n)-1n;
export function rewardUnits(value,{positive=false}={}) {
  if (typeof value!=='string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw Error('Use integer base-unit strings.');
  const amount=BigInt(value);
  if (amount>U64 || (positive&&amount===0n)) throw Error('Amount outside u64 range.');
  return amount;
}
export function rewardAddress(value) {
  const key=new PublicKey(value);
  if (key.toBase58()!==value) throw Error('Use canonical public addresses.');
  return value;
}
export const rewardsDigest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Full snapshot, not a largest-holders list. Exclusions must be explicit and published. */
export function allocateHolderRewards({mint,slot,budgetRaw,sourceId,holders,excludedOwners=[],supplyRaw,accountedSupplyRaw,payoutMint=REWARDS_POLICY.payoutMint}) {
  rewardAddress(mint);
  if (payoutMint!==REWARDS_POLICY.payoutMint) throw Error('Only wXMR payouts are supported.');
  if (!Number.isSafeInteger(slot)||slot<=0) throw Error('A finalized snapshot slot is required.');
  if (typeof sourceId!=='string'||!/^[-a-zA-Z0-9:_]{1,160}$/.test(sourceId)) throw Error('A unique verified conversion source is required.');
  const budget=rewardUnits(budgetRaw,{positive:true});
  if (rewardUnits(supplyRaw,{positive:true})!==rewardUnits(accountedSupplyRaw,{positive:true})) throw Error('Incomplete supply reconciliation.');
  if (!Array.isArray(holders)||holders.length===0) throw Error('Empty holder snapshot.');
  const exclude=new Set(excludedOwners.map(rewardAddress)),aggregate=new Map();
  let available=0n;
  for (const row of holders) {
    const owner=rewardAddress(row.owner),amount=rewardUnits(row.amountRaw);
    available+=amount;
    if (!exclude.has(owner)) aggregate.set(owner,(aggregate.get(owner)||0n)+amount);
  }
  if (available>BigInt(supplyRaw)) throw Error('Holder balances exceed supply.');
  const sorted=[...aggregate].filter(([,amount])=>amount>0n).sort(([a],[b])=>a<b?-1:a>b?1:0);
  const eligible=sorted.reduce((n,[,amount])=>n+amount,0n);
  if (!eligible) throw Error('No eligible holder balance.');
  const allocations=sorted.map(([owner,balance])=>({owner,holdingRaw:String(balance),amountRaw:String(budget*balance/eligible)}));
  const allocated=allocations.reduce((n,r)=>n+BigInt(r.amountRaw),0n);
  const body={version:REWARDS_POLICY.version,mint,payoutMint,slot,sourceId,budgetRaw,
    supplyRaw,accountedSupplyRaw,excludedOwners:[...exclude].sort(),eligibleRaw:String(eligible),
    allocatedRaw:String(allocated),carryRaw:String(budget-allocated),allocations};
  return {...body,id:rewardsDigest(body)};
}

/** Recompute all amounts: never accept a caller-supplied payout table at face value. */
export function verifyRewardRound(round) {
  const rebuilt=allocateHolderRewards({...round,holders:round.allocations.map(r=>({owner:r.owner,amountRaw:r.holdingRaw}))});
  if (JSON.stringify(rebuilt)!==JSON.stringify(round)) throw Error('Reward round was altered.');
  return rebuilt;
}
