import test from 'node:test';
import assert from 'node:assert/strict';
import {createWalletFirstSigner,signWalletFirst} from '../lib/wallet-signing.mjs';

// Synthetic byte markers only: these are not Ed25519 signatures or keypairs.
const publicKey=(name,marker)=>({toBase58:()=>name,toBytes:()=>new Uint8Array(32).fill(marker)});
const owner=publicKey('simulation-owner',1),mint=publicKey('simulation-mint',2),other=publicKey('simulation-other',3);
const markerSignature=key=>new Uint8Array(64).fill(key.toBytes()[0]);
function fixture({single=false}={}){
 const events=[];
 const keys=single?[owner]:[owner,mint];
 const messageBytes=new Uint8Array([11,22,33]);
 const transaction={message:{header:{numRequiredSignatures:keys.length},staticAccountKeys:keys,serialize:()=>Uint8Array.from(messageBytes)},signatures:keys.map(()=>new Uint8Array(64))};
 const wallet={publicKey:owner,async signTransaction(tx){events.push('wallet');assert.ok(tx.signatures.every(signature=>signature.every(value=>value===0)));tx.signatures[0]=markerSignature(owner);return tx;}};
 const verify=(message,signature,key)=>{events.push(`verify:${key[0]}`);return message.every((value,index)=>value===[11,22,33][index])&&signature.every(value=>value===key[0]);};
 const cosign=async tx=>{events.push('mint');assert.deepEqual(tx.signatures[0],markerSignature(owner));tx.signatures[1]=markerSignature(mint);};
 return {events,transaction,wallet,messageBytes,verify,input:{transaction,wallet,owner:owner.toBase58(),additionalSignerPublicKeys:single?[]:[mint],...(single?{}:{cosign})}};
}

test('Phantom receives an unsigned transaction; verified owner signature precedes mint signature',async()=>{
 const f=fixture();const result=await createWalletFirstSigner(f.verify)(f.input);
 assert.equal(result,f.transaction);assert.deepEqual(f.events,['wallet','verify:1','mint','verify:1','verify:2']);
});

test('one-signer transaction needs no mint callback',async()=>{
 const f=fixture({single:true});await createWalletFirstSigner(f.verify)(f.input);
 assert.deepEqual(f.events,['wallet','verify:1','verify:1']);
});

test('existing owner or mint signature is rejected before a wallet request',async()=>{
 for(const slot of [0,1]){const f=fixture();f.transaction.signatures[slot]=markerSignature(mint);await assert.rejects(createWalletFirstSigner(f.verify)(f.input),/already partially signed/);assert.deepEqual(f.events,[]);}
});

test('wrong payer, missing signer, extra signer, duplicate signer and malformed slots fail before wallet request',async()=>{
 for(const mutate of [
  f=>f.transaction.message.staticAccountKeys.reverse(),
  f=>f.input.additionalSignerPublicKeys=[],
  f=>f.input.additionalSignerPublicKeys=[mint,other],
  f=>f.input.additionalSignerPublicKeys=[owner],
  f=>f.transaction.signatures.pop(),
  f=>f.transaction.signatures[1]=new Uint8Array(63),
  f=>f.transaction.message.header.numRequiredSignatures=0,
 ]){const f=fixture();mutate(f);await assert.rejects(createWalletFirstSigner(f.verify)(f.input),/signers|fee payer|signature slots|signer layout/);assert.deepEqual(f.events,[]);}
});

test('missing mint callback and unnecessary one-signer callback fail before wallet request',async()=>{
 const f=fixture();delete f.input.cosign;await assert.rejects(createWalletFirstSigner(f.verify)(f.input),/callback/);assert.deepEqual(f.events,[]);
 const g=fixture({single:true});g.input.cosign=()=>{};await assert.rejects(createWalletFirstSigner(g.verify)(g.input),/callback/);assert.deepEqual(g.events,[]);
});

test('wrong connected wallet fails before wallet request',async()=>{
 const f=fixture();f.wallet.publicKey=other;await assert.rejects(createWalletFirstSigner(f.verify)(f.input),/Wallet changed/);assert.deepEqual(f.events,[]);
});

test('wallet rejection never invokes mint signing',async()=>{
 const f=fixture();f.wallet.signTransaction=async()=>{f.events.push('wallet');throw Error('User rejected');};
 await assert.rejects(createWalletFirstSigner(f.verify)(f.input),/User rejected/);assert.deepEqual(f.events,['wallet']);
});

test('missing or invalid owner signature never invokes mint signing',async()=>{
 for(const signature of [new Uint8Array(64),markerSignature(other)]){const f=fixture();f.wallet.signTransaction=async tx=>{f.events.push('wallet');tx.signatures[0]=signature;return tx;};await assert.rejects(createWalletFirstSigner(f.verify)(f.input),/valid owner signature/);assert.ok(!f.events.includes('mint'));}
});

test('wallet message mutation or account switch stops before mint signing',async()=>{
 for(const mutate of [f=>f.messageBytes[0]=99,f=>f.wallet.publicKey=other]){const f=fixture();const original=f.wallet.signTransaction;f.wallet.signTransaction=async tx=>{const signed=await original(tx);mutate(f);return signed;};await assert.rejects(createWalletFirstSigner(f.verify)(f.input),/different transaction|Wallet changed/);assert.ok(!f.events.includes('mint'));}
});

test('unexpected mint signature returned by wallet is rejected before mint callback',async()=>{
 const f=fixture();const original=f.wallet.signTransaction;f.wallet.signTransaction=async tx=>{const signed=await original(tx);signed.signatures[1]=markerSignature(mint);return signed;};
 await assert.rejects(createWalletFirstSigner(f.verify)(f.input),/unexpected additional signature/);assert.ok(!f.events.includes('mint'));
});

test('mint cannot change the message or replace the verified owner signature',async()=>{
 for(const mutate of [f=>f.messageBytes[0]=99,f=>f.transaction.signatures[0]=markerSignature(other)]){const f=fixture();f.input.cosign=async()=>{f.events.push('mint');mutate(f);};await assert.rejects(createWalletFirstSigner(f.verify)(f.input),/different transaction|changed the owner signature/);}
});

test('missing, invalid or malformed mint signature cannot leave helper',async()=>{
 for(const signature of [new Uint8Array(64),markerSignature(other),new Uint8Array(63)]){const f=fixture();f.input.cosign=async tx=>{f.events.push('mint');tx.signatures[1]=signature;};await assert.rejects(createWalletFirstSigner(f.verify)(f.input),/valid required signature|signature slots/);assert.deepEqual(f.events.slice(0,3),['wallet','verify:1','mint']);}
});

test('wallet switch during asynchronous mint callback is rejected',async()=>{
 const f=fixture();f.input.cosign=async tx=>{tx.signatures[1]=markerSignature(mint);f.wallet.publicKey=other;};await assert.rejects(createWalletFirstSigner(f.verify)(f.input),/Wallet changed/);
});

test('production export uses actual verification and rejects synthetic signature markers',async()=>{
 const f=fixture();await assert.rejects(signWalletFirst({...f.input,verifySignature:()=>true}),/valid owner signature/);assert.deepEqual(f.events,['wallet']);
});

test('test factory requires an explicitly supplied verifier',()=>{
 assert.throws(()=>createWalletFirstSigner(),/verifier is required/);
});
