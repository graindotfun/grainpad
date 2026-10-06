import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {buildLaunchIdentity,identityRecordKey,indexerView,persistLaunchIdentity} from '../lib/canonical-identity.mjs';
import {buildMetadataPublication} from '../lib/metadata-publication.mjs';
import {headerRenditions} from '../lib/header-image.mjs';
import {
 AMENDMENT_SCHEMA,appendIdentityAmendment,canonicalXCommunity,currentCanonicalPresentation,identityAmendmentMessage,validateAmendmentPayload,
} from '../lib/identity-amendment.mjs';

const mint='CzvYJXb3e4KtTd2xZviV9nMUSAC1jary4wLY4cVhwgrn';
const imageHash='cd'.repeat(32);
const metadataHash='ab'.repeat(32);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function crc32(bytes){let table=crc32.table;if(!table){table=crc32.table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}}let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function png(width,height,rgb=[4,8,12]){
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
 const raw=Buffer.alloc(height*(1+width*3));
 for(let y=0;y<height;y++){const row=y*(1+width*3);raw[row]=0;for(let x=0;x<width;x++){const i=row+1+x*3;raw[i]=rgb[0];raw[i+1]=rgb[1];raw[i+2]=rgb[2];}}
 const chunk=(type,data)=>{const body=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(body));const len=Buffer.alloc(4);len.writeUInt32BE(data.length);return Buffer.concat([len,body,c]);};
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
function memory(){
 const objects=new Map();
 const etag=body=>createHash('sha256').update(body).digest('hex');
 const asBuffer=value=>Buffer.isBuffer(value)?value:Buffer.from(value);
 return {objects,async get(key){if(!objects.has(key))return null;const bytes=asBuffer(objects.get(key));return {text:async()=>bytes.toString('utf8'),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),httpEtag:etag(bytes)};},async put(key,value){objects.set(key,asBuffer(value));},async compareAndSet(key,expected,payload){const current=objects.has(key)?asBuffer(objects.get(key)):null;const currentEtag=current===null?null:etag(current);if(currentEtag!==(expected??null))return {conflict:true};objects.set(key,Buffer.from(payload));return {conflict:false};}};
}
function creatorKey(){const key=nacl.sign.keyPair();return {key,creator:bs58.encode(key.publicKey)};}
function fields(creator){return {mint,creator,creatorProvenance:'launch-pool',name:'Seed Cat',symbol:'SEED',description:'A fixture token',image:{sha256:imageHash},header:null,twitter:'https://x.com/seedcat',telegram:'',metadataUri:`https://grainpad.fun/api/assets/${metadataHash}`,metadataHash,sealedAt:'2026-09-29T00:00:00.000Z'};}
function sign(key,payload){return bs58.encode(nacl.sign.detached(new TextEncoder().encode(identityAmendmentMessage(payload)),key.secretKey));}
function payload(creator,patch={}){return {schema:AMENDMENT_SCHEMA,mint,signer:creator,identitySha256:'',previousSha256:'',revision:1,headerSha256:'',smallSha256:'',twitter:'',telegram:'',xCommunity:'',expires:Date.now()+60_000,...patch};}

test('an X Community URL is not a profile or post URL',()=>{
 assert.equal(canonicalXCommunity('https://twitter.com/i/communities/1234567890123456789/'),'https://x.com/i/communities/1234567890123456789');
 assert.throws(()=>canonicalXCommunity('https://x.com/seedcat'),/not a community/);
 assert.throws(()=>canonicalXCommunity('https://x.com/seedcat/status/123'),/not a community/);
 assert.throws(()=>canonicalXCommunity('https://x.com/i/lists/123'),/not a community/);
});

test('creator amendments preserve the original identity and earlier revisions',async()=>{
 const {key,creator}=creatorKey();
 const storage=memory();
 const identity=await buildLaunchIdentity(fields(creator));
 const before=identity.documentJson;
 await persistLaunchIdentity(storage,identity);
 const launch={mint,creator,metadataHash};
 const community='https://x.com/i/communities/42';
 const firstPayload=payload(creator,{identitySha256:identity.sha256,previousSha256:identity.sha256,xCommunity:community});
 const first=await appendIdentityAmendment(storage,launch,firstPayload,sign(key,firstPayload));
 assert.equal(first.revisions.length,1);
 const storedEnvelope=JSON.parse(storage.objects.get(identityRecordKey(mint)).toString('utf8'));
 assert.equal(storedEnvelope.documentJson,before);
 assert.equal(storedEnvelope.sha256,identity.sha256);
 const large=png(1200,400,[9,20,30]);
 const {small}=await headerRenditions(large);
 const secondPayload=payload(creator,{identitySha256:identity.sha256,previousSha256:first.revisions[0].sha256,revision:2,headerSha256:hash(large),smallSha256:hash(small),expires:Date.now()+60_000});
 const second=await appendIdentityAmendment(storage,launch,secondPayload,sign(key,secondPayload),large,'image/png');
 assert.equal(second.revisions.length,2);
 const still=JSON.parse(storage.objects.get(identityRecordKey(mint)).toString('utf8'));
 assert.equal(still.documentJson,before);
 assert.equal(still.sha256,identity.sha256);
 assert.equal(second.revisions[0].sha256,first.revisions[0].sha256);
 assert.notEqual(second.revisions[1].sha256,first.revisions[0].sha256);
 const again=await buildLaunchIdentity(fields(creator));
 assert.equal(again.documentJson,before);
 assert.equal(again.sha256,identity.sha256);
 const presentation=await currentCanonicalPresentation(storage,{document:identity.document,sha256:identity.sha256});
 const view=indexerView({document:identity.document,sha256:identity.sha256,uri:`https://grainpad.fun/api/identity/token/${mint}`},presentation);
 assert.equal(view.banner,presentation.header.uri);
 assert.equal(view.imageBannerUrl,presentation.header.uri);
 assert.equal(view.banner600x200,presentation.header.renditions['600x200'].uri);
 assert.equal(view.twitter,'https://x.com/seedcat');
 assert.equal(view.xCommunity,community);
 assert.equal(view.telegram,'');
 assert.equal(view.identitySha256,identity.sha256);
 assert.equal(view.revision,2);
 assert.equal(view.amendmentSha256,second.revisions[1].sha256);
 assert.equal(view.launch,undefined);
 const other=creatorKey();
 const outsider=payload(other.creator,{identitySha256:identity.sha256,previousSha256:second.revisions[1].sha256,revision:3,xCommunity:'https://x.com/i/communities/99'});
 await assert.rejects(appendIdentityAmendment(storage,launch,outsider,sign(other.key,outsider)),/launch creator/);
 assert.equal((await currentCanonicalPresentation(storage,{document:identity.document,sha256:identity.sha256})).revision,2);
 const dirty={...secondPayload,name:'Renamed',metadataHash:'ff'.repeat(32),slot:9,room:{banner:'https://room.example/art.png'}};
 assert.throws(()=>validateAmendmentPayload(dirty,mint),/outside the signed schema/);
 assert.throws(()=>validateAmendmentPayload(payload(creator,{identitySha256:'ab'.repeat(32),previousSha256:'cd'.repeat(32),xCommunity:'https://x.com/seedcat'}),mint),/not a community/);
 const publication=await buildMetadataPublication({name:'Seed Cat',symbol:'SEED',description:'A fixture token',imageBase64:'aa',imageType:'image/png',owner:creator,expires:1,mint,xCommunity:community},new Uint8Array([1,2,3]),'https://preview.example');
 assert.equal(publication.metadata.xCommunity,undefined);
 assert.equal(JSON.stringify(publication.metadata).includes('communities'),false);
});
