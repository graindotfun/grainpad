/** SOL⇄token route discovered from the pinned SOL/wXMR CLMM pool and the token's verified pool.
 * Jupiter's quote API is not consulted. The swap is one route_v2 instruction so the router
 * spends the CLMM output that actually lands, instead of a second fixed amount that would
 * leave wXMR behind. Jupiter's indexed route remains available when this builder cannot run. */
import {Buffer} from 'buffer';
import {PublicKey,TransactionInstruction,SystemProgram,ComputeBudgetProgram} from '@solana/web3.js';
import {NATIVE_MINT,TOKEN_PROGRAM_ID,createAssociatedTokenAccountIdempotentInstruction,createSyncNativeInstruction,createCloseAccountInstruction} from '@solana/spl-token';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import {QUOTES} from './quote-assets.mjs';
import {CPMM_CONFIG} from './launch-instructions.mjs';
import {readMarket,swapInstruction} from './market-core.mjs';
import {SOL_WXMR_CLMM_POOL,SOL_INTERMEDIATE_VENUE} from './sol-route-scope.mjs';
import {SOL_MINT} from './sol-trade-intent.mjs';
import {inspectRouteV2,ROUTE_V2_VARIANTS,JUPITER_ROUTE_V2_DISCRIMINATOR} from './jupiter-route-v2.mjs';
import {GRAINPAD_SOL_LOOKUP_TABLE,REFUSED_THIRD_PARTY_SOL_LOOKUP,assertGrainpadLookupTable,preCreationLookupAddresses} from './sol-route-lookup.mjs';
export const CLMM_PROGRAM_ID='CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK';
export {GRAINPAD_SOL_LOOKUP_TABLE,REFUSED_THIRD_PARTY_SOL_LOOKUP};
const JUPITER='JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const EVENT='D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf';
const CLMM_MAX=20;
const userError=message=>Object.assign(Error(message),{code:'direct-user'});
const meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey:new PublicKey(pubkey),isSigner,isWritable});
const raw=ix=>({programId:ix.programId.toBase58(),accounts:ix.keys.map(k=>({pubkey:k.pubkey.toBase58(),isSigner:k.isSigner,isWritable:k.isWritable})),data:Buffer.from(ix.data).toString('base64')});
const threshold=(amount,slippageBps)=>{const n=amount*BigInt(10000-slippageBps)/10000n;if(n<1n)throw userError('Minimum output rounds to zero. Increase the amount or reduce slippage.');return n;};
/** route_v2 bytes for the two reviewed steps. Extra variant bytes stay zero. */
export function encodeDirectRouteV2({amountIn,amountOut,slippageBps,steps}){
 if(!Array.isArray(steps)||steps.length!==2||!Number.isInteger(slippageBps)||slippageBps<0||slippageBps>65535)throw Error('Unsupported direct route shape.');
 let size=34;for(const step of steps)size+=1+(step.extra||0)+4;
 const data=Buffer.alloc(size);data.write(JUPITER_ROUTE_V2_DISCRIMINATOR,'hex');
 data.writeBigUInt64LE(BigInt(amountIn),8);data.writeBigUInt64LE(BigInt(amountOut),16);data.writeUInt16LE(slippageBps,24);data.writeUInt32LE(steps.length,30);
 let at=34;for(const step of steps){if(!ROUTE_V2_VARIANTS[step.tag])throw Error('Unknown direct route step.');data[at++]=step.tag;at+=(step.extra||0);data.writeUInt16LE(10000,at);at+=2;data[at++]=step.input;data[at++]=step.output;}
 if(at!==size)throw Error('Direct route encoding overflow.');return data;
}
export function clmmSlice({owner,config,pool,inputAta,outputAta,inputVault,outputVault,observation,ticks,bitmap}){
 const keys=[meta(CLMM_PROGRAM_ID),meta(owner),meta(config),meta(pool,true),meta(inputAta,true),meta(outputAta,true),meta(inputVault,true),meta(outputVault,true),meta(observation,true),meta(TOKEN_PROGRAM_ID),...ticks.map(t=>meta(t,true)),meta(bitmap,true),meta(JUPITER)];
 if(keys.length<12||keys.length>CLMM_MAX)throw Error('SOL/wXMR tick arrays do not fit the reviewed route.');return keys;
}
export function launchSlice({owner,platformId,pool,baseAta,quoteAta,vaultA,vaultB,mint,tokenProgram,creator}){
 const L=sdk.LAUNCHPAD_PROGRAM,wxmr=new PublicKey(QUOTES.wXMR.mint),event=PublicKey.findProgramAddressSync([Buffer.from('__event_authority')],L)[0];
 return [meta(L),meta(owner,true),meta(sdk.getPdaLaunchpadAuth(L).publicKey),meta(pool.configId),meta(platformId),meta(pool.poolId,true),meta(baseAta,true),meta(quoteAta,true),meta(vaultA,true),meta(vaultB,true),meta(mint),meta(wxmr),meta(tokenProgram),meta(TOKEN_PROGRAM_ID),meta(event),meta(L),meta(owner,true,true),meta(SystemProgram.programId),meta(sdk.getPdaPlatformVault(L,new PublicKey(platformId),wxmr).publicKey,true),meta(sdk.getPdaCreatorVault(L,new PublicKey(creator),wxmr).publicKey,true),meta(JUPITER)];
}
export function cpmmSlice({owner,pool,inputAta,outputAta,inputVault,outputVault,inputMint,outputMint,inputProgram,outputProgram,observation}){
 return [meta(sdk.CREATE_CPMM_POOL_PROGRAM),meta(owner),meta(sdk.CREATE_CPMM_POOL_AUTH),meta(CPMM_CONFIG),meta(pool,true),meta(inputAta,true),meta(outputAta,true),meta(inputVault,true),meta(outputVault,true),meta(inputProgram),meta(outputProgram),meta(inputMint),meta(outputMint),meta(observation,true)];
}
/** Exported for the read-only account capture, which records exactly what this quote reads. */
export async function clmmQuote(connection,inputMint,amount){
 if(typeof connection.getAccountInfo!=='function')return null;
 const poolId=new PublicKey(SOL_WXMR_CLMM_POOL),info=await connection.getAccountInfo(poolId,'confirmed');
 if(!info||info.owner.toBase58()!==CLMM_PROGRAM_ID)return null;
 const decoded=sdk.PoolInfoLayout.decode(info.data);
 if(!decoded.mintA.equals(NATIVE_MINT)||decoded.mintDecimalsA!==9||decoded.mintB.toBase58()!==QUOTES.wXMR.mint||decoded.mintDecimalsB!==12)throw Error('Pinned SOL/wXMR pool mints changed.');
 const configInfo=await connection.getAccountInfo(decoded.configId,'confirmed'),config=configInfo&&sdk.ClmmConfigLayout.decode(configInfo.data);
 if(!config||config.tickSpacing!==decoded.tickSpacing)throw Error('Pinned SOL/wXMR pool config is unreadable.');
 const view=(mint,decimals)=>({address:mint.toBase58(),programId:TOKEN_PROGRAM_ID.toBase58(),decimals,chainId:101,logoURI:'',symbol:'',name:'',extensions:{}});
 const poolInfo={id:SOL_WXMR_CLMM_POOL,programId:CLMM_PROGRAM_ID,mintA:view(decoded.mintA,decoded.mintDecimalsA),mintB:view(decoded.mintB,decoded.mintDecimalsB),config:{id:decoded.configId.toBase58(),index:config.index,protocolFeeRate:config.protocolFeeRate,tradeFeeRate:config.tradeFeeRate,tickSpacing:config.tickSpacing,fundFeeRate:config.fundFeeRate,fundOwner:config.fundOwner.toBase58(),description:''},price:0};
 const compute=await sdk.PoolUtils.fetchComputeClmmInfo({connection,poolInfo,rpcData:decoded});
 const cache=await sdk.PoolUtils.fetchMultiplePoolTickArrays({connection,poolKeys:[compute],batchRequest:false});
 const quoted=sdk.PoolUtils.getOutputAmountAndRemainAccounts(compute,compute.exBitmapInfo,cache[SOL_WXMR_CLMM_POOL],new PublicKey(inputMint),new BN(amount.toString()),Math.floor(Date.now()/1000));
 if(!quoted?.allTrade||!quoted.expectedAmountOut||quoted.expectedAmountOut.isNeg()||quoted.expectedAmountOut.isZero())throw userError('The SOL/wXMR pool cannot fill this amount.');
 const bitmap=sdk.getPdaExBitmapAccount(new PublicKey(CLMM_PROGRAM_ID),poolId).publicKey;
 const ticks=(quoted.remainingAccounts||[]).map(k=>new PublicKey(k)).filter(k=>!k.equals(bitmap));
 if(!ticks.length)throw Error('SOL/wXMR tick arrays were not resolved.');
 const inputIsA=decoded.mintA.equals(new PublicKey(inputMint));
 return {decoded,bitmap,ticks,amountOut:BigInt(quoted.expectedAmountOut.toString()),inputVault:inputIsA?decoded.vaultA:decoded.vaultB,outputVault:inputIsA?decoded.vaultB:decoded.vaultA};
}
function leg(inputMint,outputMint,inAmount,outAmount,ammKey,label){return {bps:10000,percent:100,swapInfo:{inputMint,outputMint,inAmount:String(inAmount),outAmount:String(outAmount),ammKey,poolAddress:ammKey,label}};}
/** Local exact-in quote and route_v2 packet. Returns null when the pinned pool cannot be read. */
export async function buildDirectSolRoute({connection,scope,platformId,owner,side,amount,slippageBps,baseAta,wsolAta,quoteAta,lookupTableAddress}){
 const tableAddress=lookupTableAddress===undefined?GRAINPAD_SOL_LOOKUP_TABLE:lookupTableAddress;
 if(!tableAddress||tableAddress===REFUSED_THIRD_PARTY_SOL_LOOKUP)assertGrainpadLookupTable({tableAddress,table:null,required:[]});
 let clmm;
 if(side==='buy'){clmm=await clmmQuote(connection,SOL_MINT,BigInt(amount));if(!clmm)return null;}
 const market=await readMarket(connection,new PublicKey(scope.mint),new PublicKey(platformId));
 if(market.route==='graduating')throw userError('This token is migrating from its LaunchLab curve to Raydium. SOL and wXMR trading resume when the Raydium pool is live.');
 if(market.route!==scope.stage||String(market.poolId)!==scope.pool)throw Error('Direct route pool does not match the verified scope.');
 const payer=new PublicKey(owner),wxmr=new PublicKey(QUOTES.wXMR.mint);
 let poolQuote,steps,poolKeys;
 if(side==='sell'){
  try{poolQuote=swapInstruction(market,payer,new PublicKey(scope.mint),'sell',BigInt(amount),slippageBps,false,{quoteAccount:quoteAta});}
  catch(e){throw userError(e.message);}
  clmm=await clmmQuote(connection,QUOTES.wXMR.mint,poolQuote.output);if(!clmm)return null;
 }
 if(scope.stage==='curve'){
  if(side==='buy'){try{poolQuote=swapInstruction(market,payer,new PublicKey(scope.mint),'buy',clmm.amountOut,slippageBps,false,{quoteAccount:quoteAta});}catch(e){throw userError(e.message);}}
  steps=side==='buy'?[{tag:26,input:0,output:1},{tag:81,extra:8,input:1,output:2}]:[{tag:82,extra:8,input:0,output:1},{tag:26,input:1,output:2}];
  poolKeys=launchSlice({owner,platformId,pool:{poolId:market.poolId,configId:market.pool.configId},baseAta,quoteAta,vaultA:market.pool.vaultA,vaultB:market.pool.vaultB,mint:scope.mint,tokenProgram:scope.tokenProgram,creator:market.pool.creator});
 }else if(scope.stage==='cpmm'){
  if(side==='buy'){try{poolQuote=swapInstruction(market,payer,new PublicKey(scope.mint),'buy',clmm.amountOut,slippageBps,false,{quoteAccount:quoteAta});}catch(e){throw userError(e.message);}}
  const p=market.cpData,inputIsToken=side==='sell',inputIsA=p.mintA.equals(inputIsToken?new PublicKey(scope.mint):wxmr);
  const inputVault=inputIsA?p.vaultA:p.vaultB,outputVault=inputIsA?p.vaultB:p.vaultA;
  const inputAta=side==='buy'?quoteAta:baseAta,outputAta=side==='buy'?baseAta:quoteAta;
  const inputProgram=side==='buy'?TOKEN_PROGRAM_ID:new PublicKey(scope.tokenProgram),outputProgram=side==='buy'?new PublicKey(scope.tokenProgram):TOKEN_PROGRAM_ID;
  steps=side==='buy'?[{tag:26,input:0,output:1},{tag:46,input:1,output:2}]:[{tag:46,input:0,output:1},{tag:26,input:1,output:2}];
  poolKeys=cpmmSlice({owner,pool:market.poolId,inputAta,outputAta,inputVault,outputVault,inputMint:side==='buy'?wxmr:new PublicKey(scope.mint),outputMint:side==='buy'?new PublicKey(scope.mint):wxmr,inputProgram,outputProgram,observation:p.observationId});
 }else throw Error('Unsupported verified pool stage.');
 const out=poolQuote.output,minimum=threshold(side==='buy'?out:clmm.amountOut,slippageBps);
 const outputMint=side==='buy'?scope.mint:SOL_MINT,quotedOut=side==='buy'?out:clmm.amountOut;
 const wxmrAmount=side==='buy'?clmm.amountOut:poolQuote.output;
 const plan=side==='buy'?[leg(SOL_MINT,QUOTES.wXMR.mint,amount,wxmrAmount,SOL_WXMR_CLMM_POOL,SOL_INTERMEDIATE_VENUE),leg(QUOTES.wXMR.mint,scope.mint,wxmrAmount,out,scope.pool,scope.venue)]:[leg(scope.mint,QUOTES.wXMR.mint,amount,wxmrAmount,scope.pool,scope.venue),leg(QUOTES.wXMR.mint,SOL_MINT,wxmrAmount,clmm.amountOut,SOL_WXMR_CLMM_POOL,SOL_INTERMEDIATE_VENUE)];
 const quote={inputMint:side==='buy'?SOL_MINT:scope.mint,outputMint,swapMode:'ExactIn',inAmount:String(amount),outAmount:String(quotedOut),otherAmountThreshold:String(minimum),slippageBps,platformFee:null,routePlan:plan};
 const clmmKeys=clmmSlice({owner,config:clmm.decoded.configId,pool:SOL_WXMR_CLMM_POOL,inputAta:side==='buy'?wsolAta:quoteAta,outputAta:side==='buy'?quoteAta:wsolAta,inputVault:clmm.inputVault,outputVault:clmm.outputVault,observation:clmm.decoded.observationId,ticks:clmm.ticks,bitmap:clmm.bitmap});
 const source=side==='buy'?wsolAta:baseAta,destination=side==='buy'?baseAta:wsolAta,sourceProgram=side==='buy'?TOKEN_PROGRAM_ID:new PublicKey(scope.tokenProgram),destProgram=side==='buy'?new PublicKey(scope.tokenProgram):TOKEN_PROGRAM_ID;
 const fixed=[meta(owner,false,true),meta(source,true),meta(destination,true),meta(quote.inputMint),meta(quote.outputMint),meta(sourceProgram),meta(destProgram),meta(JUPITER),meta(EVENT),meta(JUPITER)];
 const keys=side==='buy'?[...fixed,...clmmKeys,...poolKeys]:[...fixed,...poolKeys,...clmmKeys];
 const swap=new TransactionInstruction({programId:new PublicKey(JUPITER),keys,data:encodeDirectRouteV2({amountIn:amount,amountOut:quotedOut,slippageBps,steps})});
 const failed=inspectRouteV2(swap,{side,scope,owner,platformId,baseAta:String(baseAta),wsolAta:String(wsolAta),quoteAta:String(quoteAta)});
 if(failed.length)throw Error('Direct route failed its own account check: '+failed.join(', '));
 if(typeof connection.getAddressLookupTable!=='function')throw Error('SOL route lookup table cannot be read.');
 const loaded=await connection.getAddressLookupTable(new PublicKey(tableAddress));
 assertGrainpadLookupTable({tableAddress,table:loaded?.value??null,required:preCreationLookupAddresses(clmm.decoded)});
 const baseProgram=new PublicKey(scope.tokenProgram);
 const setup=[createAssociatedTokenAccountIdempotentInstruction(payer,wsolAta,payer,NATIVE_MINT),createAssociatedTokenAccountIdempotentInstruction(payer,quoteAta,payer,wxmr),createAssociatedTokenAccountIdempotentInstruction(payer,baseAta,payer,new PublicKey(scope.mint),baseProgram)];
 if(side==='buy')setup.push(SystemProgram.transfer({fromPubkey:payer,toPubkey:wsolAta,lamports:Number(amount)}));
 setup.push(createSyncNativeInstruction(wsolAta));
 const built={setupInstructions:setup.map(raw),computeBudgetInstructions:[raw(ComputeBudgetProgram.setComputeUnitLimit({units:600000}))],swapInstruction:raw(swap),cleanupInstruction:raw(createCloseAccountInstruction(wsolAta,payer,payer)),addressLookupTableAddresses:[tableAddress]};
 return {quote,built,routeSource:'verified-pools'};
}
/** Prefer the local pool route. A direct-user rejection is returned to the caller; other failures leave Jupiter available. */
export async function tryDirectSolRoute(args){
 try{return await buildDirectSolRoute(args);}
 catch(error){if(error?.code==='direct-user')throw error;return {error};}
}
