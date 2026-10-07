import {Buffer} from 'buffer';
import {VersionedTransaction} from '@solana/web3.js';
import {sha256} from '@noble/hashes/sha256';
import {submittedSignature} from './rpc-submissions.mjs';
const digest=bytes=>Buffer.from(sha256(bytes)).toString('hex');
/** @param {{transaction:import('@solana/web3.js').VersionedTransaction,summary:Record<string,unknown>,requiredLocalSigners?:string[],blockhash:string,lastValidBlockHeight:number}} prepared
 * @param {{owner:string,cost:{debit:number,fee:number},now?:number}} options */
export function protectedReviewRecord(prepared,{owner,cost,now=Date.now()}){
 if(!Number.isSafeInteger(cost.debit)||cost.debit<0||!Number.isSafeInteger(cost.fee)||cost.fee<0)throw Error('Verified simulation cost required.');
 if(prepared.transaction.signatures.some(s=>s.some(Boolean)))throw Error('An unsigned protected review is required.');
 return {version:'protected-review-v1',owner,wire:Buffer.from(prepared.transaction.serialize()).toString('base64'),messageHash:digest(prepared.transaction.message.serialize()),summary:prepared.summary,requiredLocalSigners:prepared.requiredLocalSigners||[],blockhash:prepared.blockhash,lastValidBlockHeight:prepared.lastValidBlockHeight,createdAt:now,expiresAt:now+120000,maxDebitLamports:cost.debit,networkFeeLamports:cost.fee};
}
export function verifyProtectedSubmission(review,encoded,{now=Date.now(),height}){
 if(review?.version!=='protected-review-v1'||now>=review.expiresAt||now<review.createdAt||!Number.isSafeInteger(height)||height>review.lastValidBlockHeight-10)throw Error('Protected review expired. Prepare a new review.');
 if(typeof encoded!=='string'||encoded.length>1800)throw Error('Protected packet is invalid.');
 const bytes=Buffer.from(encoded,'base64');if(bytes.length>1232||bytes.toString('base64')!==encoded)throw Error('Protected packet is invalid.');
 const tx=VersionedTransaction.deserialize(bytes),original=VersionedTransaction.deserialize(Buffer.from(review.wire,'base64'));
 if(digest(tx.message.serialize())!==review.messageHash||!Buffer.from(tx.message.serialize()).equals(Buffer.from(original.message.serialize()))||String(tx.message.staticAccountKeys[0])!==review.owner||tx.message.recentBlockhash!==review.blockhash)throw Error('Signed transaction differs from the protected review. Nothing was sent.');
 const signature=submittedSignature(encoded);return {transaction:tx,signature};
}
