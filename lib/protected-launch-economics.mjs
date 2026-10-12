/** Protected Launch reference arithmetic. No RPC, custody, signatures or live admission.
 * All amounts are integer base units. Floors leave explicit escrow dust; they never
 * reward an address, arrival order or the last claimant with someone else's remainder.
 */
import {QUOTES,parseTokenUnits} from './quote-assets.mjs';
export const PROTECTED_LAUNCH_VERSION='protected-launch-v1';
export const PROTECTED_FUNDING_ASSETS=Object.freeze({
 wXMR:QUOTES.wXMR,
 SOL:QUOTES.SOL,
 USDC:Object.freeze({symbol:'USDC',mint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',decimals:6,native:false}),
});
export const PROTECTED_LAUNCH_ENABLED=false;
const U64=(1n<<64n)-1n;
export function protectedRaw(value,{positive=false}={}){
 if(typeof value!=='string'||!/^(0|[1-9]\d{0,19})$/.test(value))throw Error('Canonical u64 base-unit amount required.');
 const n=BigInt(value);if(n>U64||(positive&&n===0n))throw Error('Amount outside u64 bounds.');return n;
}
function ownerId(owner){if(typeof owner!=='string'||!owner.length||owner.length>128)throw Error('Recorded beneficiary required.');return owner;}
function checkedTotal(values){const n=values.reduce((a,b)=>a+b,0n);if(n>U64)throw Error('Aggregate exceeds u64 bounds.');return n;}
/** Funding choices are independent of pair choice. The first settlement adapter is
 * wXMR; SOL/USDC must atomically convert and deposit, with an exact input cap and
 * minimum net vault credit. Display estimates never become allocation credit.
 */
export function protectedFundingIntent({asset,amount,minimumQuoteCreditRaw}){
 if(!Object.hasOwn(PROTECTED_FUNDING_ASSETS,asset))throw Error('Choose wXMR, SOL or USDC.');
 const input=PROTECTED_FUNDING_ASSETS[asset],inputRaw=String(parseTokenUnits(amount,input.decimals));
 const minimum=protectedRaw(minimumQuoteCreditRaw,{positive:true});
 if(asset==='wXMR'&&minimum!==BigInt(inputRaw))throw Error('Direct wXMR credit must equal the exact input.');
 return Object.freeze({version:PROTECTED_LAUNCH_VERSION,inputAsset:asset,inputMint:input.mint,inputRaw,quoteMint:QUOTES.wXMR.mint,minimumQuoteCreditRaw:String(minimum),conversionRequired:asset!=='wXMR',atomicConversionAndDeposit:true});
}
/** Account deltas are inputs to this reference model, NOT authenticated chain proof.
 * The future program must derive these deltas itself and verify signer, vault,
 * mints/programs and the frozen launch commitment; a server must never trust this
 * function to accept arbitrary user-supplied observations as financial evidence.
 */
export function protectedDepositCredit(intent,{inputSpentRaw,vaultBeforeRaw,vaultAfterRaw}){
 if(!intent||intent.version!==PROTECTED_LAUNCH_VERSION)throw Error('Protected funding intent required.');
 const asset=Object.hasOwn(PROTECTED_FUNDING_ASSETS,intent.inputAsset)?PROTECTED_FUNDING_ASSETS[intent.inputAsset]:null;
 if(!asset||intent.inputMint!==asset.mint||intent.quoteMint!==QUOTES.wXMR.mint||intent.conversionRequired!==(intent.inputAsset!=='wXMR')||intent.atomicConversionAndDeposit!==true)throw Error('Funding identity changed.');
 const input=protectedRaw(intent.inputRaw,{positive:true}),minimum=protectedRaw(intent.minimumQuoteCreditRaw,{positive:true});
 if(protectedRaw(inputSpentRaw,{positive:true})!==input)throw Error('Exact-input funding amount changed.');
 const before=protectedRaw(vaultBeforeRaw),after=protectedRaw(vaultAfterRaw);
 if(after<=before||after-before<minimum)throw Error('Net escrow credit is below the approved minimum.');
 if(intent.inputAsset==='wXMR'&&(minimum!==input||after-before!==input))throw Error('Direct wXMR deposit credit changed.');
 return String(after-before);
}
export function protectedTransferFee(amountRaw,{taxBps,maximumFeeRaw}){
 const amount=protectedRaw(amountRaw),maximum=protectedRaw(maximumFeeRaw);
 if(!Number.isInteger(taxBps)||taxBps<0||taxBps>10000)throw Error('Transfer fee basis points required.');
 const fee=(amount*BigInt(taxBps)+9999n)/10000n;return String(fee<maximum?fee:maximum);
}
/** Combine deposits per recorded beneficiary before rounding. No per-wallet cap.
 * Unique beneficiaries cannot gain by splitting: sum(floor(x_i*r)) <= floor(sum(x_i)*r).
 */
export function protectedCredits(deposits){
 if(!Array.isArray(deposits))throw Error('Deposit records required.');
 const credits=new Map();
 for(const d of deposits){const owner=ownerId(d?.owner),amount=protectedRaw(d?.creditedQuoteRaw,{positive:true});credits.set(owner,checkedTotal([credits.get(owner)??0n,amount]));}
 checkedTotal([...credits.values()]);
 return [...credits].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([owner,amount])=>Object.freeze({owner,creditedQuoteRaw:String(amount)}));
}
/** Actual acquired escrow token balance already excludes the first curve→escrow
 * transfer tax. This function models the additional escrow→beneficiary tax.
 * The cap limits the aggregate BUY, never admission to the deposit window.
 */
export function allocateProtectedLaunch({deposits,quoteSpentRaw,receivedTokenRaw,aggregateCapRaw,claimTax}){
 const credits=protectedCredits(deposits),total=checkedTotal(credits.map(d=>BigInt(d.creditedQuoteRaw)));
 if(total===0n)throw Error('Cannot settle an empty window.');
 const spent=protectedRaw(quoteSpentRaw,{positive:true}),received=protectedRaw(receivedTokenRaw,{positive:true}),cap=protectedRaw(aggregateCapRaw,{positive:true});
 const expected=total<cap?total:cap;if(spent!==expected)throw Error('Settlement must spend exactly min(total credited quote, frozen cap).');
 // Validate tax even for inputs that would otherwise produce only zero allocations.
 protectedTransferFee('0',claimTax);
 const unused=total-spent;
 const allocations=credits.map(d=>{
  const weight=BigInt(d.creditedQuoteRaw),tokens=received*weight/total,refund=unused*weight/total,fee=BigInt(protectedTransferFee(String(tokens),claimTax));
  return Object.freeze({...d,tokenAllocationRaw:String(tokens),claimTransferFeeRaw:String(fee),expectedNetTokenRaw:String(tokens-fee),quoteRefundRaw:String(refund)});
 });
 const tokensAllocated=allocations.reduce((n,a)=>n+BigInt(a.tokenAllocationRaw),0n),quoteRefunded=allocations.reduce((n,a)=>n+BigInt(a.quoteRefundRaw),0n);
 return Object.freeze({version:PROTECTED_LAUNCH_VERSION,totalCreditedQuoteRaw:String(total),quoteSpentRaw:String(spent),receivedTokenRaw:String(received),
  // A shared rational acquisition price, before per-claim transfer tax/rounding.
  commonPrice:Object.freeze({quoteRaw:String(spent),tokenRaw:String(received)}),
  tokenDustRaw:String(received-tokensAllocated),quoteDustRaw:String(unused-quoteRefunded),allocations:Object.freeze(allocations)});
}
