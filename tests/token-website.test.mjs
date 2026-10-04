import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair} from '@solana/web3.js';
import {canonicalTokenWebsite,assertCanonicalTokenWebsite} from '../lib/token-website.mjs';
import {buildMetadataPublication} from '../lib/metadata-publication.mjs';
import {metadataPayload} from '../lib/metadata-shared.ts';
import {reservedIdentity} from '../lib/launch-identity.mjs';
import {identityPolicy} from '../lib/site-config.ts';

const mint='CzvYJXb3e4KtTd2xZviV9nMUSAC1jary4wLY4cVhwgrn';
const website=`https://grainpad.fun/token/${mint}`;
const bytes=new Uint8Array([1,2,3]);
const draft={name:'Grain Inu',symbol:'GRAINU',description:'Rehearsal',imageType:'image/png',mint};

test('normal and GRAINU publications use the actual mint on the public domain, on every storage profile and host',async()=>{
 for(const symbol of ['SEED','GRAINU'])for(const profile of ['http-mirror-v1','ipfs-raw-v1'])for(const origin of ['https://grainpad.fun','https://staging.example','https://grainpad.example.workers.dev']){
  const publication=await buildMetadataPublication({...draft,symbol},bytes,origin,profile);
  assert.equal(assertCanonicalTokenWebsite(publication.metadata,mint),website);
  assert.equal(publication.metadata.website,website);
  assert.equal(publication.metadata.external_url,website);
  assert.equal(publication.metadata.extensions.website,website);
  assert.doesNotMatch(JSON.stringify(publication.metadata),/staging\.example|workers\.dev/);
  assert.doesNotMatch(publication.uri,/staging\.example|workers\.dev/);
 }
});
test('the publisher refuses arbitrary websites and missing or malformed mints',async()=>{
 for(const value of ['https://project.example/','https://grainpad.fun/','https://grainpad.fun/token/'+Keypair.generate().publicKey,'https://grainpad.example.workers.dev/token/'+mint])
  await assert.rejects(buildMetadataPublication({...draft,website:value},bytes,'https://grainpad.fun'),/cannot be overridden/);
 for(const value of [undefined,'','not-a-mint',mint+'/other'])assert.throws(()=>canonicalTokenWebsite(value),/mint/);
 await assert.rejects(buildMetadataPublication({...draft,mint:undefined},bytes,'https://grainpad.fun'),/mint/);
});
test('metadata signature bytes bind the mint and relay checks reject a different mint or any URL representation',async()=>{
 const metadata=(await buildMetadataPublication(draft,bytes,'https://grainpad.fun')).metadata;
 const other=Keypair.generate().publicKey.toBase58();
 const signed={...draft,imageBase64:'AQID',owner:other,expires:1};
 assert.notEqual(metadataPayload(signed),metadataPayload({...signed,mint:other}));
 assert.throws(()=>assertCanonicalTokenWebsite(metadata,other),/actual mint/);
 for(const patch of [{website:''},{external_url:'https://evil.example/'},{extensions:{website:'https://evil.example/'}},{grainpad:{mint:other}}])
  assert.throws(()=>assertCanonicalTokenWebsite({...metadata,...patch},mint),/actual mint/);
});
test('brand reservation permits only a mint-bound token page and still rejects the official name, artwork and profile',()=>{
 const policy=identityPolicy(Keypair.generate().publicKey.toBase58());
 const ordinary={name:'Seed Cat',symbol:'SEED',mint,website};
 assert.equal(reservedIdentity(ordinary,policy),null);
 assert.match(reservedIdentity({...ordinary,name:'Grainpad'},policy),/reserved/);
 assert.match(reservedIdentity({...ordinary,mint:undefined},policy),/own website/);
 assert.match(reservedIdentity({...ordinary,website:'https://grainpad.fun/'},policy),/own website/);
 assert.match(reservedIdentity({...ordinary,website:'https://grainpad.fun/token/'+Keypair.generate().publicKey},policy),/own website/);
});

test('official GRAIN uses the owner-approved home when the publication declares the relaunch buy',async()=>{
 const official='7CHbQ7XMGV7ohKD54pNYcKX21JZcEqGvBPS9hZcRNgrn';
 const publication=await buildMetadataPublication({...draft,mint:official,name:'Grainpad',symbol:'GRAIN',declaredCreatorBuy:{quote:'wXMR',amountIn:'262000000000',minOut:'1'},quoteAsset:'wXMR'},bytes,'https://preview.example');
 assert.equal(assertCanonicalTokenWebsite(publication.metadata,official),'https://grainpad.fun');
 assert.equal(publication.metadata.extensions.website,'https://grainpad.fun');
 const ordinary=await buildMetadataPublication({...draft,mint:official},bytes,'https://preview.example');
 assert.equal(ordinary.metadata.website,`https://grainpad.fun/token/${official}`);
 assert.throws(()=>assertCanonicalTokenWebsite({...publication.metadata,grainpad:{mint}},mint),/actual mint/);
});
