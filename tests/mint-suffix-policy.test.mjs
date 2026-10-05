import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicKey} from '@solana/web3.js';
import {MINT_SUFFIX,OFFICIAL_MINT_SUFFIX,assertMintSuffix,assertOfficialMintSuffix,hasMintSuffix} from '../lib/vanity-suffix.ts';
const publicMint='CzvYJXb3e4KtTd2xZviV9nMUSAC1jary4wLY4cVhwgrn',officialMint='FCN2KLyUGT9EddKf8MZYjPce8CWxUid7nWpAx9ograin';
test('production suffix validators keep public grn and official grain roles separate',()=>{
 assert.equal(MINT_SUFFIX,'grn');assert.equal(OFFICIAL_MINT_SUFFIX,'grain');assertMintSuffix(publicMint);assertOfficialMintSuffix(officialMint);
 assert.throws(()=>assertMintSuffix(officialMint),/public.*grn/);assert.throws(()=>assertOfficialMintSuffix(publicMint),/Official.*grain/);
 assert.throws(()=>assertMintSuffix(publicMint.slice(0,-3)+'grN'));assert.throws(()=>assertOfficialMintSuffix(officialMint.slice(0,-5)+'graiN'));
 assert.equal(hasMintSuffix(new PublicKey(publicMint).toBytes()),true);assert.equal(hasMintSuffix(new PublicKey(officialMint).toBytes()),false);assert.equal(hasMintSuffix(new PublicKey(officialMint).toBytes(),'grain'),true);assert.equal(hasMintSuffix(new PublicKey(publicMint).toBytes(),'grain'),false);
});
