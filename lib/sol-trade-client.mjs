import './browser-buffer.mjs';
/** UI adapters. The UI displays input, slippage and the SOL spending cap before the user requests wallet approval. */
import {Buffer} from 'buffer';import {VersionedTransaction} from '@solana/web3.js';import nacl from 'tweetnacl';import bs58 from 'bs58';
import {sessionRpcFetch} from './browser-rpc-session.mjs';
import {resolveTransactionAddresses} from './transaction-addresses.mjs';import {assertWalletTransaction,decodeReviewedTransaction} from './wallet-transaction-policy.mjs';
export async function prepareSolTrade(input){
 const response=await sessionRpcFetch('/api/sol-trade',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const review=await response.json();if(!response.ok||review.error)throw Error(review.error||'SOL trade preparation failed.');
 if(review.owner!==input.owner||review.mint!==input.mint||review.side!==input.side||review.amount!==input.amount||review.maxTotalDebitLamports!==input.maxTotalDebitLamports||review.expiresAt<Date.now())throw Error('SOL trade review does not match input.');
 return review;
}
/** Server re-simulates the exact stored bytes; the wallet opens only after this read-only check passes. */
export async function requestSolTradePreflight(review){
 const response=await sessionRpcFetch('/api/sol-trade/preflight',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:review.id})});const result=await response.json();
 if(!response.ok||result.error)throw Error((result.error||'Fresh SOL route check failed.')+' Nothing was signed.');
 if(result.id!==review.id||typeof result.ok!=='boolean'||(result.ok&&!Number.isSafeInteger(result.slot))||(!result.ok&&(typeof result.message!=='string'||result.message.length>400)))throw Error('Fresh SOL route check returned an unexpected result. Nothing was signed.');
 return result;
}
export async function signSolTrade({review,wallet,connection,confirmReviewed,onSigned,onWalletRequest,preflight=requestSolTradePreflight}){
 if(confirmReviewed!==true)throw Error('Review SOL input, net token minimum and total SOL debit first.');
 if(wallet.publicKey?.toBase58()!==review.owner||review.expiresAt<Date.now())throw Error('Wallet or SOL review changed.');
 const transaction=VersionedTransaction.deserialize(Buffer.from(review.transactionBase64,'base64'));
 const context=await resolveTransactionAddresses(connection,transaction,{minContextSlot:review.minContextSlot});
 if(context.fingerprint!==review.addressFingerprint)throw Error('The route lookup tables changed after review. Prepare a fresh review. Nothing was signed.');
 const frozen=decodeReviewedTransaction(transaction,context);
 if(transaction.message.header.numRequiredSignatures!==1||transaction.signatures.some(s=>s.some(Boolean)))throw Error('SOL review must be unsigned and have one payer.');
 if(wallet.publicKey?.toBase58()!==review.owner||review.expiresAt<=Date.now())throw Error('Wallet or SOL review changed before approval. Nothing was signed.');
 const check=await preflight(review);
 if(!check.ok)throw Error(`${check.message} Checked before opening your wallet; nothing was signed.`);
 if(wallet.publicKey?.toBase58()!==review.owner||review.expiresAt<=Date.now())throw Error('Wallet or SOL review changed before approval. Nothing was signed.');
 let signed;
 if(onWalletRequest)onWalletRequest();
 try{signed=await wallet.signTransaction(transaction);}
 catch(e){throw Error(`Wallet did not sign: ${e instanceof Error?e.message:'request declined'}. Grainpad's fresh simulation of these exact bytes passed at slot ${check.slot} immediately before the wallet request. Nothing was signed.`);}
  if(signed.signatures.length!==1||!nacl.sign.detached.verify(signed.message.serialize(),signed.signatures[0],signed.message.staticAccountKeys[0].toBytes()))throw Error('Owner signature invalid. Nothing was sent.');
 if(signed.message.staticAccountKeys[0].toBase58()!==review.owner)throw Error('Signed payer differs from reviewed owner. Nothing was sent.');
 if(wallet.publicKey?.toBase58()!==review.owner||review.expiresAt<Date.now())throw Error('Wallet or SOL review changed during approval. The signed transaction was not sent; prepare a fresh review.');
 const signedContext=await resolveTransactionAddresses(connection,signed,{minContextSlot:Math.max(context.slot,review.minContextSlot)});
 assertWalletTransaction(frozen,signed,signedContext,{allowDefaultZeroPrice:review.allowDefaultZeroPrice===true,allowVerifiedLookupRemap:true});
 const encoded=Buffer.from(signed.serialize()).toString('base64'),signature=bs58.encode(signed.signatures[0]);
 if(onSigned)await onSigned({signature,encoded,intentId:review.id,lastValidBlockHeight:review.lastValidBlockHeight,owner:review.owner,mint:review.mint});
 // A signed transaction now exists and is being tracked. No failure below may claim that nothing was sent.
 let uncertain=false;
 for(let attempt=1;;attempt++){
  let response,result;
  try{response=await sessionRpcFetch('/api/rpc?network=mainnet-beta',{method:'POST',headers:{'Content-Type':'application/json','X-Grainpad-Sol-Intent':review.id},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'sendTransaction',params:[encoded,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0}]})});result=await response.json();}
  catch{response=null;result=null;}
  const outcome=classifySolSubmission(response,result,signature);
  if(outcome.ok)return {signature,encoded,intentId:review.id};
  // An earlier attempt may have reached the network, so a later refusal cannot prove it was never broadcast.
  if(outcome.broadcast==='unknown')uncertain=true;else if(uncertain)outcome.broadcast='unknown';
  // Only the identical signed wire is ever resent; the relay re-admits it as a same-wire rebroadcast.
  if(outcome.retry&&attempt<SOL_SUBMIT_ATTEMPTS&&review.expiresAt>Date.now())continue;
  throw solSubmissionError(signature,outcome);
 }
}
export const SOL_SUBMIT_ATTEMPTS=3;
const clean=text=>String(text||'').replace(/\s*Nothing was (sent|signed|submitted)[^.]*\./gi,'').replace(/\s+/g,' ').trim().slice(0,300);
/** Classifies one relay response for an already signed SOL trade. Exported for tests. */
export function classifySolSubmission(response,result,signature){
 if(!response||!result||typeof result!=='object')return {ok:false,broadcast:'unknown',retry:true,reason:'The submission request did not complete.'};
 if(response.ok&&!result.error){
  if(result.result===signature)return {ok:true,broadcast:'yes'};
  return {ok:false,broadcast:'unknown',retry:false,reason:'The relay returned a different signature.'};
 }
 // Grainpad's relay refused before forwarding (route, wallet-change, cost or budget checks).
 const text=typeof result.error==='string'?result.error:result.error?.message;
 if(/may already be on chain/i.test(String(text||'')))return {ok:false,broadcast:'unknown',retry:false,reason:clean(text)};
 if(response.status===429||(typeof result.error==='string'&&result.forwarded===false))return {ok:false,broadcast:'no',retry:false,reason:clean(typeof result.error==='string'?result.error:result.error?.message)||'The relay refused the submission.'};
 // Solana RPC preflight failure: the node simulated and refused to broadcast these bytes.
 if(result.error?.code===-32002)return {ok:false,broadcast:'no',retry:false,reason:clean(result.error.message)||'The network preflight check failed.'};
 return {ok:false,broadcast:'unknown',retry:response.status>=500,reason:clean(typeof result.error==='string'?result.error:result.error?.message)||'The relay could not confirm the submission.'};
}
export function solSubmissionError(signature,{broadcast,reason}){
 const tracking=`Grainpad keeps tracking signature ${signature.slice(0,8)}… until it lands or its blockhash expires; do not sign this trade again until tracking finishes.`;
 const message=broadcast==='no'?`Your wallet signed this trade, but it was not broadcast: ${reason} No funds move unless that exact signature lands, and it will expire unused. ${tracking}`:`Your wallet signed this trade, but its submission could not be confirmed: ${reason} It may still land. ${tracking}`;
 return Object.assign(Error(message),{signature,broadcast,submissionUncertain:broadcast!=='no'});
}
