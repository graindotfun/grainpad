/** Exact reviewed SOL route scope, before any generic relay program check. Never forwards itself.
 * admit re-verifies that the stored mint and pool are still the registered launch's current Grainpad route. */
import {Buffer} from 'buffer';import {PublicKey} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import {resolveTransactionAddresses,transactionAddressKeys} from './transaction-addresses.mjs';
import {assertWalletTransaction} from './wallet-transaction-policy.mjs';
import {simulationCostProof} from './simulation-cost.mjs';
import {submittedSignature} from './rpc-submissions.mjs';
import {assertSolTradeOutcome,assertSolTradeDeadline,bindSolTradeSubmission,requireSolRouteAdmission} from './sol-trade-intent.mjs';
export async function verifySolTradeSubmission(storage,id,encoded,connection,{clock=Date.now,admit=requireSolRouteAdmission}={}){
 // Verify actual detached owner signature before even a same-wire rebroadcast.
 const signature=submittedSignature(encoded);
 let addresses=[];
 const bound=await bindSolTradeSubmission(storage,id,encoded,{clock,admit,validate:async(review,tx)=>{
  if(!['buy','sell'].includes(review.side)||review.balanceGuardsVersion!==2||!/^\d+$/.test(review.tokenBaseline)||!review.reviewed||typeof review.baseAccount!=='string'||![String(TOKEN_PROGRAM_ID),String(TOKEN_2022_PROGRAM_ID)].includes(review.tokenProgram))throw Error('SOL relay requires reviewed execution-time balance guards.');
  if(await connection.getBlockHeight('confirmed')>review.lastValidBlockHeight)throw Error('SOL trade blockhash expired.');
  const context=await resolveTransactionAddresses(connection,tx,{minContextSlot:review.minContextSlot});
  assertWalletTransaction(review.reviewed,tx,context,{allowDefaultZeroPrice:review.allowDefaultZeroPrice===true,allowVerifiedLookupRemap:true});addresses=transactionAddressKeys(tx,context);
  const proof=await simulationCostProof(connection,tx,new PublicKey(review.owner),{sigVerify:true,addresses:[review.owner,review.baseAccount],minContextSlot:review.minContextSlot,addressContext:context,allowPayerCredit:review.side==='sell'});
  const account=proof.accounts[1];if(!account||account.owner!==review.tokenProgram)throw Error('Missing fresh net token result.');
  const bytes=Buffer.from(account.data[0],'base64');
  if(bytes.length<165||!bytes.subarray(0,32).equals(new PublicKey(review.mint).toBuffer())||!bytes.subarray(32,64).equals(new PublicKey(review.owner).toBuffer()))throw Error('Wrong net token owner or mint.');
  const tokenAfter=bytes.readBigUInt64LE(64),baseline=BigInt(review.tokenBaseline);
  const inputDelta=review.side==='buy'?review.amount:String(baseline-tokenAfter),outputDelta=review.side==='buy'?String(tokenAfter-baseline):String(BigInt(proof.after)-BigInt(proof.before)+BigInt(proof.fee));
  assertSolTradeOutcome(review,{...proof,inputDelta,outputDelta,tokenBaselineEvidence:'same-bank-or-onchain-guard'});
 }});
 assertSolTradeDeadline(bound,clock());
 return {signature,review:bound,accounts:addresses.length?addresses:[bound.owner,bound.baseAccount]};
}
