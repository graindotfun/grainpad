import './browser-buffer.mjs';
import {Buffer} from 'buffer';
import {PublicKey,VersionedTransaction,TransactionMessage,ComputeBudgetProgram,type TransactionInstruction} from '@solana/web3.js';
import {rpc,assertNetwork,solToLamports,formatSOL,type PreparedOperation} from './launch';
export async function prepareInstructions(ownerAddress:string,instructions:TransactionInstruction[],maxCost:string):Promise<PreparedOperation>{
 (globalThis as unknown as {Buffer:typeof Buffer}).Buffer??=Buffer;
 const connection=rpc('mainnet-beta');await assertNetwork(connection,'mainnet-beta');
 const owner=new PublicKey(ownerAddress),latest=await connection.getLatestBlockhash(),maxLamports=solToLamports(maxCost);
 const transaction=new VersionedTransaction(new TransactionMessage({payerKey:owner,recentBlockhash:latest.blockhash,instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:600000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}),...instructions]}).compileToV0Message());
 const before=await connection.getBalance(owner),sim=await connection.simulateTransaction(transaction,{sigVerify:false,commitment:'confirmed',accounts:{encoding:'base64',addresses:[ownerAddress]}});
 if(sim.value.err)throw Error(`Simulation failed; nothing was sent. ${JSON.stringify(sim.value.err)}`);
 const after=sim.value.accounts?.[0]?.lamports,fee=(await connection.getFeeForMessage(transaction.message)).value;
 if(after===undefined||after===null||fee===null)throw Error('Unable to estimate transaction cost.');
 const estimatedLamports=Math.max(0,before-after);
 if(BigInt(estimatedLamports)>maxLamports||before<estimatedLamports)throw Error(`Estimated maximum debit ${formatSOL(estimatedLamports)} SOL exceeds the limit or wallet balance.`);
 return {transaction,network:'mainnet-beta',owner:ownerAddress,estimatedLamports,maxLamports,createdAt:Date.now(),lastValidBlockHeight:latest.lastValidBlockHeight,blockhash:latest.blockhash};
}
