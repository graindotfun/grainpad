/** Same-bank USDC outcome plus execution-time balance assertions. Never signs or sends. */
import {Buffer} from 'buffer';
import {PublicKey} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,unpackAccount} from '@solana/spl-token';
import {SOL_PAYMENT_ASSETS} from './sol-payment-assets.mjs';
import {tokenBalanceEqualityGuard,netTokenMinimumGuard} from './sol-token-net-guard.mjs';
export function usdcBalanceGuards({side,baseAccount,paymentAccount,baseBaseline,paymentBaseline,amount,minimum}){
 const base=BigInt(baseBaseline),payment=BigInt(paymentBaseline),input=BigInt(amount),output=BigInt(minimum);
 if(!['buy','sell'].includes(side)||base<0n||payment<0n||input<1n||output<1n||(side==='buy'?payment:base)<input)throw Error('Insufficient guarded token balance.');
 return {pre:[tokenBalanceEqualityGuard(baseAccount,String(base)),tokenBalanceEqualityGuard(paymentAccount,String(payment))],post:side==='buy'?
 [tokenBalanceEqualityGuard(paymentAccount,String(payment-input)),netTokenMinimumGuard(baseAccount,String(base+output))]:
 [tokenBalanceEqualityGuard(baseAccount,String(base-input)),netTokenMinimumGuard(paymentAccount,String(payment+output))]};
}
export function usdcTradeDeltas(review,proof){
 const read=(account,address,mint,program)=>{
  if(!account||account.owner!==program||!Array.isArray(account.data)||account.data[1]!=='base64')throw Error('Fresh USDC route token result unavailable.');
  const token=unpackAccount(new PublicKey(address),{...account,owner:new PublicKey(program),data:Buffer.from(account.data[0],'base64')},new PublicKey(program));
  if(!token.isInitialized||token.isFrozen||String(token.mint)!==mint||String(token.owner)!==review.owner)throw Error('Wrong USDC route token owner or mint.');
  return token.amount;
 };
 const base=read(proof.accounts[1],review.baseAccount,review.mint,review.tokenProgram),payment=read(proof.accounts[2],review.paymentAccount,SOL_PAYMENT_ASSETS.USDC.mint,String(TOKEN_PROGRAM_ID));
 const beforeBase=BigInt(review.tokenBaseline),beforePayment=BigInt(review.paymentBaseline);
 return {inputDelta:String(review.side==='buy'?beforePayment-payment:beforeBase-base),outputDelta:String(review.side==='buy'?base-beforeBase:payment-beforePayment)};
}
