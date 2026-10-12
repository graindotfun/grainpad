/** Owner-reviewed payout limits. This module deliberately provides no live defaults. */
const FIELDS=['minimumPayoutRaw','maximumTransactionsPerRound','maximumTransactionFeeLamports','maximumRoundLamports','maximumDailyLamports'];
export function assertRewardCostPolicy(policy){
 if(!policy||typeof policy!=='object'||Array.isArray(policy)||Object.keys(policy).length!==FIELDS.length||FIELDS.some(key=>!Object.hasOwn(policy,key)))throw Error('Configure an explicit approved payout cost policy.');
 if(typeof policy.minimumPayoutRaw!=='string'||!/^[1-9][0-9]*$/.test(policy.minimumPayoutRaw)||BigInt(policy.minimumPayoutRaw)>((1n<<64n)-1n))throw Error('Set a positive minimum payout in wXMR base units.');
 for(const key of FIELDS.slice(1))if(!Number.isSafeInteger(policy[key])||policy[key]<1)throw Error(`Set an explicit positive ${key}.`);
 return Object.fromEntries(FIELDS.map(key=>[key,policy[key]]));
}
export function rewardPayoutMaximumCost({recipients,transactions,ataRentLamports,markerRentLamports,payoutCostPolicy}){
 const policy=assertRewardCostPolicy(payoutCostPolicy);
 for(const [key,n] of Object.entries({recipients,transactions,ataRentLamports,markerRentLamports}))if(!Number.isSafeInteger(n)||n<0||((key==='ataRentLamports'||key==='markerRentLamports')&&n===0))throw Error('Live payout account rents and bounded counts are required.');
 const amount=BigInt(recipients)*BigInt(ataRentLamports)+BigInt(transactions)*(BigInt(markerRentLamports)+BigInt(policy.maximumTransactionFeeLamports));
 if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Payout cost exceeds the supported lamport range.');
 return Number(amount);
}
