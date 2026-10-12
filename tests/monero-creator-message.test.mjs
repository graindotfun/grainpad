import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicKey} from '@solana/web3.js';
import {canonicalCreatorMessage} from '../lib/monero-creator-message.mjs';
import {signedBytes} from '../lib/monero-record.mjs';
function fixture(){const mint=Buffer.alloc(32,1),creator=Buffer.alloc(32,2),metadataHash=Buffer.alloc(32,3),nonce=Buffer.alloc(16,4);return {mint:new PublicKey(mint).toBase58(),creator:new PublicKey(creator).toBase58(),metadataHash:metadataHash.toString('hex'),nonce:nonce.toString('hex'),messageHex:signedBytes({mint,creator,metadataHash,nonce,version:1,flags:0}).toString('hex')};}
test('browser derivation matches server domain/layout byte for byte',()=>{const i=fixture();assert.equal(Buffer.from(canonicalCreatorMessage(i,i.mint,i.creator)).toString('hex'),i.messageHex);});
for(const [name,mutate] of Object.entries({domain:i=>i.messageHex='00'+i.messageHex.slice(2),mint:i=>i.mint=new PublicKey(Buffer.alloc(32,9)).toBase58(),creator:i=>i.creator=new PublicKey(Buffer.alloc(32,9)).toBase58(),metadata:i=>i.metadataHash='00'.repeat(32),nonce:i=>i.nonce='00'.repeat(16),version:i=>{const b=Buffer.from(i.messageHex,'hex');b[Buffer.from('grainpad.monero-record.v1\0').length+4]=2;i.messageHex=b.toString('hex');},flags:i=>i.messageHex=i.messageHex.slice(0,-2)+'01',trailing:i=>i.messageHex+='00',uppercase:i=>i.messageHex=i.messageHex.toUpperCase(),short:i=>i.messageHex='ab'}))test('refuse message substitution '+name,()=>{const i=fixture(),mint=i.mint,creator=i.creator;mutate(i);assert.throws(()=>canonicalCreatorMessage(i,mint,creator));});
