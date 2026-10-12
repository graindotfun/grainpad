import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,PublicKey,SystemProgram,ComputeBudgetProgram,TransactionInstruction,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {NATIVE_MINT,TOKEN_PROGRAM_ID,createAssociatedTokenAccountIdempotentInstruction,createBurnCheckedInstruction,createCloseAccountInstruction,createInitializeAccount3Instruction} from '@solana/spl-token';
import BN from 'bn.js';
import * as s from '@raydium-io/raydium-sdk-v2';
import {assertRelayPrograms} from '../lib/rpc-submissions.mjs';
import {buildLaunchInstruction,buildPlatformInstructions} from '../lib/launch-instructions.mjs';
import {feeClaimInstruction} from '../lib/fee-instructions.mjs';
import {grainpadPlatformId} from '../lib/platform-policy.mjs';
import {LIGHTHOUSE_PROGRAM} from '../lib/wallet-transaction-policy.mjs';

const key=()=>Keypair.generate().publicKey;
const owner=new PublicKey('FuAqW3zEPjVFVeE8ditPabjU5iJbF3BzE2i4djrvWQFM');
function wire(instructions,payer=owner){
 const message=new TransactionMessage({payerKey:payer,recentBlockhash:'11111111111111111111111111111111',instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:300000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}),...instructions]}).compileToV0Message();
 return Buffer.from(new VersionedTransaction(message).serialize()).toString('base64');
}

test('relay accepts every transaction shape the site builds, plus wallet-added Lighthouse assertions',()=>{
 const platform=grainpadPlatformId(),mint=key(),ata=key(),temporary=key(),zero=new BN(0);
 const launch=buildLaunchInstruction({owner,mint,platform,symbol:'SOL',name:'Test',tokenSymbol:'TEST',uri:'https://grainpad.fun/api/assets/'+'0'.repeat(64)});
 const pool=s.getPdaLaunchpadPoolId(s.LAUNCHPAD_PROGRAM,mint,NATIVE_MINT).publicKey;
 const buy=s.buyExactInInstruction(s.LAUNCHPAD_PROGRAM,owner,s.getPdaLaunchpadAuth(s.LAUNCHPAD_PROGRAM).publicKey,key(),platform,pool,ata,temporary,key(),key(),mint,NATIVE_MINT,TOKEN_PROGRAM_ID,TOKEN_PROGRAM_ID,s.getPdaPlatformVault(s.LAUNCHPAD_PROGRAM,platform,NATIVE_MINT).publicKey,s.getPdaCreatorVault(s.LAUNCHPAD_PROGRAM,owner,NATIVE_MINT).publicKey,new BN(1000),new BN(1),zero);
 const cpmmPool=key(),mintA=NATIVE_MINT,mintB=mint,vaultA=key(),vaultB=key(),userA=key(),userB=key();
 const shapes={
  platformSetup:buildPlatformInstructions(owner,platform),
  launch:[launch.instruction,new TransactionInstruction({programId:new PublicKey(LIGHTHOUSE_PROGRAM),keys:[],data:Buffer.alloc(0)})],
  curveBuy:[SystemProgram.createAccountWithSeed({fromPubkey:owner,newAccountPubkey:temporary,basePubkey:owner,seed:'a'.repeat(32),lamports:1,space:165,programId:TOKEN_PROGRAM_ID}),createInitializeAccount3Instruction(temporary,NATIVE_MINT,owner),createAssociatedTokenAccountIdempotentInstruction(owner,ata,owner,mint),buy,createCloseAccountInstruction(temporary,owner,owner)],
  curveClaims:[createAssociatedTokenAccountIdempotentInstruction(owner,ata,owner,NATIVE_MINT),feeClaimInstruction(owner,platform,'creator','SOL'),feeClaimInstruction(owner,platform,'platform','wXMR')],
  cpmmCreatorClaim:[s.makeCollectCreatorFeeInstruction(s.CREATE_CPMM_POOL_PROGRAM,owner,s.CREATE_CPMM_POOL_AUTH,cpmmPool,new PublicKey('CRRS5ieQmBrZjWhcj99JuGrT5tyuWDaGAXLXLFjbAtjQ'),vaultA,vaultB,mintA,mintB,userA,userB,TOKEN_PROGRAM_ID,TOKEN_PROGRAM_ID)],
  feeKeyClaim:[s.collectCpFeeInstruction({programId:s.LOCK_CPMM_PROGRAM,auth:s.LOCK_CPMM_AUTH,nftOwner:owner,nftMint:key(),nftAccount:key(),lockPda:key(),poolId:cpmmPool,mintLp:key(),userVaultA:userA,userVaultB:userB,poolVaultA:vaultA,poolVaultB:vaultB,mintA,mintB,lockLpVault:key(),lpFeeAmount:new BN(1)})],
  buyback:[new TransactionInstruction({programId:new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),keys:[],data:Buffer.from('grainpad:buyback:v1')}),buy,createBurnCheckedInstruction(ata,mint,owner,1n,6)],
 };
 for(const [name,instructions] of Object.entries(shapes))assert.doesNotThrow(()=>assertRelayPrograms(wire(instructions)),name);
});

test('relay refuses transactions that invoke any other program, even alongside allowed ones',()=>{
 const pumpFun=new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
 const foreign=new TransactionInstruction({programId:pumpFun,keys:[{pubkey:owner,isSigner:true,isWritable:true}],data:Buffer.from([1])});
 assert.throws(()=>assertRelayPrograms(wire([foreign])),/only forwards Grainpad/);
 assert.throws(()=>assertRelayPrograms(wire([SystemProgram.transfer({fromPubkey:owner,toPubkey:key(),lamports:1}),foreign])),/only forwards Grainpad/);
 assert.throws(()=>assertRelayPrograms('AA=='));
});
