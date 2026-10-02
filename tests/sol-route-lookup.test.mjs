import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,PublicKey,ComputeBudgetProgram,SystemProgram,TransactionInstruction} from '@solana/web3.js';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import {NATIVE_MINT,TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,getAssociatedTokenAddressSync,createAssociatedTokenAccountInstruction,createSyncNativeInstruction,createCloseAccountInstruction} from '@solana/spl-token';
import {QUOTES} from '../lib/quote-assets.mjs';
import {PLATFORM_SETTINGS} from '../lib/platform-settings.mjs';
import {clmmSlice,launchSlice,encodeDirectRouteV2,CLMM_PROGRAM_ID} from '../lib/sol-direct-route.mjs';
import {SOL_WXMR_CLMM_POOL} from '../lib/sol-route-scope.mjs';
import {assertGrainpadLookupTable,compileLookupReview,lookupAccount,packetBytes,preCreationLookupAddresses,unsignedSolLookupReview,REFUSED_THIRD_PARTY_SOL_LOOKUP,GRAINPAD_SOL_LOOKUP_TABLE} from '../lib/sol-route-lookup.mjs';
const admin=PLATFORM_SETTINGS.admin;
const clmm={configId:PublicKey.unique(),vaultA:PublicKey.unique(),vaultB:PublicKey.unique(),observationId:PublicKey.unique()};
const required=preCreationLookupAddresses(clmm);
const tableKey=Keypair.generate().publicKey.toBase58();
test('a missing, deactivated, foreign or third-party lookup table is refused',()=>{
 assert.equal(GRAINPAD_SOL_LOOKUP_TABLE,'GdrHQNhwy7veVC9evQ6YtSwrrjjkqKuHtaV4mfE1X7je');
 assert.throws(()=>assertGrainpadLookupTable({tableAddress:null,table:null}),/owner signature is required before official-token creation/);
 assert.throws(()=>assertGrainpadLookupTable({tableAddress:REFUSED_THIRD_PARTY_SOL_LOOKUP,table:lookupAccount(tableKey,required)}),/third-party/);
 assert.throws(()=>assertGrainpadLookupTable({tableAddress:tableKey,table:null}),/missing on chain/);
 assert.throws(()=>assertGrainpadLookupTable({tableAddress:tableKey,table:lookupAccount(tableKey,required,{deactivationSlot:1n})}),/deactivated/);
 assert.throws(()=>assertGrainpadLookupTable({tableAddress:tableKey,table:lookupAccount(tableKey,required,{authority:Keypair.generate().publicKey.toBase58()})}),/authority/);
 assert.throws(()=>assertGrainpadLookupTable({tableAddress:tableKey,table:lookupAccount(tableKey,required.slice(1)),required}),/missing required/);
 assert.equal(assertGrainpadLookupTable({tableAddress:tableKey,table:lookupAccount(tableKey,required),required}).active,true);
});
test('the unsigned lookup review names every pre-creation address and is not submitted',()=>{
 const review=unsignedSolLookupReview({recentSlot:452_300_000,addresses:required});
 assert.equal(review.submitted,false);assert.equal(review.liveSend,false);assert.equal(review.signatureRequiredBeforeOfficialCreation,true);
 assert.equal(review.authority,admin);assert.deepEqual(review.addresses,required);
 assert.equal(review.rebuildIfSlotChanges,true);
 const compiled=compileLookupReview(review,{blockhash:'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi'});
 assert.equal(compiled.signatures,1);assert.ok(compiled.bytes<=1232,`lookup review is ${compiled.bytes} bytes`);
 const again=unsignedSolLookupReview({recentSlot:452_300_001,addresses:required});
 assert.notEqual(again.tableAddress,review.tableAddress);
});
function routePacket(fresh){
 const owner=new PublicKey(admin),mint=Keypair.generate().publicKey,program=TOKEN_2022_PROGRAM_ID;
 const baseAta=getAssociatedTokenAddressSync(mint,owner,false,program),wsolAta=getAssociatedTokenAddressSync(NATIVE_MINT,owner),quoteAta=getAssociatedTokenAddressSync(new PublicKey(QUOTES.wXMR.mint),owner);
 const ticks=Array.from({length:6},()=>PublicKey.unique());
 const clmmKeys=clmmSlice({owner,config:clmm.configId,pool:SOL_WXMR_CLMM_POOL,inputAta:wsolAta,outputAta:quoteAta,inputVault:clmm.vaultA,outputVault:clmm.vaultB,observation:clmm.observationId,ticks,bitmap:PublicKey.unique()});
 const pool=Keypair.generate().publicKey,vaultA=Keypair.generate().publicKey,vaultB=Keypair.generate().publicKey;
 const poolKeys=launchSlice({owner,platformId:PublicKey.unique(),pool:{poolId:pool,configId:new PublicKey(QUOTES.wXMR.config)},baseAta,quoteAta,vaultA,vaultB,mint,tokenProgram:program,creator:admin});
 const header=[
  {pubkey:owner,isSigner:true,isWritable:false},{pubkey:wsolAta,isSigner:false,isWritable:true},{pubkey:baseAta,isSigner:false,isWritable:true},
  {pubkey:NATIVE_MINT,isSigner:false,isWritable:false},{pubkey:mint,isSigner:false,isWritable:false},
  {pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},{pubkey:program,isSigner:false,isWritable:false},
  {pubkey:new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'),isSigner:false,isWritable:false},{pubkey:new PublicKey('D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf'),isSigner:false,isWritable:false},{pubkey:new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'),isSigner:false,isWritable:false},
 ];
 const swap=new TransactionInstruction({programId:new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'),keys:[...header,...clmmKeys,...poolKeys],data:encodeDirectRouteV2({amountIn:1000000n,amountOut:20n,slippageBps:50,steps:[{tag:26,input:0,output:1},{tag:81,extra:8,input:1,output:2}]})});
 const setup=[createAssociatedTokenAccountInstruction(owner,wsolAta,owner,NATIVE_MINT),createAssociatedTokenAccountInstruction(owner,quoteAta,owner,new PublicKey(QUOTES.wXMR.mint))];
 if(fresh)setup.unshift(createAssociatedTokenAccountInstruction(owner,baseAta,owner,mint,program));
 setup.push(SystemProgram.transfer({fromPubkey:owner,toPubkey:wsolAta,lamports:1000000}),createSyncNativeInstruction(wsolAta));
 const tokenAccounts=[mint,pool,vaultA,vaultB];
 const table=lookupAccount(tableKey,[...required,...tokenAccounts.map(String)]);
 const instructions=[ComputeBudgetProgram.setComputeUnitLimit({units:600000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}),...setup,swap,createCloseAccountInstruction(wsolAta,owner,owner)];
 return {bytes:packetBytes(instructions,{payer:owner,blockhash:'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi',tables:[table]}),staticOnly:()=>packetBytes(instructions,{payer:owner,blockhash:'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi'})};
}
test('a Grainpad table keeps a fresh-account and existing-account route inside the packet limit',async()=>{
 const fresh=routePacket(true),existing=routePacket(false);
 assert.ok(fresh.bytes<=1232,`fresh packet ${fresh.bytes}`);
 assert.ok(existing.bytes<=1232,`existing packet ${existing.bytes}`);
 assert.throws(()=>fresh.staticOnly(),/encoding overruns|too large|VersionedTransaction/i);
 const {temporaryWsolAddress,temporaryWsolCreate}=await import('../lib/sol-temporary-wsol.mjs');
 const {buildSolBalanceGuards}=await import('../lib/sol-token-net-guard.mjs');
 const owner=new PublicKey(admin),mint=Keypair.generate().publicKey,program=TOKEN_2022_PROGRAM_ID;
 const canonical=getAssociatedTokenAddressSync(NATIVE_MINT,owner),temporary=await temporaryWsolAddress(owner);
 const baseAta=getAssociatedTokenAddressSync(mint,owner,false,program),quoteAta=getAssociatedTokenAddressSync(new PublicKey(QUOTES.wXMR.mint),owner);
 const ticks=Array.from({length:6},()=>PublicKey.unique());
 const bitmap=sdk.getPdaExBitmapAccount(new PublicKey(CLMM_PROGRAM_ID),new PublicKey(SOL_WXMR_CLMM_POOL)).publicKey;
 const clmmKeys=clmmSlice({owner,config:clmm.configId,pool:SOL_WXMR_CLMM_POOL,inputAta:temporary,outputAta:quoteAta,inputVault:clmm.vaultA,outputVault:clmm.vaultB,observation:clmm.observationId,ticks,bitmap});
 const pool=Keypair.generate().publicKey,vaultA=Keypair.generate().publicKey,vaultB=Keypair.generate().publicKey;
 const poolKeys=launchSlice({owner,platformId:PublicKey.unique(),pool:{poolId:pool,configId:new PublicKey(QUOTES.wXMR.config)},baseAta,quoteAta,vaultA,vaultB,mint,tokenProgram:program,creator:admin});
 const header=[
  {pubkey:owner,isSigner:true,isWritable:false},{pubkey:temporary,isSigner:false,isWritable:true},{pubkey:baseAta,isSigner:false,isWritable:true},
  {pubkey:NATIVE_MINT,isSigner:false,isWritable:false},{pubkey:mint,isSigner:false,isWritable:false},
  {pubkey:TOKEN_PROGRAM_ID,isSigner:false,isWritable:false},{pubkey:program,isSigner:false,isWritable:false},
  {pubkey:new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'),isSigner:false,isWritable:false},{pubkey:new PublicKey('D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf'),isSigner:false,isWritable:false},{pubkey:new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'),isSigner:false,isWritable:false},
 ];
 const swap=new TransactionInstruction({programId:new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'),keys:[...header,...clmmKeys,...poolKeys],data:encodeDirectRouteV2({amountIn:1000000n,amountOut:20n,slippageBps:50,steps:[{tag:26,input:0,output:1},{tag:81,extra:8,input:1,output:2}]})});
 const guards=buildSolBalanceGuards({side:'buy',baseAccount:baseAta,wsolAccount:temporary,baseline:'0',amount:'1000000',minimum:'20',baseExists:false,preservedWsol:{account:canonical.toBase58(),amount:'5'}});
 const setup=[...temporaryWsolCreate({owner,address:temporary,rentLamports:2039280}),createAssociatedTokenAccountInstruction(owner,quoteAta,owner,new PublicKey(QUOTES.wXMR.mint)),createAssociatedTokenAccountInstruction(owner,baseAta,owner,mint,program),SystemProgram.transfer({fromPubkey:owner,toPubkey:temporary,lamports:1000000}),createSyncNativeInstruction(temporary)];
 const close=createCloseAccountInstruction(temporary,owner,owner);
 assert.equal(String(close.keys[0].pubkey),temporary.toBase58());
 assert.notEqual(String(close.keys[0].pubkey),canonical.toBase58());
 const table=lookupAccount(tableKey,[...required,String(mint),String(pool),String(vaultA),String(vaultB)]);
 const bytes=packetBytes([ComputeBudgetProgram.setComputeUnitLimit({units:600000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}),...setup,...guards.pre,swap,...guards.post,close],{payer:owner,blockhash:'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi',tables:[table]});
 assert.ok(bytes<=1232,`preserved WSOL packet ${bytes}`);
 assert.equal(guards.pre.some(ix=>String(ix.keys[0].pubkey)===canonical.toBase58()),true);
 assert.equal(guards.post.some(ix=>String(ix.keys[0].pubkey)===canonical.toBase58()),true);
});
