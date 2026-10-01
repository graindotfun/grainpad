/** Fresh unsigned simulation of the exact stored SOL review, immediately before a wallet request.
 * Read-only: it never rebuilds, signs, relays or changes the reviewed bytes or their guards. */
import {Buffer} from 'buffer';
import {VersionedTransaction} from '@solana/web3.js';
import {resolveTransactionAddresses} from './transaction-addresses.mjs';
import {COMPUTE_PROGRAM,LIGHTHOUSE_PROGRAM} from './wallet-transaction-policy.mjs';
import {assertSolTradeDeadline,loadSolTradeReview} from './sol-trade-intent.mjs';
export const SOL_PREFLIGHT_MIN_BLOCKS=30,SOL_PREFLIGHT_MIN_REVIEW_MS=10_000;
const JUPITER='JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111',TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',TOKEN_2022='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const hash=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
function accountLabel(review,account){
 if(account===review.baseAccount)return 'token account';
 if(account===review.wsolAccount)return 'temporary SOL account';
 if(review.intermediateBalances?.[0]?.account===account)return 'wXMR account';
 return 'route token account';
}
/** Maps a simulation error onto the reviewed instruction layout; it does not reinterpret guard semantics. */
export function classifySolRouteFailure(review,err){
 if(err==='BlockhashNotFound')return {role:'blockhash',code:err,message:'The reviewed blockhash expired. Prepare a fresh review.'};
 if(err==='InsufficientFundsForFee'||err==='AccountNotFound')return {role:'payer-funds',code:err,message:'The wallet does not have enough SOL for this route and its network fee.'};
 if(err&&typeof err==='object'&&'InsufficientFundsForRent' in err)return {role:'payer-funds',code:'InsufficientFundsForRent',message:'The wallet does not have enough SOL to fund the temporary accounts this route opens.'};
 const failure=err&&typeof err==='object'?err.InstructionError:null;
 if(!Array.isArray(failure)||!Number.isInteger(failure[0])||failure[0]<0)return {role:'unknown',code:typeof err==='string'?err.slice(0,64):'unclassified',message:'The route no longer simulates successfully. Prepare a fresh review.'};
 const [index,detail]=failure,instructions=review?.reviewed?.instructions,ix=Array.isArray(instructions)?instructions[index]:null;
 const code=detail&&typeof detail==='object'&&Number.isInteger(detail.Custom)?detail.Custom:typeof detail==='string'?detail.slice(0,64):'unclassified';
 const base={instruction:index,program:ix?.programId??null,code};
 if(!ix)return {...base,role:'unknown',message:'The route no longer simulates successfully. Prepare a fresh review.'};
 const route=instructions.findIndex(item=>item.programId===JUPITER);
 if(ix.programId===LIGHTHOUSE_PROGRAM){
  const data=typeof ix.dataHex==='string'?Buffer.from(ix.dataHex,'hex'):Buffer.alloc(0),account=ix.accounts?.[0]?.key??null,label=accountLabel(review,account);
  if(route>=0&&index>route&&data.length===12&&data[11]===4)return {...base,role:'net-minimum',account,message:'The output would now fall below your reviewed minimum. The price moved beyond your slippage; the minimum-output guard would abort the trade.'};
  if(route>=0&&index<route)return {...base,role:'balance-before-route',account,message:`Your ${label} balance changed after review. Prepare a fresh review.`};
  return {...base,role:'balance-after-route',account,message:`The ${label} balance after the route would differ from the reviewed result. Prepare a fresh review.`};
 }
 if(ix.programId===JUPITER)return {...base,role:code===6001?'route-slippage':'route',message:code===6001?'The route output would fall below your slippage minimum. Prepare a fresh review.':'The router instruction no longer simulates successfully. Prepare a fresh review.'};
 if(ix.programId===ATA)return {...base,role:'account-creation',message:'A token account this route creates already exists or cannot be funded. Prepare a fresh review.'};
 if(ix.programId===SYSTEM)return {...base,role:'sol-funding',message:'The wallet cannot fund the reviewed SOL input. Check the SOL balance and prepare a fresh review.'};
 if(ix.programId===TOKEN||ix.programId===TOKEN_2022)return {...base,role:'token-program',message:'A temporary token account step no longer simulates successfully. Prepare a fresh review.'};
 if(ix.programId===COMPUTE_PROGRAM)return {...base,role:'compute-budget',message:'The compute budget instruction was rejected. Prepare a fresh review.'};
 return {...base,role:'unknown',message:'The route no longer simulates successfully. Prepare a fresh review.'};
}
/** @param {{clock?:()=>number,minBlocks?:number,minReviewMs?:number}} [options] */
export async function preflightSolTrade(storage,id,connection,{clock=Date.now,minBlocks=SOL_PREFLIGHT_MIN_BLOCKS,minReviewMs=SOL_PREFLIGHT_MIN_REVIEW_MS}={}){
 const review=await loadSolTradeReview(storage,id);assertSolTradeDeadline(review,clock());
 if(review.signedMessageHash)throw Error('This SOL review already has a signed transaction. Check that signature instead of signing again.');
 const tx=VersionedTransaction.deserialize(Buffer.from(review.transactionBase64,'base64'));
 if(tx.signatures.some(s=>s.some(Boolean))||await hash(tx.message.serialize())!==review.messageHash)throw Error('Stored SOL review bytes do not match their review.');
 const closed=(reason,message,extra={})=>({id,ok:false,reason,message,...extra});
 if(review.expiresAt-clock()<minReviewMs)return closed('review-expiring','Less than 10 seconds remain on this review. Prepare a fresh review before opening your wallet.');
 const height=await connection.getBlockHeight('confirmed');
 if(!Number.isSafeInteger(height)||height<1)throw Error('Current block height unavailable. Nothing was signed.');
 const blocksRemaining=review.lastValidBlockHeight-height;
 if(blocksRemaining<minBlocks)return closed('blockhash-expiring','The reviewed blockhash is about to expire. Prepare a fresh review before opening your wallet.',{blocksRemaining});
 const context=await resolveTransactionAddresses(connection,tx,{minContextSlot:review.minContextSlot});
 if(context.fingerprint!==review.addressFingerprint)return closed('lookup-changed','The route lookup tables changed after review. Prepare a fresh review.',{blocksRemaining});
 const raw=await connection._rpcRequest('simulateTransaction',[review.transactionBase64,{encoding:'base64',commitment:'confirmed',sigVerify:false,minContextSlot:context.slot}]);
 const sim=raw?.result,slot=sim?.context?.slot;
 if(raw?.error||!Number.isSafeInteger(slot)||slot<context.slot||!sim.value||!('err' in sim.value))throw Error('Fresh SOL route simulation unavailable. Nothing was signed.');
 assertSolTradeDeadline(review,clock());
 if(sim.value.err===null)return {id,ok:true,slot,blocksRemaining,unitsConsumed:Number.isSafeInteger(sim.value.unitsConsumed)?sim.value.unitsConsumed:null};
 const failure=classifySolRouteFailure(review,sim.value.err);
 return closed('simulation-failed',failure.message,{slot,blocksRemaining,failure});
}
