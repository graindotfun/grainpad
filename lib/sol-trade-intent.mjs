/** Immutable, short lived server review. This module cannot sign or broadcast. */
import {Buffer} from 'buffer';
import {VersionedTransaction} from '@solana/web3.js';
export const SOL_MINT='So11111111111111111111111111111111111111112';
export const SOL_TRADE_TTL=60_000;
export const SOL_TRADE_RESERVE=500_000;
export const SOL_TRADE_OVERHEAD_CAP=3_000_000;
const decimal=value=>typeof value==='string'&&/^[1-9]\d*$/.test(value);
const hash=async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
const key=id=>{if(typeof id!=='string'||!/^([a-f0-9]{32})$/.test(id))throw Error('Invalid SOL review identity.');return `sol-trades/v1/${id}`;};
export function assertSolRouteQuote(quote,{mint,pool,side,amount,slippageBps}){
 if(!['buy','sell'].includes(side)||!decimal(amount)||!Number.isInteger(slippageBps)||slippageBps<0||slippageBps>2000)throw Error('Invalid SOL trade.');
 const inputMint=side==='buy'?SOL_MINT:mint,outputMint=side==='buy'?mint:SOL_MINT;
 if(quote?.inputMint!==inputMint||quote?.outputMint!==outputMint||quote?.swapMode!=='ExactIn'||quote?.inAmount!==amount||quote?.slippageBps!==slippageBps||!decimal(quote?.outAmount)||!decimal(quote?.otherAmountThreshold)||BigInt(quote.otherAmountThreshold)>BigInt(quote.outAmount)||quote.platformFee!=null)throw Error('SOL route quote changed the reviewed terms.');
 const routes=quote.routePlan;
 if(!Array.isArray(routes)||!routes.length||routes.length>2||routes.some(r=>!((r?.bps===10000&&(r.percent==null||r.percent===100))||(r?.bps==null&&r?.percent===100))||!decimal(r?.swapInfo?.inAmount)||!decimal(r?.swapInfo?.outAmount)))throw Error('Split or malformed SOL routes are not supported.');
 if(routes.some(r=>!['Raydium Launchlab','Raydium CLMM'].includes(r.swapInfo.label)))throw Error('SOL route venue is outside the reviewed allowlist.');
 let current=inputMint;
 for(const route of routes){const s=route.swapInfo;if(s.inputMint!==current||s.inputMint===s.outputMint)throw Error('Discontinuous SOL route.');current=s.outputMint;}
 if(current!==outputMint||routes[0].swapInfo.inAmount!==amount)throw Error('SOL route does not match its quote.');
 const nativeLegs=routes.filter(r=>r.swapInfo.ammKey===pool&&r.swapInfo.label==='Raydium Launchlab');
 if(nativeLegs.length!==1||nativeLegs[0]!==routes[side==='buy'?routes.length-1:0]||routes.some(r=>r!==nativeLegs[0]&&(r.swapInfo.inputMint===mint||r.swapInfo.outputMint===mint)))throw Error('Route does not use the indexed Grainpad pool exclusively.');
 return Object.freeze({inputMint,outputMint,amount,minimum:quote.otherAmountThreshold});
}
export function assertSolTradeOutcome(review,proof){
 const n=x=>Number.isSafeInteger(x)&&x>=0;
 if(!n(proof?.before)||!n(proof?.after)||!n(proof?.fee)||!n(proof?.debit)||!n(proof?.slot)||proof.slot<review.minContextSlot||proof.after<SOL_TRADE_RESERVE||proof.debit>review.maxTotalDebitLamports)throw Error('SOL trade cost or reserve proof failed.');
 if(proof.tokenBaselineEvidence!=='same-bank-or-onchain-guard')throw Error('Token outcome baseline must be proven in the same bank or by an on-chain guard.');
 if(!decimal(proof.outputDelta)||BigInt(proof.outputDelta)<BigInt(review.minimum)||proof.inputDelta!==review.amount)throw Error('SOL trade net input/output proof failed.');
 const overhead=review.side==='buy'?proof.debit-Number(review.amount):proof.fee;
 if(review.side==='sell'&&BigInt(proof.after)-BigInt(proof.before)<BigInt(review.minimum)-BigInt(review.maxOverheadLamports))throw Error('SOL sale net credit is below the reviewed minimum after fees.');
 if(overhead<0||overhead>review.maxOverheadLamports)throw Error('SOL trade overhead exceeds review.');
 return proof;
}
export async function createSolTradeIntent(storage,input,{now=Date.now(),id=crypto.randomUUID().replaceAll('-','')}={}){
 const tx=VersionedTransaction.deserialize(Buffer.from(input.transactionBase64,'base64'));
 if(tx.serialize().length>1232||tx.message.header.numRequiredSignatures!==1||tx.message.staticAccountKeys[0].toBase58()!==input.owner||tx.signatures.some(s=>s.some(Boolean)))throw Error('Invalid unsigned SOL trade review.');
 if(!Number.isSafeInteger(input.maxTotalDebitLamports)||input.maxTotalDebitLamports<0||!Number.isSafeInteger(input.maxOverheadLamports)||input.maxOverheadLamports<0||input.maxOverheadLamports>SOL_TRADE_OVERHEAD_CAP||!Number.isSafeInteger(input.minContextSlot)||input.minContextSlot<1||!Number.isSafeInteger(input.lastValidBlockHeight)||input.lastValidBlockHeight<1||typeof input.addressFingerprint!=='string'||!input.addressFingerprint)throw Error('Incomplete SOL review limits.');
 const review={...input,id,version:1,createdAt:now,expiresAt:now+SOL_TRADE_TTL,messageHash:await hash(tx.message.serialize()),signedMessageHash:null,signedWireHash:null};
 if(!await storage.put(key(id),JSON.stringify(review),{onlyIf:{etagDoesNotMatch:'*'}}))throw Error('SOL review identity already exists.');
 return review;
}
/** A fresh deadline check is required after every asynchronous validation/binding boundary. */
export function assertSolTradeDeadline(review,now=Date.now()){
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(review?.createdAt)||!Number.isSafeInteger(review?.expiresAt)||review.createdAt>now||review.expiresAt-review.createdAt!==SOL_TRADE_TTL||now>=review.expiresAt)throw Error('SOL review expired. Nothing was sent.');
 return review;
}
/** validate is server owned: verified LUT privileges + same-bank balance/outcome proof. */
export async function bindSolTradeSubmission(storage,id,encoded,{validate,clock=Date.now}={}){
 const object=await storage.get(key(id));if(!object)throw Error('SOL review is missing.');
 const review=await object.json(),tx=VersionedTransaction.deserialize(Buffer.from(encoded,'base64'));
 if(review.version!==1||review.id!==id||typeof clock!=='function'||typeof validate!=='function')throw Error('SOL review expired or cannot be validated.');
 assertSolTradeDeadline(review,clock());
 if(tx.message.header.numRequiredSignatures!==1||tx.signatures.length!==1||!tx.signatures[0].some(Boolean)||tx.message.staticAccountKeys[0].toBase58()!==review.owner)throw Error('SOL relay requires one owner-signed transaction.');
 const messageHash=await hash(tx.message.serialize()),wireHash=await hash(tx.serialize());
 if(review.signedMessageHash){if(review.signedMessageHash!==messageHash||review.signedWireHash!==wireHash)throw Error('SOL review already bound to another transaction.');assertSolTradeDeadline(review,clock());return {...review,rebroadcast:true};}
 // Must revalidate wallet changes against the frozen message and frozen LUT mapping.
 await validate(review,tx);
 assertSolTradeDeadline(review,clock());
 const bound={...review,signedMessageHash:messageHash,signedWireHash:wireHash,boundAt:clock()};
 if(!await storage.put(key(id),JSON.stringify(bound),{onlyIf:{etagMatches:object.etag}})){
  const winner=await storage.get(key(id)),existing=winner?await winner.json():null;
  if(existing?.signedMessageHash!==messageHash||existing?.signedWireHash!==wireHash)throw Error('A concurrent transaction claimed this SOL review.');
  assertSolTradeDeadline(existing,clock());
  return {...existing,rebroadcast:true};
 }
 assertSolTradeDeadline(bound,clock());
 return bound;
}
