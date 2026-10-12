import {verifyScopedLaunchIdentityAuthorization} from './launch-identity-authorization.mjs';
/** Append-only creator amendments. They do not rewrite grainpad.identity.v1. */
import {PublicKey} from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {contentHash} from './metadata-publication.mjs';
import {metadataLink} from './metadata-shared.ts';
import {HEADER_ASPECT,HEADER_HEIGHT,HEADER_SMALL_HEIGHT,HEADER_SMALL_WIDTH,HEADER_WIDTH,headerRenditions,validateHeaderImage} from './header-image.mjs';
import {TOKEN_WEBSITE_ORIGIN} from './token-website.mjs';

export const AMENDMENT_SCHEMA='grainpad.identity.amendment.v1';
export const AMENDMENTS_SCHEMA='grainpad.identity.amendments.v1';
export const IDENTITY_UPDATE_SENTENCE='This signature updates your token\'s canonical Grainpad identity. It does not authorize a transaction or payment.';
const AMENDMENT_FIELDS=['schema','mint','signer','identitySha256','previousSha256','revision','headerSha256','smallSha256','twitter','telegram','xCommunity','expires'];
const encoder=new TextEncoder();

export class AmendmentIntegrityError extends Error{
 constructor(message){super(message);this.name='AmendmentIntegrityError';this.status=409;}
}

export function amendmentsKey(mint){return `identity/amendments/v1/mainnet-beta/${mint}`;}
function identityKey(mint){return `identity/v1/mainnet-beta/${mint}`;}
function address(value,label){
 let encoded;try{encoded=new PublicKey(value).toBase58();}catch{throw Error(`Invalid ${label}.`);}
 if(encoded!==value)throw Error(`Invalid ${label}.`);
 return encoded;
}
function sha256Field(value,label){
 if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw Error(`Invalid ${label}.`);
 return value;
}
/** X Community URLs only. A profile, post, or list URL is rejected. */
export function canonicalXCommunity(value){
 if(typeof value!=='string'||!value.trim())throw Error('Enter an X Community URL.');
 let url;try{url=new URL(value.trim());}catch{throw Error('Enter an X Community URL.');}
 if(url.protocol!=='https:')throw Error('Enter an X Community URL.');
 const host=url.hostname.toLowerCase();
 if(!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(host))throw Error('Enter an X Community URL.');
 const match=url.pathname.match(/^\/i\/communities\/(\d{1,20})\/?$/);
 if(!match||url.search||url.hash)throw Error('Enter an X Community URL. A profile or post URL is not a community.');
 return `https://x.com/i/communities/${match[1]}`;
}
export function launchIdentityIntentMessage({mint,metadataHash,imageHash,xCommunity}){
 return ['Grainpad canonical identity update',`Schema: ${AMENDMENT_SCHEMA}`,`Mint: ${mint}`,`Metadata SHA256: ${metadataHash}`,`Image SHA256: ${imageHash}`,`X Community: ${xCommunity}`,IDENTITY_UPDATE_SENTENCE].join('\n');
}
export function identityAmendmentMessage(payload){
 return ['Grainpad canonical identity update',`Schema: ${payload.schema}`,`Mint: ${payload.mint}`,`Signer: ${payload.signer}`,`Identity SHA256: ${payload.identitySha256}`,`Previous SHA256: ${payload.previousSha256}`,`Revision: ${payload.revision}`,`Header SHA256: ${payload.headerSha256}`,`Header 600 SHA256: ${payload.smallSha256}`,`X: ${payload.twitter}`,`X Community: ${payload.xCommunity}`,`Telegram: ${payload.telegram}`,`Expires: ${payload.expires}`,IDENTITY_UPDATE_SENTENCE].join('\n');
}
function verify(message,signature,signer){
 let valid=false;
 try{const key=bs58.decode(signer),sig=bs58.decode(signature);valid=key.length===32&&sig.length===64&&nacl.sign.detached.verify(encoder.encode(message),sig,key);}catch{valid=false;}
 if(!valid)throw Error('The launch creator must sign this canonical identity update.');
}
async function readText(storage,key){
 const object=await storage.get(key);
 if(!object)return null;
 if(typeof object.text==='function')return object.text();
 if(typeof object==='string')return object;
 return null;
}
function headerView(sha256,smallSha256){
 const uri=`${TOKEN_WEBSITE_ORIGIN}/api/assets/${sha256}`;
 const smallUri=`${TOKEN_WEBSITE_ORIGIN}/api/assets/${smallSha256}`;
 return {uri,sha256,width:HEADER_WIDTH,height:HEADER_HEIGHT,aspectRatio:HEADER_ASPECT,renditions:{'1200x400':{uri,sha256,width:HEADER_WIDTH,height:HEADER_HEIGHT},'600x200':{uri:smallUri,sha256:smallSha256,width:HEADER_SMALL_WIDTH,height:HEADER_SMALL_HEIGHT}}};
}
function emptyLog(mint){return {schema:AMENDMENTS_SCHEMA,mint,revisions:[]};}
export async function readAmendmentLog(storage,mint){
 const text=await readText(storage,amendmentsKey(mint));
 if(text==null)return emptyLog(mint);
 let log;try{log=JSON.parse(text);}catch{throw new AmendmentIntegrityError('Stored identity amendments do not match the recorded hash.');}
 if(!log||log.schema!==AMENDMENTS_SCHEMA||log.mint!==mint||!Array.isArray(log.revisions))throw new AmendmentIntegrityError('Stored identity amendments do not match the recorded hash.');
 return log;
}
async function writeLog(storage,mint,previousText,nextLog){
 const key=amendmentsKey(mint),payload=JSON.stringify(nextLog);
 if(typeof storage.compareAndSet==='function'){
  const current=await storage.get(key);
  const etag=current?.httpEtag??current?.etag??null;
  const seen=current?await current.text():null;
  if(seen!==previousText)throw Error('Identity amendment conflict. Sign again.');
  const result=await storage.compareAndSet(key,etag,payload);
  if(result?.conflict)throw Error('Identity amendment conflict. Sign again.');
  return nextLog;
 }
 await storage.put(key,payload,{httpMetadata:{contentType:'application/json',cacheControl:'no-store'}});
 return nextLog;
}
function revisionHash(body){
 return contentHash(encoder.encode(JSON.stringify(body)));
}
function basePresentation(identity){
 const document=identity.document;
 return {header:document.header??null,twitter:document.twitter||'',telegram:document.telegram||'',xCommunity:'',revision:0,amendmentSha256:null,identitySha256:identity.sha256};
}
/** Current creator-authorized view. The original document is not modified. */
export async function currentCanonicalPresentation(storage,identity){
 const document=identity?.document;
 if(!document||document.schema!=='grainpad.identity.v1'||typeof identity.sha256!=='string')throw Error('Indexer projection requires grainpad.identity.v1.');
 const log=await readAmendmentLog(storage,document.mint);
 const view=basePresentation(identity);
 let previous=identity.sha256;
 for(const revision of log.revisions){
  if(revision?.mint!==document.mint||revision.signer!==document.creator||revision.identitySha256!==identity.sha256||revision.previousSha256!==previous)throw new AmendmentIntegrityError('Stored identity amendments do not match the recorded hash.');
  const sha=await revisionHash(signedBody(revision));
  if(sha!==revision.sha256)throw new AmendmentIntegrityError('Stored identity amendments do not match the recorded hash.');
  if(revision.source==='launch-identity-authorization'){
   if(revision.signature!==revision.authorization?.signature||revision.metadataHash!==document.metadata?.sha256||revision.imageHash!==document.image?.sha256)throw new AmendmentIntegrityError('Combined launch amendment identity changed.');
   verifyScopedLaunchIdentityAuthorization(revision.authorization,{creator:document.creator,mint:document.mint,metadataHash:document.metadata.sha256,imageHash:document.image.sha256,xCommunity:revision.xCommunity});
  }
  else if(revision.source==='launch-intent')verify(launchIdentityIntentMessage({mint:revision.mint,metadataHash:revision.metadataHash,imageHash:revision.imageHash,xCommunity:revision.xCommunity}),revision.signature,revision.signer);
  else verify(identityAmendmentMessage(messageFields(revision)),revision.signature,revision.signer);
  if(revision.headerSha256){
   if(!revision.smallSha256)throw new AmendmentIntegrityError('Stored identity amendments do not match the recorded hash.');
   await assertHeaderAssets(storage,revision.headerSha256,revision.smallSha256);
   view.header=headerView(revision.headerSha256,revision.smallSha256);
  }
  if(revision.twitter)view.twitter=revision.twitter;
  if(revision.telegram)view.telegram=revision.telegram;
  if(revision.xCommunity)view.xCommunity=revision.xCommunity;
  view.revision=revision.revision;
  view.amendmentSha256=revision.sha256;
  previous=revision.sha256;
 }
 return view;
}
function messageFields(revision){
 return {schema:AMENDMENT_SCHEMA,mint:revision.mint,signer:revision.signer,identitySha256:revision.identitySha256,previousSha256:revision.previousSha256,revision:revision.revision,headerSha256:revision.headerSha256||'',smallSha256:revision.smallSha256||'',twitter:revision.twitter||'',telegram:revision.telegram||'',xCommunity:revision.xCommunity||'',expires:revision.expires};
}
function signedBody(revision){
 if(revision.source==='launch-identity-authorization')return {...signedBody({...revision,source:'launch-intent'}),source:'launch-identity-authorization',authorization:revision.authorization};
 if(revision.source==='launch-intent')return {schema:AMENDMENT_SCHEMA,source:'launch-intent',revision:revision.revision,mint:revision.mint,signer:revision.signer,identitySha256:revision.identitySha256,previousSha256:revision.previousSha256,metadataHash:revision.metadataHash,imageHash:revision.imageHash,xCommunity:revision.xCommunity};
 return {schema:AMENDMENT_SCHEMA,revision:revision.revision,mint:revision.mint,signer:revision.signer,identitySha256:revision.identitySha256,previousSha256:revision.previousSha256,headerSha256:revision.headerSha256||'',smallSha256:revision.smallSha256||'',twitter:revision.twitter||'',telegram:revision.telegram||'',xCommunity:revision.xCommunity||'',expires:revision.expires};
}
export async function acceptLaunchIdentityIntent({intent,owner,mint,metadataHash,imageHash}){
 if(intent==null)return null;
 if(typeof intent!=='object'||Array.isArray(intent)||!['signature,xCommunity','authorization,xCommunity'].includes(Object.keys(intent).sort().join()))throw Error('Identity update contains fields outside the signed schema.');
 const xCommunity=canonicalXCommunity(intent.xCommunity);
 if(intent.xCommunity!==xCommunity)throw Error('Sign the normalized X Community URL.');
 const creator=address(owner,'creator'),token=address(mint,'token mint');
 sha256Field(metadataHash,'metadata hash');sha256Field(imageHash,'image hash');
 if(intent.authorization!==undefined){
  verifyScopedLaunchIdentityAuthorization(intent.authorization,{creator,mint:token,metadataHash,imageHash,xCommunity});
  return {mint:token,metadataHash,imageHash,xCommunity,signature:intent.authorization.signature,authorization:intent.authorization};
 }
 if(typeof intent.signature!=='string')throw Error('The launch creator must sign this canonical identity update.');
 verify(launchIdentityIntentMessage({mint:token,metadataHash,imageHash,xCommunity}),intent.signature,creator);
 return {mint:token,metadataHash,imageHash,xCommunity,signature:intent.signature};
}
async function assetBytes(storage,key){
 const object=await storage.get(key);
 if(!object)return null;
 if(typeof object.arrayBuffer==='function')return new Uint8Array(await object.arrayBuffer());
 if(object.body instanceof Uint8Array)return object.body;
 if(typeof object.text==='function'){const text=await object.text();return typeof text==='string'?encoder.encode(text):null;}
 return null;
}
async function assertHeaderAssets(storage,headerSha256,smallSha256){
 const large=await assetBytes(storage,`assets/${headerSha256}`);
 const small=await assetBytes(storage,`assets/${smallSha256}`);
 if(!large||await contentHash(large)!==headerSha256||!small||await contentHash(small)!==smallSha256)throw new AmendmentIntegrityError('Stored header bytes do not match the recorded hash.');
 const derived=await headerRenditions(large);
 if(await contentHash(derived.small)!==smallSha256)throw new AmendmentIntegrityError('Stored header bytes do not match the recorded hash.');
}
export function validateAmendmentPayload(payload,mint,now=Date.now()){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).length!==AMENDMENT_FIELDS.length||AMENDMENT_FIELDS.some(key=>!Object.hasOwn(payload,key)))throw Error('Identity update contains fields outside the signed schema.');
 if(payload.schema!==AMENDMENT_SCHEMA)throw Error('Identity update contains fields outside the signed schema.');
 const token=address(mint,'token mint'),signer=address(payload.signer,'creator');
 if(payload.mint!==token)throw Error('Identity mint does not match this token.');
 sha256Field(payload.identitySha256,'identity hash');sha256Field(payload.previousSha256,'previous amendment hash');
 if(!Number.isSafeInteger(payload.revision)||payload.revision<1)throw Error('Identity amendment revision is not the next revision.');
 if(!Number.isSafeInteger(payload.expires)||payload.expires<=now||payload.expires>now+10*60*1000)throw Error('Identity signature expired. Review and sign again.');
 const headerSha256=payload.headerSha256||'',smallSha256=payload.smallSha256||'';
 if((headerSha256==='')!==(smallSha256===''))throw Error('Header image must be a 1200 by 400 PNG (3:1). Grainpad stores those pixels and a 600 by 200 rendition.');
 if(headerSha256){sha256Field(headerSha256,'header hash');sha256Field(smallSha256,'header rendition hash');}
 const twitter=payload.twitter?metadataLink(payload.twitter,'twitter'):'';
 const telegram=payload.telegram?metadataLink(payload.telegram,'telegram'):'';
 const xCommunity=payload.xCommunity?canonicalXCommunity(payload.xCommunity):'';
 if(payload.twitter!==twitter||payload.telegram!==telegram||payload.xCommunity!==xCommunity)throw Error('Sign the normalized identity links.');
 if(!headerSha256&&!twitter&&!telegram&&!xCommunity)throw Error('Identity update does not change a canonical field.');
 return {...payload,mint:token,signer,headerSha256,smallSha256,twitter,telegram,xCommunity};
}
async function storeHeader(storage,bytes,claimedType,headerSha256,smallSha256){
 if(!(bytes instanceof Uint8Array))throw Error('Attach the banner image that matches the signed hash.');
 const checked=validateHeaderImage(bytes,claimedType);
 const renditions=await headerRenditions(bytes);
 const large=await contentHash(renditions.large),small=await contentHash(renditions.small);
 if(large!==headerSha256||small!==smallSha256)throw Error('Banner bytes do not match the signed hash.');
 if(!(await storage.get(`assets/${large}`)))await storage.put(`assets/${large}`,renditions.large,{httpMetadata:{contentType:checked.type,cacheControl:'public, max-age=31536000, immutable'}});
 if(!(await storage.get(`assets/${small}`)))await storage.put(`assets/${small}`,renditions.small,{httpMetadata:{contentType:'image/png',cacheControl:'public, max-age=31536000, immutable'}});
}
export async function appendIdentityAmendment(storage,launch,payload,signature,headerBytes,headerType,now=Date.now()){
 if(payload?.signer!==launch?.creator)throw Error('Only the launch creator can update canonical identity.');
 const signed=validateAmendmentPayload(payload,launch.mint,now);
 verify(identityAmendmentMessage(signed),signature,signed.signer);
 const identityText=await readText(storage,identityKey(launch.mint));
 if(!identityText)throw Error('Canonical identity is not stored yet. Retry shortly.');
 let envelope;try{envelope=JSON.parse(identityText);}catch{throw new AmendmentIntegrityError('Stored identity bytes do not match the recorded hash.');}
 const identitySha=await contentHash(encoder.encode(envelope.documentJson));
 if(identitySha!==envelope.sha256||identitySha!==signed.identitySha256)throw Error('Identity amendment does not match the stored launch identity.');
 let document;try{document=JSON.parse(envelope.documentJson);}catch{throw new AmendmentIntegrityError('Stored identity bytes do not match the recorded hash.');}
 if(document.mint!==launch.mint||document.creator!==launch.creator||document.metadata?.sha256!==launch.metadataHash)throw Error('Identity amendment does not match the stored launch identity.');
 const previousText=await readText(storage,amendmentsKey(launch.mint));
 const log=previousText==null?emptyLog(launch.mint):JSON.parse(previousText);
 if(log.revisions.some(item=>item.signature===signature))return log;
 const previousSha=log.revisions.length?log.revisions.at(-1).sha256:identitySha;
 if(signed.previousSha256!==previousSha||signed.revision!==log.revisions.length+1)throw Error('Identity amendment revision is not the next revision.');
 if(signed.headerSha256)await storeHeader(storage,headerBytes,headerType,signed.headerSha256,signed.smallSha256);
 const body=signedBody({...signed,source:undefined});
 const sha256=await revisionHash(body);
 const revision={...body,sha256,signedAt:new Date(now).toISOString(),signature};
 const next={schema:AMENDMENTS_SCHEMA,mint:launch.mint,revisions:[...log.revisions,revision]};
 return writeLog(storage,launch.mint,previousText,next);
}
export async function applyStoredLaunchIntent(storage,launch){
 const claimText=await readText(storage,`owners/${launch.metadataHash}/${launch.creator}`);
 if(!claimText)return null;
 let claim;try{claim=JSON.parse(claimText);}catch{return null;}
 const intent=claim?.identityIntent;
 if(!intent)return null;
 const identityText=await readText(storage,identityKey(launch.mint));
 if(!identityText)return null;
 const envelope=JSON.parse(identityText);
 const identitySha=await contentHash(encoder.encode(envelope.documentJson));
 if(identitySha!==envelope.sha256)throw new AmendmentIntegrityError('Stored identity bytes do not match the recorded hash.');
 const document=JSON.parse(envelope.documentJson);
 if(document.mint!==launch.mint||document.creator!==launch.creator||document.metadata?.sha256!==intent.metadataHash||document.image?.sha256!==intent.imageHash)throw Error('Launch identity intent does not match the stored identity.');
 if(intent.authorization!==undefined){
  if(intent.signature!==intent.authorization?.signature)throw Error('Stored combined launch intent signature changed.');
  verifyScopedLaunchIdentityAuthorization(intent.authorization,{creator:launch.creator,mint:launch.mint,metadataHash:document.metadata?.sha256,imageHash:document.image?.sha256,xCommunity:intent.xCommunity});
 }else verify(launchIdentityIntentMessage(intent),intent.signature,launch.creator);
 const previousText=await readText(storage,amendmentsKey(launch.mint));
 const log=previousText==null?emptyLog(launch.mint):JSON.parse(previousText);
 if(log.revisions.some(item=>item.signature===intent.signature))return log;
 const previousSha=log.revisions.length?log.revisions.at(-1).sha256:identitySha;
 const body=signedBody({schema:AMENDMENT_SCHEMA,source:intent.authorization!==undefined?'launch-identity-authorization':'launch-intent',...(intent.authorization!==undefined?{authorization:intent.authorization}:{}),revision:log.revisions.length+1,mint:launch.mint,signer:launch.creator,identitySha256:identitySha,previousSha256:previousSha,metadataHash:intent.metadataHash,imageHash:intent.imageHash,xCommunity:intent.xCommunity});
 const sha256=await revisionHash(body);
 const revision={...body,sha256,signedAt:new Date().toISOString(),signature:intent.signature};
 return writeLog(storage,launch.mint,previousText,{schema:AMENDMENTS_SCHEMA,mint:launch.mint,revisions:[...log.revisions,revision]});
}
