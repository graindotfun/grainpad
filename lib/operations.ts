import './browser-buffer.mjs';
import {simulationCostProof} from './simulation-cost.mjs';
import {estimatePriorityFee,publicPriorityPolicy} from './priority-fee.mjs';
import {Buffer} from 'buffer';
import {PublicKey,VersionedTransaction,TransactionMessage,ComputeBudgetProgram,type TransactionInstruction} from '@solana/web3.js';
import {rpc,assertNetwork,solToLamports,formatSOL,type PreparedOperation} from './launch';
export async function prepareInstructions(ownerAddress:string,instructions:TransactionInstruction[],maxCost:string):Promise<PreparedOperation>{
 (globalThis as unknown as {Buffer:typeof Buffer}).Buffer??=Buffer;
 const connection=rpc('mainnet-beta');await assertNetwork(connection,'mainnet-beta');
 const priorityFee=await estimatePriorityFee(connection,instructions,await publicPriorityPolicy(),600000);
 const owner=new PublicKey(ownerAddress),latest=await connection.getLatestBlockhash(),maxLamports=solToLamports(maxCost);
 const transaction=new VersionedTransaction(new TransactionMessage({payerKey:owner,recentBlockhash:latest.blockhash,instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:600000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:priorityFee.microLamports}),...instructions]}).compileToV0Message());
 const proof=await simulationCostProof(connection,transaction,owner,{sigVerify:false,addresses:[ownerAddress]});
 const estimatedLamports=proof.debit;
 if(BigInt(estimatedLamports)>maxLamports||proof.before<estimatedLamports)throw Error(`Estimated maximum debit ${formatSOL(estimatedLamports)} SOL exceeds the limit or wallet balance.`);
 return {priorityFee,transaction,network:'mainnet-beta',owner:ownerAddress,estimatedLamports,maxLamports,createdAt:Date.now(),lastValidBlockHeight:latest.lastValidBlockHeight,blockhash:latest.blockhash};
}
