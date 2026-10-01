import './browser-buffer.mjs';
/** UI adapters. The UI must explicitly review total SOL debit before calling signSolTrade. */
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
export async function signSolTrade({review,wallet,connection,confirmReviewed,onSigned,preflight=requestSolTradePreflight}){
 if(confirmReviewed!==true)throw Error('Review SOL input, net token minimum and total SOL debit first.');
 if(wallet.publicKey?.toBase58()!==review.owner||review.expiresAt<Date.now())throw Error('Wallet or SOL review changed.');
 const transaction=VersionedTransaction.deserialize(Buffer.from(review.transactionBase64,'base64'));
 const context=await resolveTransactionAddresses(connection,transaction,{minContextSlot:review.minContextSlot});
 if(context.fingerprint!==review.addressFingerprint)throw Error('SOL review lookup mapping changed.');
 const frozen=decodeReviewedTransaction(transaction,context);
 if(transaction.message.header.numRequiredSignatures!==1||transaction.signatures.some(s=>s.some(Boolean)))throw Error('SOL review must be unsigned and have one payer.');
 if(wallet.publicKey?.toBase58()!==review.owner||review.expiresAt<=Date.now())throw Error('Wallet or SOL review changed before approval. Nothing was signed.');
 const check=await preflight(review);
 if(!check.ok)throw Error(`${check.message} Checked before opening your wallet; nothing was signed.`);
 if(wallet.publicKey?.toBase58()!==review.owner||review.expiresAt<=Date.now())throw Error('Wallet or SOL review changed before approval. Nothing was signed.');
 let signed;
 try{signed=await wallet.signTransaction(transaction);}
 catch(e){throw Error(`Wallet did not sign: ${e instanceof Error?e.message:'request declined'}. Grainpad's fresh simulation of these exact bytes passed at slot ${check.slot} immediately before the wallet request. Nothing was signed.`);}
  if(signed.signatures.length!==1||!nacl.sign.detached.verify(signed.message.serialize(),signed.signatures[0],signed.message.staticAccountKeys[0].toBytes()))throw Error('Owner signature invalid. Nothing was sent.');
 if(signed.message.staticAccountKeys[0].toBase58()!==review.owner)throw Error('Signed payer differs from reviewed owner. Nothing was sent.');
 if(wallet.publicKey?.toBase58()!==review.owner||review.expiresAt<Date.now())throw Error('Wallet or SOL review changed during approval. Nothing was sent; retain the signed signature.');
 const signedContext=await resolveTransactionAddresses(connection,signed,{minContextSlot:Math.max(context.slot,review.minContextSlot)});
 assertWalletTransaction(frozen,signed,signedContext,{allowDefaultZeroPrice:review.allowDefaultZeroPrice===true,allowVerifiedLookupRemap:true});
 const encoded=Buffer.from(signed.serialize()).toString('base64'),signature=bs58.encode(signed.signatures[0]);
 if(onSigned)await onSigned({signature,encoded,intentId:review.id,lastValidBlockHeight:review.lastValidBlockHeight,owner:review.owner,mint:review.mint});
 const response=await sessionRpcFetch('/api/rpc?network=mainnet-beta',{method:'POST',headers:{'Content-Type':'application/json','X-Grainpad-Sol-Intent':review.id},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'sendTransaction',params:[encoded,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0}]})});
 const result=await response.json();if(!response.ok||result.error)throw Error(result.error?.message||result.error||'SOL submission status is uncertain. Retain the signed transaction and check its signature before retrying.');
 if(result.result!==signature)throw Error('SOL relay returned a different signature. Retain the signed transaction and verify the original signature.');
 return {signature,encoded,intentId:review.id};
}
