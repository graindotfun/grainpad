import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {REWARDS_POLICY} from './rewards-policy.mjs';
import {assertRewardCostPolicy,rewardPayoutMaximumCost} from './rewards-cost-policy.mjs';

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
  const allocation=allocateHolderRewards({...round,holders:round.allocations.map(r=>({owner:r.owner,amountRaw:r.holdingRaw}))});
  const rebuilt=round.settlement?settleHolderRewards(allocation,{credits:round.settlement.credits,payoutCostPolicy:round.settlement.payoutCostPolicy,ataRentLamports:round.settlement.ataRentLamports,markerRentLamports:round.settlement.markerRentLamports,unpayableOwners:round.settlement.unpayable||[]}):allocation;
  if (JSON.stringify(rebuilt)!==JSON.stringify(round)) throw Error('Reward round was altered.');
  return rebuilt;
}

/** Earned dust remains the same owner's liability, even after they sell their holding.
 * Only the unallocated pro-rata rounding remainder is shared by a later snapshot.
 * The journal independently checks the entire prior-credit input before reservation.
 */
export function settleHolderRewards(round,{credits=[],payoutCostPolicy,ataRentLamports,markerRentLamports,unpayableOwners=[]}){
 if(round.settlement)throw Error('A reward allocation may be settled only once.');
 verifyRewardRound(round);
 const policy=assertRewardCostPolicy(payoutCostPolicy);
 rewardPayoutMaximumCost({recipients:0,transactions:0,ataRentLamports,markerRentLamports,payoutCostPolicy:policy});
 if(!Array.isArray(credits))throw Error('Provide the complete per-owner deferred-credit ledger.');
 const balances=new Map();
 for(const row of credits){const owner=rewardAddress(row.owner),amount=rewardUnits(row.amountRaw,{positive:true});if(Object.keys(row).length!==2||balances.has(owner))throw Error('Deferred credits must be unique canonical owner balances.');balances.set(owner,amount);}
 const prior=[...balances].sort(([a],[b])=>(a<b?-1:a>b?1:0)).map(([owner,amount])=>({owner,amountRaw:String(amount)}));
 for(const row of round.allocations)balances.set(row.owner,(balances.get(row.owner)||0n)+BigInt(row.amountRaw));
 for(const amount of balances.values())rewardUnits(String(amount));
 // GP-01: owners whose token account cannot receive stay as conserved deferred credit.
 const unpayable=[...new Set(unpayableOwners.map(rewardAddress))].sort(),blocked=new Set(unpayable);
 const eligible=[...balances].filter(([owner,amount])=>amount>=BigInt(policy.minimumPayoutRaw)&&!blocked.has(owner)).sort(([a,aa],[b,bb])=>aa===bb?(a<b?-1:a>b?1:0):aa>bb?-1:1);
 const payouts=[];
 for(const [owner,amount] of eligible){
  const recipients=payouts.length+1,transactions=Math.ceil(recipients/6);
  const cost=rewardPayoutMaximumCost({recipients,transactions,ataRentLamports,markerRentLamports,payoutCostPolicy:policy});
  if(transactions>policy.maximumTransactionsPerRound||cost>policy.maximumRoundLamports||cost>policy.maximumDailyLamports)break;
  payouts.push({owner,amountRaw:String(amount)});balances.delete(owner);
 }
 const deferred=[...balances].filter(([,amount])=>amount>0n).sort(([a],[b])=>(a<b?-1:a>b?1:0)).map(([owner,amount])=>({owner,amountRaw:String(amount)}));
 const sum=rows=>rows.reduce((n,row)=>n+BigInt(row.amountRaw),0n);
 const maximumCostLamports=rewardPayoutMaximumCost({recipients:payouts.length,transactions:Math.ceil(payouts.length/6),ataRentLamports,markerRentLamports,payoutCostPolicy:policy});
 const settlement={version:'owner-credits-v1',payoutCostPolicy:policy,ataRentLamports,markerRentLamports,credits:prior,payouts,deferred,priorCreditRaw:String(sum(prior)),payoutRaw:String(sum(payouts)),deferredRaw:String(sum(deferred)),maximumCostLamports,...(unpayable.length?{unpayable}:{})};
 if(BigInt(settlement.priorCreditRaw)+BigInt(round.allocatedRaw)!==BigInt(settlement.payoutRaw)+BigInt(settlement.deferredRaw))throw Error('Holder credit conservation failed.');
 const {id:allocationId,...allocation}=round,body={...allocation,allocationId,settlement};
 return {...body,id:rewardsDigest(body)};
}
export function rewardPayoutAllocations(round){
 verifyRewardRound(round);
 if(!round.settlement)throw Error('Payouts require an explicit cost policy and frozen deferred-credit settlement.');
 return round.settlement.payouts;
}
