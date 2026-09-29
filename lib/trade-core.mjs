/** Shared public-trade preparation. This module never signs or sends. */
import './browser-buffer.mjs';
import {estimatePriorityFee,priorityPolicy} from './priority-fee.mjs';
import {Buffer} from 'buffer';
import {PublicKey,TransactionMessage,VersionedTransaction,ComputeBudgetProgram,SystemProgram} from '@solana/web3.js';
import {NATIVE_MINT,TOKEN_PROGRAM_ID,ACCOUNT_SIZE,createInitializeAccount3Instruction,createCloseAccountInstruction,createAssociatedTokenAccountIdempotentInstruction,getAssociatedTokenAddressSync,unpackAccount} from '@solana/spl-token';
import {readMarket,swapInstruction} from './market-core.mjs';
export const TRADE_FEE_RESERVE=500000n;
export {parseTokenUnits as parseUnits} from './quote-assets.mjs';
export {displayUnits} from './token-units.mjs';
import {displayUnits} from './token-units.mjs';
export async function prepareCurveTrade({connection,owner,mint,platformId,side,amount,slippageBps=500,expectedGenesis,priorityBounds=priorityPolicy()}){
 if(!['buy','sell'].includes(side))throw Error('Choose Buy or Sell.');
 if(await connection.getGenesisHash()!==expectedGenesis)throw Error('Network mismatch. Nothing was prepared.');
 const market=await readMarket(connection,mint,platformId);
 if(market.route==='graduating')throw Error('Graduating to Raydium, trading paused.');
 if(market.pool.mintDecimalsA!==6||market.pool.mintDecimalsB!==market.quote.decimals||market.config.curveType!==0)throw Error('Unsupported decimals or curve type.');
 const rent=BigInt(await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE));
 const native=market.quote.native,quoteMint=new PublicKey(market.quote.mint),quoteAta=getAssociatedTokenAddressSync(quoteMint,owner);
 const quoteInfo=await connection.getAccountInfo(quoteAta,'confirmed');
 const quoteBalance=quoteInfo?unpackAccount(quoteAta,quoteInfo,TOKEN_PROGRAM_ID).amount:0n;
 if(!native&&side==='buy'&&quoteBalance<amount)throw Error('Insufficient wXMR. Supply wXMR directly from your wallet; no automatic SOL conversion is available.');
 const seed=crypto.randomUUID().replaceAll('-','').slice(0,32),temporary=await PublicKey.createWithSeed(owner,seed,TOKEN_PROGRAM_ID);
 const quote=swapInstruction(market,owner,mint,side,amount,slippageBps,false,{quoteAccount:native?temporary:quoteAta});
 const ata=getAssociatedTokenAddressSync(mint,owner);
 const [balance,tokenAccount]=await Promise.all([connection.getBalance(owner,'confirmed'),connection.getAccountInfo(ata,'confirmed')]);
 if(side==='sell'){
  if(!tokenAccount||unpackAccount(ata,tokenAccount,TOKEN_PROGRAM_ID).amount<amount)throw Error('Insufficient token balance for this sale.');
 }
 // Require enough upfront native SOL even when a sell will return SOL later.
 const required=(native&&side==='buy'?amount:0n)+(native?rent:quoteInfo?0n:rent)+(tokenAccount?0n:rent)+TRADE_FEE_RESERVE;
 if(native&&amount>BigInt(Number.MAX_SAFE_INTEGER))throw Error('SOL amount is outside the supported range.');
 if(BigInt(balance)<required)throw Error(`Insufficient SOL. Keep at least ${displayUnits(required,9)} SOL for this trade, temporary account rent and network fees.`);
 const instructions=[
 ...(native?[SystemProgram.createAccountWithSeed({fromPubkey:owner,newAccountPubkey:temporary,basePubkey:owner,seed,lamports:Number(rent+(side==='buy'?amount:0n)),space:ACCOUNT_SIZE,programId:TOKEN_PROGRAM_ID}),
 createInitializeAccount3Instruction(temporary,NATIVE_MINT,owner)]:[createAssociatedTokenAccountIdempotentInstruction(owner,quoteAta,owner,quoteMint)]),
 ...(side==='buy'?[createAssociatedTokenAccountIdempotentInstruction(owner,ata,owner,mint)]:[]),
 quote.instruction,...(native?[createCloseAccountInstruction(temporary,owner,owner)]:[])];
 const priorityFee=await estimatePriorityFee(connection,instructions,priorityBounds,300000);
 instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({units:300000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:priorityFee.microLamports}));
 const latest=await connection.getLatestBlockhash('confirmed');
 const transaction=new VersionedTransaction(new TransactionMessage({payerKey:owner,recentBlockhash:latest.blockhash,instructions}).compileToV0Message());
 const [sim,fee]=await Promise.all([connection.simulateTransaction(transaction,{sigVerify:false,commitment:'confirmed',accounts:{encoding:'base64',addresses:[owner.toBase58(),ata.toBase58(),quoteAta.toBase58()]}}),connection.getFeeForMessage(transaction.message,'confirmed')]);
 if(sim.value.err)throw Error(`Trade simulation failed. No wallet prompt was opened. ${JSON.stringify(sim.value.err)}`);
 const after=sim.value.accounts?.[0]?.lamports;
 if(after===undefined||after===null||fee.value===null)throw Error('Could not verify trade cost. Prepare again.');
 if(BigInt(after)<TRADE_FEE_RESERVE)throw Error('This trade would leave too little SOL for network fees.');
 const estimatedLamports=Math.max(0,balance-after);
 const outputAccount=sim.value.accounts?.[1];
 if(!outputAccount)throw Error('Could not verify the token destination.');
 const afterTokens=Buffer.from(outputAccount.data[0],'base64').readBigUInt64LE(64);
 const beforeTokens=tokenAccount?unpackAccount(ata,tokenAccount,TOKEN_PROGRAM_ID).amount:0n;
 if(side==='buy'&&afterTokens-beforeTokens<quote.minimum)throw Error('Simulation output is below the protected minimum.');
 if(side==='sell'&&beforeTokens-afterTokens!==amount)throw Error('Unexpected simulated token debit.');
 if(!native){const postQuote=sim.value.accounts?.[2];if(!postQuote)throw Error('Could not verify quote destination.');const afterQuote=Buffer.from(postQuote.data[0],'base64').readBigUInt64LE(64);if(side==='buy'&&quoteBalance-afterQuote!==amount)throw Error('Unexpected wXMR debit.');if(side==='sell'&&afterQuote-quoteBalance<quote.minimum)throw Error('wXMR output below protected minimum.');}
 return {priorityFee,quoteAsset:market.quote,minimumBalanceLamports:Number(TRADE_FEE_RESERVE),transaction,network:'mainnet-beta',owner:owner.toBase58(),estimatedLamports,maxLamports:BigInt(balance)-TRADE_FEE_RESERVE,createdAt:Date.now(),lastValidBlockHeight:latest.lastValidBlockHeight,blockhash:latest.blockhash,
 quote:{...quote,instruction:undefined},pool:market.poolId.toBase58(),mint:mint.toBase58(),side,slippageBps,networkFee:fee.value,temporaryRent:native?rent.toString():'0',tokenAccountRent:tokenAccount?'0':rent.toString(),computeUnits:sim.value.unitsConsumed,solBefore:balance,solAfter:after,simulationTokenDelta:(afterTokens-beforeTokens).toString()};
}
