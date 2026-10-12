import test from 'node:test';
import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import {Keypair,PublicKey} from '@solana/web3.js';
import {createPrelaunchAuthorizer,createPrelaunchReplacementAuthorizer} from '../lib/monero-prelaunch-browser.mjs';
import {canonicalCreatorMessage} from '../lib/monero-creator-message.mjs';
import {creatorAuthorizationBytesV2} from '../lib/monero-creator-text-v2.mjs';
import {mintProvenanceProofMessage} from '../lib/monero-prelaunch-identity.mjs';

function fixture(mode='normal'){
 const creator=Keypair.generate(),mint=Keypair.generate(),platform=Keypair.generate(),oldHash='11'.repeat(32),newHash='22'.repeat(32),oldNonce='33'.repeat(16),newNonce='44'.repeat(16);
 const fields={mint:mint.publicKey.toBase58(),creator:creator.publicKey.toBase58(),metadataHash:newHash,nonce:newNonce},calls=[],signed=[],history=[{metadataHash:oldHash,nonce:oldNonce}];let active=history[0],reads=0;
 const intent=(patch={})=>{const value={...fields,...patch};return {...value,creatorAuthorizationVersion:2,creatorAuthorizationFormat:'grainpad-utf8-text-v2',messageHex:Buffer.from(creatorAuthorizationBytesV2(value)).toString('hex'),state:active.metadataHash===newHash?'creator-authorized':'awaiting-creator-signature'};};
 const wallet={publicKey:creator.publicKey,async signMessage(bytes){signed.push(new TextDecoder().decode(bytes));if(mode==='refused')throw Error('Creator refused');const signature=nacl.sign.detached(bytes,creator.secretKey);if(mode==='wallet-change')wallet.publicKey=platform.publicKey;return signature;},signTransaction(){assert.fail('Replacement must not request a financial signature.');}};
 const request=async body=>{
  calls.push(body.action);assert.equal(body.metadataHash,newHash);assert.equal(body.mint,fields.mint);assert.equal(body.creator,fields.creator);assert.equal(body.platformId,platform.publicKey.toBase58());assert(nacl.sign.detached.verify(mintProvenanceProofMessage(body),Buffer.from(body.mintProof,'hex'),mint.publicKey.toBytes()));
  if(body.action==='intent')throw Error('Planned immutable identity changed.');
  if(body.action==='replacement-intent'){reads++;if(mode==='blocked')throw Error('Mint already exists or publication is pending.');return intent(mode==='changed-nonce'&&reads>1?{nonce:'55'.repeat(16)}:mode==='foreign-hash'?{metadataHash:oldHash}:{});}
  if(body.action==='replacement-signature'){assert.equal(body.nonce,newNonce);assert(nacl.sign.detached.verify(canonicalCreatorMessage(intent(),fields.mint,fields.creator),Buffer.from(body.signature,'hex'),new PublicKey(body.creator).toBytes()));active={metadataHash:newHash,nonce:newNonce};history.push(active);return intent();}
  if(body.action==='check')return intent(mode==='changed-check'?{nonce:'66'.repeat(16)}:{});
  assert.fail('Unexpected browser request '+body.action);
 };
 return {mint,wallet,request,calls,signed,history,oldHash,newHash,oldNonce,newNonce,input:{network:'mainnet-beta',owner:fields.creator,mint:fields.mint,metadataHash:newHash,platformId:platform.publicKey.toBase58()}};
}

test('explicit replacement signs the exact new canonical metadata nonce, verifies persistence, and never repeats an applied approval',async()=>{
 const f=fixture(),replace=createPrelaunchReplacementAuthorizer({enabled:true,request:f.request});
 assert.deepEqual(await replace(f.input,f.wallet,f.mint),{authorized:true,nonce:f.newNonce});
 assert.deepEqual(f.calls,['replacement-intent','replacement-intent','replacement-signature','check']);assert.equal(f.signed.length,1);assert(f.signed[0].includes(f.newHash));assert(f.signed[0].includes(f.newNonce));assert(!f.signed[0].includes(f.oldHash));assert.deepEqual(f.history,[{metadataHash:f.oldHash,nonce:f.oldNonce},{metadataHash:f.newHash,nonce:f.newNonce}]);
 f.calls.length=0;await replace(f.input,f.wallet,f.mint);assert.deepEqual(f.calls,['replacement-intent','check']);assert.equal(f.signed.length,1);
});

test('ordinary authorization never silently replaces a conflicting planned identity',async()=>{
 const f=fixture();await assert.rejects(createPrelaunchAuthorizer({enabled:true,request:f.request})(f.input,f.wallet,f.mint),/immutable identity/);assert.deepEqual(f.calls,['intent']);assert.equal(f.signed.length,0);assert.equal(f.history.length,1);
});

for(const mode of ['refused','changed-nonce','foreign-hash','blocked','wallet-change'])test(`replacement refuses ${mode} without committing a new signed authorization`,async()=>{
 const f=fixture(mode);await assert.rejects(createPrelaunchReplacementAuthorizer({enabled:true,request:f.request})(f.input,f.wallet,f.mint));assert.equal(f.calls.includes('replacement-signature'),false);assert.equal(f.history.length,1);
});

test('a changed persisted replacement does not report authorization success',async()=>{
 const f=fixture('changed-check');await assert.rejects(createPrelaunchReplacementAuthorizer({enabled:true,request:f.request})(f.input,f.wallet,f.mint),/Persisted creator authorization changed/);assert.equal(f.signed.length,1);
});

test('disabled replacement and a foreign mint key never request a creator signature',async()=>{
 const f=fixture();assert.equal((await createPrelaunchReplacementAuthorizer({request:f.request})(f.input,f.wallet,f.mint)).authorized,false);await assert.rejects(createPrelaunchReplacementAuthorizer({enabled:true,request:f.request})(f.input,f.wallet,Keypair.generate()),/mint signer/);assert.equal(f.calls.length,0);assert.equal(f.signed.length,0);
});
