/** Unsigned production acceptance only. No caller-selected accounts, size or relay. */
const mint='FGrHB6tEqXNfMBXZ4xNoa6hKwjWCjjxwijeB5uKLvgrn';
const admin='FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM';
const holder='ARu4n5mFdZogZAravu7CcizaojWnS6oqka37gdLT5SZn';
export function solAcceptanceInput(name){
 if(!['admin-buy','holder-buy','holder-sell'].includes(name))throw Error('Choose a supported unsigned acceptance case.');
 const sell=name==='holder-sell';return {owner:name==='admin-buy'?admin:holder,mint,side:sell?'sell':'buy',amount:sell?'1000000000':'1000000',slippageBps:100,maxTotalDebitLamports:sell?3000000:4000000};
}
export function solAcceptanceSummary(review){return {executionEnabled:false,signed:false,submitted:false,owner:review.owner,mint:review.mint,side:review.side,amount:review.amount,minimum:review.minimum,netOutput:review.netOutput,minimumNetSol:review.minimumNetSol??null,estimatedNetSol:review.estimatedNetSol??null,estimatedLamports:review.estimatedLamports,networkFee:review.networkFee,minContextSlot:review.minContextSlot,freshOutput:review.freshOutput,intermediateAccounts:review.intermediateBalances?.length??0,packetBytes:atob(review.transactionBase64).length};}
