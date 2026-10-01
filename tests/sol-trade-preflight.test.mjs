import test from 'node:test';import assert from 'node:assert/strict';
import {Keypair,PublicKey,TransactionMessage,VersionedTransaction,ComputeBudgetProgram,SystemProgram} from '@solana/web3.js';
import {createSolTradeIntent} from '../lib/sol-trade-intent.mjs';
import {preflightSolTrade,classifySolRouteFailure} from '../lib/sol-trade-preflight.mjs';
import {signSolTrade} from '../lib/sol-trade-client.mjs';
import {tokenBalanceEqualityGuard,netTokenMinimumGuard} from '../lib/sol-token-net-guard.mjs';
import {decodeReviewedTransaction} from '../lib/wallet-transaction-policy.mjs';
import {resolveTransactionAddresses} from '../lib/transaction-addresses.mjs';
const JUPITER='JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const payer=Keypair.fromSeed(new Uint8Array(32).fill(7)),base=new PublicKey(new Uint8Array(32).fill(11)),wsol=new PublicKey(new Uint8Array(32).fill(12));
function layout(){
 const route={programId:new PublicKey(JUPITER),keys:[{pubkey:payer.publicKey,isSigner:true,isWritable:true}],data:Buffer.from('bb64facc31c4af14','hex')};
 const tx=new VersionedTransaction(new TransactionMessage({payerKey:payer.publicKey,recentBlockhash:'11111111111111111111111111111111',instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:200000}),SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:wsol,lamports:1000}),tokenBalanceEqualityGuard(String(base),'5'),route,netTokenMinimumGuard(String(base),'9'),tokenBalanceEqualityGuard(String(wsol),'0')]}).compileToV0Message());
 return tx;
}
async function stored(now=1_000_000){
 const objects=new Map(),storage={put:async(k,v)=>{objects.set(k,v);return true;},get:async k=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null,objects};
 const tx=layout(),context=await resolveTransactionAddresses({},tx,{minContextSlot:5});
 const review=await createSolTradeIntent(storage,{owner:String(payer.publicKey),mint:'mint',side:'buy',amount:'1000',minimum:'4',maxTotalDebitLamports:4000000,maxOverheadLamports:3000000,minContextSlot:5,lastValidBlockHeight:500,addressFingerprint:'[]',transactionBase64:Buffer.from(tx.serialize()).toString('base64'),baseAccount:String(base),wsolAccount:String(wsol),intermediateBalances:[],reviewed:decodeReviewedTransaction(tx,context)},{now,id:'c'.repeat(32)});
 return {storage,review,tx};
}
function chain({height=400,err=null,slot=9,onSimulate=()=>{}}={}){
 return {calls:[],getBlockHeight:async function(c){this.calls.push(['getBlockHeight',c]);return height;},_rpcRequest:async function(method,params){this.calls.push([method,params]);onSimulate(params);return {result:{context:{slot},value:{err,unitsConsumed:1234,logs:[]}}};}};
}
test('passing preflight re-simulates the exact stored bytes without signature or blockhash replacement',async()=>{
 const {storage,review}=await stored(),connection=chain({onSimulate:params=>{assert.equal(params[0],review.transactionBase64);assert.deepEqual(params[1],{encoding:'base64',commitment:'confirmed',sigVerify:false,minContextSlot:5});}});
 const result=await preflightSolTrade(storage,review.id,connection,{clock:()=>review.createdAt+1000});
 assert.deepEqual(result,{id:review.id,ok:true,slot:9,blocksRemaining:100,unitsConsumed:1234});
 assert.equal(connection.calls.filter(c=>c[0]==='simulateTransaction').length,1);
});
test('a failing guard is classified by its reviewed position and the wallet is never opened',async()=>{
 const {storage,review}=await stored(),connection=chain({err:{InstructionError:[4,{Custom:6001}]}});
 const result=await preflightSolTrade(storage,review.id,connection,{clock:()=>review.createdAt+1000});
 assert.equal(result.ok,false);assert.equal(result.reason,'simulation-failed');assert.equal(result.failure.role,'net-minimum');assert.equal(result.failure.account,String(base));assert.match(result.message,/below your reviewed minimum/);
 let prompts=0;const live=(await stored(Date.now())).review;
 await assert.rejects(signSolTrade({review:live,confirmReviewed:true,connection:{},preflight:async()=>result,wallet:{publicKey:payer.publicKey,signTransaction:async()=>{prompts++;throw Error('must not prompt');}}}),/before opening your wallet; nothing was signed/);
 assert.equal(prompts,0);
});
test('route, guard, funding and account failures map to their reviewed instruction roles',async()=>{
 const {review}=await stored(),at=(index,detail)=>classifySolRouteFailure(review,{InstructionError:[index,detail]});
 assert.equal(at(2,{Custom:6001}).role,'balance-before-route');assert.equal(at(5,{Custom:6001}).role,'balance-after-route');assert.match(at(5,{Custom:6001}).message,/temporary SOL account/);
 assert.equal(at(3,{Custom:6001}).role,'route-slippage');assert.equal(at(3,{Custom:6024}).role,'route');
 assert.equal(at(1,{Custom:1}).role,'sol-funding');assert.equal(at(0,'InvalidInstructionData').role,'compute-budget');assert.equal(at(40,{Custom:1}).role,'unknown');
 assert.equal(classifySolRouteFailure(review,'BlockhashNotFound').role,'blockhash');assert.equal(classifySolRouteFailure(review,{InsufficientFundsForRent:{account_index:3}}).role,'payer-funds');
});
test('expiring blockhash or review closes before any simulation',async()=>{
 const {storage,review}=await stored();
 const nearHeight=chain({height:480});
 const blocks=await preflightSolTrade(storage,review.id,nearHeight,{clock:()=>review.createdAt+1000});
 assert.equal(blocks.reason,'blockhash-expiring');assert.equal(blocks.blocksRemaining,20);assert.equal(nearHeight.calls.some(c=>c[0]==='simulateTransaction'),false);
 const late=chain();const review2=await preflightSolTrade(storage,review.id,late,{clock:()=>review.expiresAt-5000});
 assert.equal(review2.reason,'review-expiring');assert.equal(late.calls.length,0);
 await assert.rejects(preflightSolTrade(storage,review.id,chain(),{clock:()=>review.expiresAt}),/expired/);
});
test('signed or altered stored reviews are refused instead of re-simulated',async()=>{
 const {storage,review}=await stored(),key='sol-trades/v1/'+review.id;
 storage.objects.set(key,JSON.stringify({...review,signedMessageHash:'ab'}));
 await assert.rejects(preflightSolTrade(storage,review.id,chain(),{clock:()=>review.createdAt+1}),/already has a signed transaction/);
 const other=Keypair.generate(),tx=new VersionedTransaction(new TransactionMessage({payerKey:other.publicKey,recentBlockhash:'11111111111111111111111111111111',instructions:[]}).compileToV0Message());
 storage.objects.set(key,JSON.stringify({...review,transactionBase64:Buffer.from(tx.serialize()).toString('base64')}));
 await assert.rejects(preflightSolTrade(storage,review.id,chain(),{clock:()=>review.createdAt+1}),/do not match/);
 await assert.rejects(preflightSolTrade(storage,'d'.repeat(32),chain(),{clock:()=>review.createdAt+1}),/missing/);
});
test('provider simulation failures are not reported as a passing check',async()=>{
 const {storage,review}=await stored(),connection={getBlockHeight:async()=>400,_rpcRequest:async()=>({error:{code:-32005,message:'busy'}})};
 await assert.rejects(preflightSolTrade(storage,review.id,connection,{clock:()=>review.createdAt+1}),/simulation unavailable/);
 const stale={getBlockHeight:async()=>400,_rpcRequest:async()=>({result:{context:{slot:4},value:{err:null}}})};
 await assert.rejects(preflightSolTrade(storage,review.id,stale,{clock:()=>review.createdAt+1}),/simulation unavailable/);
});
test('a wallet refusal after a passing preflight reports the verified slot and sends nothing',async()=>{
 const {review}=await stored(Date.now()),oldFetch=globalThis.fetch;let requests=0;globalThis.fetch=async()=>{requests++;throw Error('must not send');};
 try{await assert.rejects(signSolTrade({review,confirmReviewed:true,connection:{},preflight:async r=>({id:r.id,ok:true,slot:77}),wallet:{publicKey:payer.publicKey,signTransaction:async()=>{throw Error('Request blocked');}}}),/Wallet did not sign: Request blocked\. .*slot 77.*Nothing was signed/);assert.equal(requests,0);}finally{globalThis.fetch=oldFetch;}
});
