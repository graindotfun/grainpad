/** An absent signature alone is not evidence of failure. Release only on finality or proven expiry.
 * acceptConfirmed settles at supermajority-voted (optimistic) confirmation; callers opt in per flow.
 * @param {any} connection
 * @param {string} signature
 * @param {{expiry?:number,target?:string|null,publicKey?:(value:string)=>any,acceptConfirmed?:boolean}} [options] */
export async function inspectTransactionStatus(connection,signature,{expiry,target,publicKey,acceptConfirmed=false}={}){
 const read=async()=>(await connection.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];
 const status=await read();
 if(status?.confirmationStatus==='finalized')return {status:status.err?'failed':'finalized'};
 if(acceptConfirmed&&status?.confirmationStatus==='confirmed')return {status:status.err?'failed':'confirmed'};
 if(status)return {status:'pending'};
 if(target&&await connection.getAccountInfo(publicKey(target),'finalized'))return {status:'unknown',reason:'Target account exists. Verify the existing platform or mint before proceeding.'};
 if(Number.isSafeInteger(expiry)&&expiry>0){
  if(await connection.getBlockHeight('finalized')>expiry){
   const again=await read();
   if(!again)return {status:'expired'};
   if(again.confirmationStatus==='finalized')return {status:again.err?'failed':'finalized'};
  }
  return {status:'pending'};
 }
 return {status:'unknown',reason:'The earlier transaction has no saved expiry. Its status must be verified before another attempt.'};
}
