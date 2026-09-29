/** Only retransmits identical, already-signed bytes. Never signs, refreshes a
 * blockhash or constructs a replacement transaction. Dependency injection is
 * for local tests; production uses its existing guarded RPC connection. */
export async function rebroadcastSigned({connection,wire,signature,lastValidBlockHeight,onEvent=(stage,details)=>{void stage;void details;},sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now(),intervalMs=2500,unavailableMs=60000}){
 if(!Number.isSafeInteger(lastValidBlockHeight)||lastValidBlockHeight<1)throw Error('Missing transaction expiry. Nothing was sent.');
 const original=Uint8Array.from(wire);let attempts=0,lastVerified=now(),lastError;
 function emit(stage,details){try{onEvent(stage,details);}catch{/* UI observers cannot change submission. */}}
 async function status(){
  const result=(await connection.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];
  if(result?.err)throw Object.assign(Error(`Transaction failed: ${JSON.stringify(result.err)}. Check the explorer before retrying.`),{terminal:true});
  if(['confirmed','finalized'].includes(result?.confirmationStatus)){emit('confirmed',{confirmationStatus:result.confirmationStatus});return true;}
  return false;
 }
 for(;;){
  let height;
  try{
   if(attempts&&await status())return signature;
   height=await connection.getBlockHeight('confirmed');lastVerified=now();
  }catch(error){
   if(error?.terminal)throw error;
   if(now()-lastVerified>=unavailableMs)throw Error('Confirmation or block height is unavailable. Keep the saved signature and check its outcome before retrying.');
   emit('confirmation_retry',{attempts});await sleep(intervalMs);continue;
  }
  if(height>lastValidBlockHeight){
   if(attempts&&await status())return signature;
   throw Error('Blockhash expired; rebroadcast stopped. Check the saved signature before preparing another transaction.');
  }
  attempts++;emit('send_started',{signature,submissionAttempted:true,rebroadcastAttempts:attempts,currentBlockHeight:height});
  try{
   // maxRetries:0 disables the provider queue; THIS loop owns bounded retries.
   const received=await connection.sendRawTransaction(Uint8Array.from(original),{skipPreflight:false,maxRetries:0,preflightCommitment:'confirmed'});
   if(received!==signature)throw Object.assign(Error('RPC returned an unexpected signature.'),{terminal:true});
   emit('rpc_accepted',{rpcAccepted:true,rebroadcastAttempts:attempts});
  }catch(error){
   if(error?.terminal)throw error;
   lastError=error;emit('rebroadcast_retry',{rebroadcastAttempts:attempts,lastSendError:String(lastError?.message||'RPC unavailable').replace(/https?:\/\/[^\s"']+/g,'[URL]').slice(0,500)});
  }
  // Check immediately: a lost send response may still have landed the transaction.
  try{if(await status())return signature;}catch(error){if(error?.terminal)throw error;}
  await sleep(intervalMs);
 }
}
