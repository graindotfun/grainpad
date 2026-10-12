/** A send the Grainpad relay refused before forwarding it to any RPC. The relay answers HTTP 400
 * with {error, forwarded:false}; web3.js surfaces that as "400 Bad Request: <body>". Anything else,
 * including rate limits and network errors, is not proof that nothing was sent. */
export function relayRejection(error){
 const match=/^400 [^:]*: (\{[\s\S]*\})$/.exec(String(error?.message??''));
 if(!match)return null;
 let body;try{body=JSON.parse(match[1]);}catch{return null;}
 if(body?.forwarded!==false||typeof body.error!=='string'||!body.error)return null;
 return {reason:body.error.replace(/https?:\/\/[^\s"']+/g,'[URL]').slice(0,500)};
}
/** Only retransmits identical, already-signed bytes. Never signs, refreshes a
 * blockhash or constructs a replacement transaction. Dependency injection is
 * for local tests; production uses its existing guarded RPC connection. */
export async function rebroadcastSigned({connection,wire,signature,lastValidBlockHeight,onEvent=(stage,details)=>{void stage;void details;},sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>Date.now(),intervalMs=2500,unavailableMs=60000,reconcileBySignature=false}){
 if(!Number.isSafeInteger(lastValidBlockHeight)||lastValidBlockHeight<1)throw Error('Missing transaction expiry. Nothing was sent.');
 const original=Uint8Array.from(wire);let attempts=0,lastVerified=now(),lastError,mayHaveForwarded=false;
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
   if((attempts||reconcileBySignature)&&await status())return signature;
   height=await connection.getBlockHeight('confirmed');lastVerified=now();
  }catch(error){
   if(error?.terminal)throw error;
   if(now()-lastVerified>=unavailableMs)throw Error('Confirmation or block height is unavailable. Keep the saved signature and check its outcome before retrying.');
   emit('confirmation_retry',{attempts});await sleep(intervalMs);continue;
  }
  if(height>lastValidBlockHeight){
   if((attempts||reconcileBySignature)&&await status())return signature;
   throw Error('Blockhash expired; rebroadcast stopped. Check the saved signature before preparing another transaction.');
  }
  attempts++;emit('send_started',{signature,submissionAttempted:true,rebroadcastAttempts:attempts,currentBlockHeight:height});
  try{
   // maxRetries:0 disables the provider queue; THIS loop owns bounded retries.
   const received=await connection.sendRawTransaction(Uint8Array.from(original),{skipPreflight:false,maxRetries:0,preflightCommitment:'confirmed'});
   mayHaveForwarded=true;
   if(received!==signature)throw Object.assign(Error('RPC returned an unexpected signature.'),{terminal:true});
   emit('rpc_accepted',{rpcAccepted:true,rebroadcastAttempts:attempts});
  }catch(error){
   if(error?.terminal)throw error;
   const refused=relayRejection(error);
   // Stop at once only when no attempt could have reached an RPC. After an accepted or uncertain send,
   // a refused resend proves nothing about the earlier copy, so status checks continue until expiry.
   if(refused&&!mayHaveForwarded){
    if(reconcileBySignature){try{if(await status())return signature;}catch(error){if(error?.terminal)throw error;else throw Error('Submission refused, but signature reconciliation is unavailable. Keep the saved signature and check its outcome before retrying.');}throw Error('Closure submission was refused and its signature is not confirmed. Keep the saved signature and check confirmation before any new review.');}
    emit('relay_rejected',{submissionAttempted:false,rpcAccepted:false,relayRejected:true,rebroadcastAttempts:attempts});
    throw Object.assign(Error(`The Grainpad relay refused this transaction before submission: ${refused.reason} Nothing was sent.`),{terminal:true,notSubmitted:true});
   }
   if(!refused)mayHaveForwarded=true;
   lastError=error;emit('rebroadcast_retry',{rebroadcastAttempts:attempts,lastSendError:String(lastError?.message||'RPC unavailable').replace(/https?:\/\/[^\s"']+/g,'[URL]').slice(0,500)});
  }
  // Check immediately: a lost send response may still have landed the transaction.
  try{if(await status())return signature;}catch(error){if(error?.terminal)throw error;}
  await sleep(intervalMs);
 }
}
