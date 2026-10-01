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
export async function signSolTrade({review,wallet,connection,confirmReviewed,onSigned}){
 if(confirmReviewed!==true)throw Error('Review SOL input, net token minimum and total SOL debit first.');
 if(wallet.publicKey?.toBase58()!==review.owner||review.expiresAt<Date.now())throw Error('Wallet or SOL review changed.');
 const transaction=VersionedTransaction.deserialize(Buffer.from(review.transactionBase64,'base64'));
 const context=await resolveTransactionAddresses(connection,transaction,{minContextSlot:review.minContextSlot});
 if(context.fingerprint!==review.addressFingerprint)throw Error('SOL review lookup mapping changed.');
 const frozen=decodeReviewedTransaction(transaction,context);
 if(transaction.message.header.numRequiredSignatures!==1||transaction.signatures.some(s=>s.some(Boolean)))throw Error('SOL review must be unsigned and have one payer.');
 if(wallet.publicKey?.toBase58()!==review.owner||review.expiresAt<=Date.now())throw Error('Wallet or SOL review changed before approval. Nothing was signed.');
 const signed=await wallet.signTransaction(transaction);
  if(signed.signatures.length!==1||!nacl.sign.detached.verify(signed.message.serialize(),signed.signatures[0],signed.message.staticAccountKeys[0].toBytes()))throw Error('Owner signature invalid. Nothing was sent.');
 if(signed.message.staticAccountKeys[0].toBase58()!==review.owner)throw Error('Signed payer differs from reviewed owner. Nothing was sent.');
 const encoded=Buffer.from(signed.serialize()).toString('base64'),signature=bs58.encode(signed.signatures[0]);
 if(onSigned)await onSigned({signature,encoded,intentId:review.id,lastValidBlockHeight:review.lastValidBlockHeight,owner:review.owner,mint:review.mint});
 if(wallet.publicKey?.toBase58()!==review.owner||review.expiresAt<Date.now())throw Error('Wallet or SOL review changed during approval. Nothing was sent; retain the signed signature.');
 assertWalletTransaction(frozen,signed,context,{allowDefaultZeroPrice:review.allowDefaultZeroPrice===true});
 const response=await sessionRpcFetch('/api/rpc?network=mainnet-beta',{method:'POST',headers:{'Content-Type':'application/json','X-Grainpad-Sol-Intent':review.id},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'sendTransaction',params:[encoded,{encoding:'base64',skipPreflight:false,preflightCommitment:'confirmed',maxRetries:0}]})});
 const result=await response.json();if(!response.ok||result.error)throw Error(result.error?.message||result.error||'SOL submission status is uncertain. Retain the signed transaction and check its signature before retrying.');
 if(result.result!==signature)throw Error('SOL relay returned a different signature. Retain the signed transaction and verify the original signature.');
 return {signature,encoded,intentId:review.id};
}
