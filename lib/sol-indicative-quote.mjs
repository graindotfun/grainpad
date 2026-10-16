/** Display-only SOL route estimate. No wallet, instructions, intent, signing or relay. */
import {PublicKey} from '@solana/web3.js';import {getAssociatedTokenAddressSync} from '@solana/spl-token';import {solPaymentAsset} from './sol-payment-assets.mjs';import {buildDirectSolRoute} from './sol-direct-route.mjs';import {PLATFORM_SETTINGS} from './platform-settings.mjs';import {grainpadPlatformId} from './platform-policy.mjs';import {QUOTES} from './quote-assets.mjs';import {SOL_INTERMEDIATE_VENUE,SOL_ROUTE_VENUES} from './sol-route-scope.mjs';import {SOL_MINT,assertSolRouteQuote} from './sol-trade-intent.mjs';import {fetchSolRouterJSON} from './sol-trade-prepare.mjs';
const U64=18446744073709551615n;
export function validateSolIndicativeInput(input){if(!input||typeof input!=='object'||Array.isArray(input)||!['amount,mint,side,slippageBps','amount,mint,paymentAsset,side,slippageBps'].includes(Object.keys(input).sort().join(','))||typeof input.mint!=='string'||new PublicKey(input.mint).toBase58()!==input.mint||!['buy','sell'].includes(input.side)||typeof input.amount!=='string'||!/^[1-9]\d{0,15}$/.test(input.amount)||BigInt(input.amount)>BigInt(Number.MAX_SAFE_INTEGER)||!Number.isInteger(input.slippageBps)||input.slippageBps<0||input.slippageBps>2000)throw Error('Enter a supported SOL estimate amount and slippage.');solPaymentAsset(input.paymentAsset);return input;}
/** resolveScope is server owned: the registered launch's current verified pool (see sol-route-scope.mjs). */
export async function prepareSolIndicativeQuote({input,resolveScope,fetcher=(...args)=>globalThis.fetch(...args),now=Date.now,connection}){
 validateSolIndicativeInput(input);const {mint,side,amount,slippageBps}=input,payment=solPaymentAsset(input.paymentAsset);
 if(typeof resolveScope!=='function')throw Error('SOL estimate route admission is not configured.');
 const scope=await resolveScope(mint);
 if(scope?.mint!==mint||scope.quoteMint!==QUOTES.wXMR.mint||!Object.values(SOL_ROUTE_VENUES).includes(scope.venue)||typeof scope.pool!=='string'||new PublicKey(scope.pool).toBase58()!==scope.pool)throw Error('SOL estimates require a verified Grainpad wXMR route.');
 const params=new URLSearchParams({inputMint:side==='buy'?SOL_MINT:mint,outputMint:side==='buy'?mint:SOL_MINT,amount,slippageBps:String(slippageBps),swapMode:'ExactIn',instructionVersion:'V2',restrictIntermediateTokens:'true',maxAccounts:'64',dexes:`${scope.venue},${SOL_INTERMEDIATE_VENUE}`});
 // Display polling retries once at most; reviewed preparation keeps the larger bounded retry.
 let quote;
 if(payment.symbol==='USDC'){
  if(!connection)throw Error('USDC estimate connection unavailable.');
  const payer=new PublicKey(PLATFORM_SETTINGS.admin),baseAta=getAssociatedTokenAddressSync(new PublicKey(mint),payer,false,new PublicKey(scope.tokenProgram)),quoteAta=getAssociatedTokenAddressSync(new PublicKey(scope.quoteMint),payer),wsolAta=getAssociatedTokenAddressSync(new PublicKey(payment.mint),payer);
  ({quote}=await buildDirectSolRoute({connection,scope,platformId:String(grainpadPlatformId()),owner:String(payer),side,amount,slippageBps,baseAta,quoteAta,wsolAta,paymentAsset:payment.symbol,quoteOnly:true}));
 }else quote=await fetchSolRouterJSON(fetcher,'https://api.jup.ag/swap/v1/quote?'+params,undefined,{attempts:2,deadlineMs:8000});
 assertSolRouteQuote(quote,{mint,pool:scope.pool,side,amount,slippageBps,venue:scope.venue,paymentAsset:payment.symbol});
 if(quote.routePlan.length!==2||quote.routePlan[0].swapInfo.outputMint!==scope.quoteMint||[quote.inAmount,quote.outAmount,quote.otherAmountThreshold,...quote.routePlan.flatMap(r=>[r.swapInfo.inAmount,r.swapInfo.outAmount])].some(n=>BigInt(n)>U64))throw Error('SOL estimate does not match the supported indexed route.');
 const quotedAt=now();if(!Number.isSafeInteger(quotedAt)||quotedAt<1)throw Error('SOL estimate clock unavailable.');
 return {mint,side,...(payment.symbol==='USDC'?{paymentAsset:payment.symbol}:{}),input:amount,output:quote.outAmount,minimum:quote.otherAmountThreshold,slippageBps,quotedAt,expiresAt:quotedAt+15000,estimated:true,executionEnabled:false,route:scope.stage};
}
