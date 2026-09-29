export const BLOCKHASH_SAFETY_BLOCKS=10;
export const HEIGHT_POLL_MS=3000;
export const HEIGHT_MAX_AGE_MS=6500;
export const WALLET_EXPIRY_MESSAGE='This transaction took too long in the wallet. Nothing was sent. Click Review again for a fresh blockhash.';
export function assertBlockhashWindow(lastValidBlockHeight,currentHeight,afterWallet=false){
 if(!Number.isSafeInteger(lastValidBlockHeight)||!Number.isSafeInteger(currentHeight)||lastValidBlockHeight-currentHeight<=BLOCKHASH_SAFETY_BLOCKS){
  throw Object.assign(Error(afterWallet?WALLET_EXPIRY_MESSAGE:'The blockhash is expired or has 10 blocks or fewer remaining. Refresh the review and try again.'),{code:'BLOCKHASH_REVIEW_EXPIRED',retryReview:true});
 }
}
/** Seconds are an estimate from observed confirmed heights; never a validity promise. */
export function blockhashCountdown(lastValidBlockHeight,samples,now=Date.now()){
 const last=samples.at(-1),first=samples[0];
 const live=!!last&&now>=last.at&&now-last.at<=HEIGHT_MAX_AGE_MS;
 const elapsed=last&&first?(last.at-first.at)/1000:0,delta=last&&first?last.height-first.height:0;
 const observed=elapsed>=2&&delta>0;
 const blocksPerSecond=observed?delta/elapsed:4;
 if(!live||!Number.isSafeInteger(lastValidBlockHeight))return {live:false,ready:false,remainingBlocks:null,seconds:null,blocksPerSecond,observed};
 const remainingBlocks=Math.max(0,lastValidBlockHeight-last.height);
 const estimatedBlocks=Math.max(0,remainingBlocks-Math.ceil((now-last.at)/1000*blocksPerSecond));
 return {live:true,ready:estimatedBlocks>BLOCKHASH_SAFETY_BLOCKS,remainingBlocks,seconds:Math.max(0,Math.floor(estimatedBlocks/blocksPerSecond)),blocksPerSecond,observed};
}
