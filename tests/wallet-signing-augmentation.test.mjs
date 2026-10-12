import test from 'node:test';
import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import {Keypair,PublicKey,TransactionInstruction,TransactionMessage,VersionedTransaction,SystemProgram,ComputeBudgetProgram} from '@solana/web3.js';
import {signWalletFirst} from '../lib/wallet-signing.mjs';
import {LIGHTHOUSE_PROGRAM,COMPUTE_PROGRAM} from '../lib/wallet-transaction-policy.mjs';

// Disposable deterministic keys, no wallet/provider/network or valid chain blockhash.
const owner=Keypair.fromSeed(new Uint8Array(32).fill(11)),mint=Keypair.fromSeed(new Uint8Array(32).fill(12)),other=Keypair.fromSeed(new Uint8Array(32).fill(13));
const readonly=Keypair.fromSeed(new Uint8Array(32).fill(14)).publicKey;
function originalInstructions(){return [ComputeBudgetProgram.setComputeUnitLimit({units:200000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}),new TransactionInstruction({programId:SystemProgram.programId,keys:[{pubkey:owner.publicKey,isSigner:true,isWritable:true},{pubkey:mint.publicKey,isSigner:true,isWritable:true},{pubkey:readonly,isSigner:false,isWritable:false}],data:Buffer.from([1,2,3])})];}
const guard=()=>new TransactionInstruction({programId:new PublicKey(LIGHTHOUSE_PROGRAM),keys:[{pubkey:readonly,isSigner:false,isWritable:false}],data:Buffer.from([7])});
const heap=()=>new TransactionInstruction({programId:new PublicKey(COMPUTE_PROGRAM),keys:[],data:Buffer.from([1,0,128,0,0])});
const compile=(instructions,blockhash=String(PublicKey.default),payer=owner.publicKey)=>new VersionedTransaction(new TransactionMessage({payerKey:payer,recentBlockhash:blockhash,instructions}).compileToV0Message());
function fixture(change=instructions=>[heap(),...instructions,guard()]){
 const transaction=compile(originalInstructions()),events=[];
 const wallet={publicKey:owner.publicKey,async signTransaction(tx){events.push('wallet');assert.ok(tx.signatures.every(s=>s.every(b=>b===0)));const instructions=TransactionMessage.decompile(tx.message).instructions;const returned=change(instructions);const signed=Array.isArray(returned)?compile(returned):returned;signed.sign([owner]);return signed;}};
 const cosign=tx=>{events.push('mint');assert.ok(nacl.sign.detached.verify(tx.message.serialize(),tx.signatures[0],owner.publicKey.toBytes()));tx.sign([mint]);};
 return {events,transaction,wallet,input:{transaction,wallet,owner:String(owner.publicKey),additionalSignerPublicKeys:[mint.publicKey],cosign}};
}
test('permitted guard/heap additions bind both real disposable signatures to returned bytes',async()=>{const f=fixture();const original=Buffer.from(f.transaction.message.serialize());const signed=await signWalletFirst(f.input);assert.notDeepEqual(Buffer.from(signed.message.serialize()),original);assert.deepEqual(f.events,['wallet','mint']);assert.ok(nacl.sign.detached.verify(signed.message.serialize(),signed.signatures[0],owner.publicKey.toBytes()));assert.ok(nacl.sign.detached.verify(signed.message.serialize(),signed.signatures[1],mint.publicKey.toBytes()));});
test('in-place permitted wallet mutation is compared with the immutable original review',async()=>{const f=fixture();f.wallet.signTransaction=async tx=>{f.events.push('wallet');tx.message=compile([...originalInstructions(),guard()]).message;tx.sign([owner]);return tx;};await signWalletFirst(f.input);assert.deepEqual(f.events,['wallet','mint']);});
test('transfer, signer, privilege, original instruction, compute replacement and blockhash mutations never reach mint',async()=>{
 const mutations=[
  ix=>[...ix,SystemProgram.transfer({fromPubkey:owner.publicKey,toPubkey:other.publicKey,lamports:1})],
  ix=>[...ix,new TransactionInstruction({programId:new PublicKey(LIGHTHOUSE_PROGRAM),keys:[{pubkey:other.publicKey,isSigner:true,isWritable:false}],data:Buffer.from([7])})],
  ix=>[...ix,new TransactionInstruction({programId:new PublicKey(LIGHTHOUSE_PROGRAM),keys:[{pubkey:readonly,isSigner:false,isWritable:true}],data:Buffer.from([7])})],
  ix=>ix.slice(0,-1),
  ix=>[ComputeBudgetProgram.setComputeUnitLimit({units:300000}),...ix.slice(1)],
  ix=>compile([...ix,guard()],String(other.publicKey)),
  ix=>compile(ix,String(PublicKey.default),mint.publicKey),
 ];
 for(const mutate of mutations){const f=fixture(mutate);await assert.rejects(signWalletFirst(f.input),error=>{assert.equal(error.code,'WALLET_STRUCTURE_REJECTED');assert.equal(error.decodedDiff.valid,false);assert.ok(error.decodedDiff.reasons.length);return /Nothing was sent/.test(error.message);});assert.deepEqual(f.events,['wallet']);}
});
test('in-place forbidden wallet mutation cannot replace the frozen original instruction view',async()=>{const f=fixture(ix=>ix);f.wallet.signTransaction=async tx=>{f.events.push('wallet');tx.message=compile([...originalInstructions(),SystemProgram.transfer({fromPubkey:owner.publicKey,toPubkey:other.publicKey,lamports:1})]).message;tx.sign([owner]);return tx;};await assert.rejects(signWalletFirst(f.input),/unapproved program/);assert.deepEqual(f.events,['wallet']);});
test('owner signature over original bytes is invalid after a permitted guard and blocks mint',async()=>{const f=fixture();f.wallet.signTransaction=async()=>{f.events.push('wallet');const returned=compile([...originalInstructions(),guard()]);returned.signatures[0]=nacl.sign.detached(f.transaction.message.serialize(),owner.secretKey);return returned;};await assert.rejects(signWalletFirst(f.input),error=>error.code==='WALLET_OWNER_SIGNATURE_INVALID');assert.deepEqual(f.events,['wallet']);});
test('wallet supplying mint signature is rejected before local mint callback',async()=>{const f=fixture();const request=f.wallet.signTransaction;f.wallet.signTransaction=async tx=>{const returned=await request(tx);returned.sign([mint]);return returned;};await assert.rejects(signWalletFirst(f.input),/unexpected additional signature/);assert.deepEqual(f.events,['wallet']);});
test('cosign freezes exact accepted bytes even against another permitted augmentation',async()=>{const f=fixture();f.input.cosign=tx=>{f.events.push('mint');tx.message=compile([...TransactionMessage.decompile(tx.message).instructions,guard()]).message;tx.sign([owner,mint]);};await assert.rejects(signWalletFirst(f.input),/different transaction/);assert.deepEqual(f.events,['wallet','mint']);});
test('cosign cannot change owner signature or leave a missing or invalid mint signature',async()=>{for(const mutate of [tx=>tx.signatures[0].fill(1),tx=>{},tx=>tx.signatures[1].fill(1)]){const f=fixture();f.input.cosign=tx=>{f.events.push('mint');mutate(tx);};await assert.rejects(signWalletFirst(f.input),/owner signature|valid required signature/);assert.deepEqual(f.events,['wallet','mint']);}});
