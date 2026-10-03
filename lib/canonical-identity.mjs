import {PublicKey} from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {canonicalTokenWebsite,TOKEN_WEBSITE_ORIGIN} from './token-website.mjs';
import {contentHash,metadataHashFromUri} from './metadata-publication.mjs';
import {metadataLink} from './metadata-shared.ts';
import {HEADER_ASPECT,HEADER_HEIGHT,HEADER_SMALL_HEIGHT,HEADER_SMALL_WIDTH,HEADER_WIDTH,headerRenditions,validateHeaderImage} from './header-image.mjs';
import {IDENTITY_SCHEMA,headerSealMessage} from './identity-seal.mjs';
import {grainpadPlatformId} from './platform-policy.mjs';
import {indexedLaunchPage} from './launch-index.mjs';
import {currentCanonicalPresentation} from './identity-amendment.mjs';

export {IDENTITY_SCHEMA,headerSealMessage};
export const TOKEN_LIST_VERSION=Object.freeze({major:1,minor:0,patch:0});
export const TOKEN_INFO_SCHEMA_VERSION='1.0.0';
export const INDEXER_SCHEMA='grainpad.indexer.v1';
/** Raydium LaunchLab program. Same id as launch registration for mainnet-beta. */
export const LAUNCHLAB_PROGRAM_ID='LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';
export const SOLANA_MAINNET_CHAIN_ID=101;
export const TOKEN_LIST_EPOCH='2026-10-03T00:00:00.000Z';
export const TOKEN_LIST_CAP=500;
export const IDENTITY_NOTICE='Third parties may show different mutable profile data. This Grainpad launch identity is not a DEX Screener profile and is not the editable project profile.';
export const IDENTITY_LIMITS=Object.freeze({
 onChainMetadataAuthority:'not-proven-by-this-document',
 projectProfileSeparate:true,
 note:'This seal is Grainpad application data from the confirmed launch record. It does not prove that mint, freeze, metadata-pointer, metadata-update, or transfer-fee authorities are immutable. Project profile edits are separate. Third parties may show different mutable profile data.',
});

export class IdentityIntegrityError extends Error{
 constructor(message){super(message);this.name='IdentityIntegrityError';this.status=409;}
}

const encoder=new TextEncoder();
export function identityRecordKey(mint){return `identity/v1/mainnet-beta/${mint}`;}
export function identityAssetUri(sha256){return `${TOKEN_WEBSITE_ORIGIN}/api/assets/${sha256}`;}
function address(value,label){
 let encoded;try{encoded=new PublicKey(value).toBase58();}catch{throw Error(`Invalid ${label}.`);}
 if(encoded!==value)throw Error(`Invalid ${label}.`);
 return encoded;
}
function asset(value,label){
 if(typeof value==='string'||value==null||typeof value!=='object'||Array.isArray(value))throw Error(label==='header'?'An arbitrary URL cannot replace the header asset.':'Canonical image must use the Grainpad content-addressed store.');
 if(typeof value.sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.sha256))throw Error(label==='header'?'An arbitrary URL cannot replace the header asset.':'Canonical image must use the Grainpad content-addressed store.');
 const uri=identityAssetUri(value.sha256);
 if(value.uri!==undefined&&value.uri!==uri)throw Error(label==='header'?'An arbitrary URL cannot replace the header asset.':'Canonical image must use the Grainpad content-addressed store.');
 return {uri,sha256:value.sha256};
}
function headerDocument(header){
 if(header==null)return null;
 if(typeof header==='string'||typeof header!=='object'||Array.isArray(header))throw Error('An arbitrary URL cannot replace the header asset.');
 const sha256=header.sha256||header.renditions?.['1200x400']?.sha256;
 const smallSha256=header.smallSha256||header.renditions?.['600x200']?.sha256;
 if(typeof sha256!=='string'||!/^[a-f0-9]{64}$/.test(sha256)||typeof smallSha256!=='string'||!/^[a-f0-9]{64}$/.test(smallSha256))throw Error('An arbitrary URL cannot replace the header asset.');
 const uri=identityAssetUri(sha256),smallUri=identityAssetUri(smallSha256);
 if((header.uri!==undefined&&header.uri!==uri)||(header.width!==undefined&&header.width!==HEADER_WIDTH)||(header.height!==undefined&&header.height!==HEADER_HEIGHT)||(header.aspectRatio!==undefined&&header.aspectRatio!==HEADER_ASPECT))throw Error('An arbitrary URL cannot replace the header asset.');
 const large=header.renditions?.['1200x400'],small=header.renditions?.['600x200'];
 if(large&&(large.uri!==uri||large.sha256!==sha256||large.width!==HEADER_WIDTH||large.height!==HEADER_HEIGHT))throw Error('An arbitrary URL cannot replace the header asset.');
 if(small&&(small.uri!==smallUri||small.sha256!==smallSha256||small.width!==HEADER_SMALL_WIDTH||small.height!==HEADER_SMALL_HEIGHT))throw Error('An arbitrary URL cannot replace the header asset.');
 return {uri,sha256,width:HEADER_WIDTH,height:HEADER_HEIGHT,aspectRatio:HEADER_ASPECT,renditions:{'1200x400':{uri,sha256,width:HEADER_WIDTH,height:HEADER_HEIGHT},'600x200':{uri:smallUri,sha256:smallSha256,width:HEADER_SMALL_WIDTH,height:HEADER_SMALL_HEIGHT}}};
}
function launchDocument(launch){
 if(launch==null)return undefined;
 if(typeof launch!=='object'||Array.isArray(launch))throw Error('Launch identity is incomplete.');
 if(launch.chain!==undefined&&launch.chain!=='solana')throw Error('Launch chain must be solana.');
 if(launch.programId!==undefined&&launch.programId!==LAUNCHLAB_PROGRAM_ID)throw Error('Launch program does not match Raydium LaunchLab.');
 const body={chain:'solana',programId:LAUNCHLAB_PROGRAM_ID};
 if(launch.platformId)body.platformId=address(launch.platformId,'platform');
 if(launch.pool)body.pool=address(launch.pool,'pool');
 if(launch.quoteMint)body.quoteMint=address(launch.quoteMint,'quote mint');
 if(typeof launch.quoteAsset==='string'&&launch.quoteAsset)body.quoteAsset=launch.quoteAsset;
 if(launch.slot!==undefined&&launch.slot!==null){if(!Number.isSafeInteger(launch.slot)||launch.slot<0)throw Error('Launch slot is not an indexed slot.');body.slot=launch.slot;}
 if(typeof launch.signature==='string'&&launch.signature){if(!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(launch.signature))throw Error('Launch signature is not a transaction signature.');body.signature=launch.signature;}
 return body;
}
function social(value,kind){
 if(value==null||value==='')return '';
 return metadataLink(value,kind);
}
/** Deterministic bytes. Key order is part of the hash. */
export function canonicalIdentityJson(document){
 const body={
  schema:IDENTITY_SCHEMA,
  mint:document.mint,
  creator:document.creator??null,
  creatorProvenance:document.creatorProvenance,
  name:document.name,
  symbol:document.symbol,
  description:document.description||'',
  image:asset(document.image,'image'),
  header:headerDocument(document.header),
  website:document.website,
  twitter:document.twitter||'',
  telegram:document.telegram||'',
  metadata:{uri:document.metadata.uri,sha256:document.metadata.sha256},
  ...(launchDocument(document.launch)?{launch:launchDocument(document.launch)}:{}),
  sealedAt:document.sealedAt,
  notice:IDENTITY_NOTICE,
 };
 return JSON.stringify(body);
}
export async function buildLaunchIdentity(fields){
 if(fields?.dexscreener!=null||fields?.dexScreener!=null)throw Error('Launch identity cannot be derived from DEX Screener.');
 const mint=address(fields.mint,'token mint');
 const website=canonicalTokenWebsite(mint);
 if(fields.website!==undefined&&fields.website!==''&&fields.website!==website)throw Error('Token website cannot be overridden.');
 if(typeof fields.header==='string'||fields.headerUrl!=null||fields.headerURI!=null)throw Error('An arbitrary URL cannot replace the header asset.');
 const creatorProvenance=fields.creatorProvenance==='launch-pool'?'launch-pool':'unproven';
 const creator=creatorProvenance==='launch-pool'?address(fields.creator,'creator'):null;
 if(creatorProvenance!=='launch-pool'&&fields.creator)throw Error('Creator is not included unless the launch pool already proved it.');
 if(typeof fields.name!=='string'||!fields.name.trim()||typeof fields.symbol!=='string'||!fields.symbol.trim())throw Error('Launch identity is incomplete.');
 if(typeof fields.sealedAt!=='string'||!Number.isFinite(Date.parse(fields.sealedAt)))throw Error('Launch identity is incomplete.');
 let metadataUri=fields.metadataUri,metadataHash=fields.metadataHash;
 if(typeof metadataUri!=='string'||typeof metadataHash!=='string'||!/^[a-f0-9]{64}$/.test(metadataHash))throw Error('Stored metadata bytes do not match the recorded hash.');
 let located;try{located=metadataHashFromUri(metadataUri,TOKEN_WEBSITE_ORIGIN);}catch{throw Error('Stored metadata bytes do not match the recorded hash.');}
 if(located!==metadataHash)throw Error('Stored metadata bytes do not match the recorded hash.');
 const document=JSON.parse(canonicalIdentityJson({
  schema:IDENTITY_SCHEMA,mint,creator,creatorProvenance,name:fields.name.trim(),symbol:fields.symbol.trim(),description:typeof fields.description==='string'?fields.description:'',
  image:asset(fields.image,'image'),header:fields.header??null,website,twitter:social(fields.twitter,'twitter'),telegram:social(fields.telegram,'telegram'),
  metadata:{uri:metadataUri,sha256:metadataHash},...(fields.launch?{launch:fields.launch}:{}),sealedAt:new Date(Date.parse(fields.sealedAt)).toISOString(),
 }));
 const documentJson=canonicalIdentityJson(document);
 const sha256=await contentHash(encoder.encode(documentJson));
 const envelope={schema:IDENTITY_SCHEMA,sha256,documentJson};
 return {schema:IDENTITY_SCHEMA,sha256,document,documentJson,envelope,stored:JSON.stringify(envelope)};
}
export async function assertIdentityEnvelope(envelope,mint){
 if(!envelope||typeof envelope!=='object'||envelope.schema!==IDENTITY_SCHEMA)throw new IdentityIntegrityError('Identity schema is not grainpad.identity.v1.');
 if(typeof envelope.documentJson!=='string'||typeof envelope.sha256!=='string')throw new IdentityIntegrityError('Stored identity bytes do not match the recorded hash.');
 const sha256=await contentHash(encoder.encode(envelope.documentJson));
 if(sha256!==envelope.sha256)throw new IdentityIntegrityError('Stored identity bytes do not match the recorded hash.');
 let document;try{document=JSON.parse(envelope.documentJson);}catch{throw new IdentityIntegrityError('Stored identity bytes do not match the recorded hash.');}
 if(canonicalIdentityJson(document)!==envelope.documentJson||document.schema!==IDENTITY_SCHEMA||document.notice!==IDENTITY_NOTICE)throw new IdentityIntegrityError('Stored identity bytes do not match the recorded hash.');
 const expected=address(mint,'token mint');
 if(document.mint!==expected)throw Error('Identity mint does not match this token.');
 if(document.website!==canonicalTokenWebsite(expected))throw Error('Token website cannot be overridden.');
 return {schema:IDENTITY_SCHEMA,sha256,document,documentJson:envelope.documentJson,envelope,stored:JSON.stringify({schema:IDENTITY_SCHEMA,sha256,documentJson:envelope.documentJson})};
}
async function objectText(object){return object?.text?object.text():null;}
async function objectBytes(object){
 if(!object)return null;
 if(typeof object.arrayBuffer==='function')return new Uint8Array(await object.arrayBuffer());
 if(object.body instanceof Uint8Array)return object.body;
 const text=await objectText(object);
 return text==null?null:encoder.encode(text);
}
async function readText(storage,key){
 const object=await storage.get(key);
 if(!object)return null;
 return objectText(object);
}
async function hashBytes(storage,key){
 const object=await storage.get(key);
 if(!object)return null;
 const bytes=await objectBytes(object);
 if(!bytes)return null;
 return {bytes,sha256:await contentHash(bytes)};
}
export async function verifyBoundAssets(storage,document){
 const image=await hashBytes(storage,`assets/${document.image.sha256}`);
 if(image&&image.sha256!==document.image.sha256)throw new IdentityIntegrityError('Stored image bytes do not match the recorded hash.');
 const metadata=await hashBytes(storage,`assets/${document.metadata.sha256}`);
 if(metadata&&metadata.sha256!==document.metadata.sha256)throw new IdentityIntegrityError('Stored metadata bytes do not match the recorded hash.');
 if(!document.header)return;
 const header=await hashBytes(storage,`assets/${document.header.sha256}`);
 const smallHash=document.header.renditions?.['600x200']?.sha256;
 const small=smallHash?await hashBytes(storage,`assets/${smallHash}`):null;
 if(!header||header.sha256!==document.header.sha256||!small||small.sha256!==smallHash)throw new IdentityIntegrityError('Stored header bytes do not match the recorded hash.');
 try{
  const derived=await headerRenditions(header.bytes);
  if(await contentHash(derived.small)!==small.sha256)throw new IdentityIntegrityError('Stored header bytes do not match the recorded hash.');
 }catch(error){
  if(error instanceof IdentityIntegrityError)throw error;
  throw new IdentityIntegrityError(error instanceof Error?error.message:'Stored header bytes do not match the recorded hash.');
 }
}
function verifySeal(header,creator){
 const message=headerSealMessage({mint:header.mint,metadataHash:header.metadataHash,imageHash:header.imageHash,headerHash:header.sha256});
 let valid=false;
 try{const key=bs58.decode(creator),sig=bs58.decode(header.signature);valid=key.length===32&&sig.length===64&&nacl.sign.detached.verify(encoder.encode(message),sig,key);}catch{valid=false;}
 if(!valid)throw new IdentityIntegrityError('The launch creator must sign this exact header.');
}
/** Optional banner captured with the metadata upload. Bytes stay in the asset store; the claim only carries the hash. */
export async function acceptLaunchHeader({header,owner,mint,metadataHash,imageHash}){
 if(header==null)return null;
 if(typeof header!=='object'||Array.isArray(header)||header.url!=null||header.uri!=null)throw Error('An arbitrary URL cannot replace the header asset.');
 if(typeof header.imageBase64!=='string'||header.imageBase64.length>2_700_000||header.imageBase64.startsWith('http://')||header.imageBase64.startsWith('https://'))throw Error('An arbitrary URL cannot replace the header asset.');
 const mintAddress=address(mint,'token mint'),creator=address(owner,'creator');
 const bytes=Uint8Array.from(atob(header.imageBase64),char=>char.charCodeAt(0));
 const {type}=validateHeaderImage(bytes,header.imageType);
 const renditions=await headerRenditions(bytes);
 const sha256=await contentHash(renditions.large),smallSha256=await contentHash(renditions.small);
 verifySeal({mint:mintAddress,metadataHash,imageHash,sha256,signature:header.signature},creator);
 return {bytes:renditions.large,smallBytes:renditions.small,type,sha256,smallSha256,mint:mintAddress,metadataHash,imageHash,signature:header.signature};
}
async function headerFromClaim(storage,launch,imageHash){
 const text=await readText(storage,`owners/${launch.metadataHash}/${launch.creator}`);
 if(!text)return null;
 let claim;try{claim=JSON.parse(text);}catch{throw new IdentityIntegrityError('Stored header bytes do not match the recorded hash.');}
 if(claim?.header==null)return null;
 const header=claim.header;
 if(header.mint!==launch.mint)throw Error('Identity mint does not match this token.');
 if(typeof header.sha256!=='string'||!/^[a-f0-9]{64}$/.test(header.sha256)||typeof header.smallSha256!=='string'||!/^[a-f0-9]{64}$/.test(header.smallSha256)||header.metadataHash!==launch.metadataHash||header.imageHash!==imageHash)throw new IdentityIntegrityError('Stored header bytes do not match the recorded hash.');
 verifySeal(header,launch.creator);
 const stored=await hashBytes(storage,`assets/${header.sha256}`);
 const small=await hashBytes(storage,`assets/${header.smallSha256}`);
 if(!stored||stored.sha256!==header.sha256||!small||small.sha256!==header.smallSha256)throw new IdentityIntegrityError('Stored header bytes do not match the recorded hash.');
 try{
  const derived=await headerRenditions(stored.bytes);
  if(await contentHash(derived.small)!==header.smallSha256)throw new IdentityIntegrityError('Stored header bytes do not match the recorded hash.');
 }catch(error){
  if(error instanceof IdentityIntegrityError||(error instanceof Error&&error.message==='Identity mint does not match this token.'))throw error;
  throw new IdentityIntegrityError('Stored header bytes do not match the recorded hash.');
 }
 return {sha256:header.sha256,smallSha256:header.smallSha256};
}
async function telegramFromMetadata(storage,launch){
 const stored=await hashBytes(storage,`assets/${launch.metadataHash}`);
 if(!stored)return typeof launch.telegram==='string'?launch.telegram:'';
 if(stored.sha256!==launch.metadataHash)throw new IdentityIntegrityError('Stored metadata bytes do not match the recorded hash.');
 let metadata;try{metadata=JSON.parse(new TextDecoder().decode(stored.bytes));}catch{throw new IdentityIntegrityError('Stored metadata bytes do not match the recorded hash.');}
 const telegram=metadata?.telegram||metadata?.extensions?.telegram||launch.telegram||'';
 return typeof telegram==='string'?telegram:'';
}
/** Projection of a confirmed launch record. Nested DEX Screener objects are not read. */
export async function identityFromLaunchRecord(storage,launch){
 if(!launch?.mint)throw Error('Launch identity is incomplete.');
 const imageHash=asset({uri:launch.image,sha256:launch.image?.split('/').pop()},'image').sha256;
 if(!launch.image?.endsWith('/'+imageHash))throw Error('Canonical image must use the Grainpad content-addressed store.');
 const header=await headerFromClaim(storage,launch,imageHash);
 const telegram=await telegramFromMetadata(storage,launch);
 return buildLaunchIdentity({
  mint:launch.mint,creator:launch.creator,creatorProvenance:launch.creator?'launch-pool':'unproven',name:launch.name,symbol:launch.symbol,
  description:launch.description||'',image:{sha256:imageHash},header,website:canonicalTokenWebsite(launch.mint),twitter:launch.twitter||'',telegram,
  metadataUri:launch.uri,metadataHash:launch.metadataHash,sealedAt:launch.createdAt,
  launch:{chain:'solana',programId:LAUNCHLAB_PROGRAM_ID,platformId:launch.platformId,pool:launch.pool,quoteMint:launch.quoteMint,quoteAsset:launch.quoteAsset,slot:launch.proofSlot,signature:launch.signature},
 });
}
export async function persistLaunchIdentity(storage,prepared){
 const key=identityRecordKey(prepared.document.mint);
 const existing=await readText(storage,key);
 if(existing!=null)return assertIdentityEnvelope(JSON.parse(existing),prepared.document.mint);
 if(typeof storage.compareAndSet==='function'){
  const result=await storage.compareAndSet(key,null,prepared.stored);
  if(result?.conflict)return assertIdentityEnvelope(JSON.parse(await readText(storage,key)),prepared.document.mint);
 }else await storage.put(key,prepared.stored,{httpMetadata:{contentType:'application/json',cacheControl:'public, max-age=31536000, immutable'}});
 const assetKey=`assets/${prepared.sha256}`;
 if(!(await storage.get(assetKey)))await storage.put(assetKey,prepared.documentJson,{httpMetadata:{contentType:'application/json',cacheControl:'public, max-age=31536000, immutable'}});
 return prepared;
}
export function publicIdentityBody(verified){
 return {schema:IDENTITY_SCHEMA,sha256:verified.sha256,uri:`${TOKEN_WEBSITE_ORIGIN}/api/identity/token/${verified.document.mint}`,document:verified.document,limits:IDENTITY_LIMITS};
}
export async function registeredLaunch(db,mint){
 let expected;try{expected=address(mint,'token mint');}catch{throw Error('This token is not a registered Grainpad launch.');}
 const platform=grainpadPlatformId().toBase58();
 const row=await db.prepare('SELECT record FROM launch_index WHERE network=? AND platform_id=? AND mint=?').bind('mainnet-beta',platform,expected).first();
 if(!row?.record)throw Error('This token is not a registered Grainpad launch.');
 let record;try{record=JSON.parse(row.record);}catch{throw Error('This token is not a registered Grainpad launch.');}
 if(record.mint!==expected||record.platformId!==platform||record.verification!=='confirmed-on-chain'||record.network!=='mainnet-beta')throw Error('This token is not a registered Grainpad launch.');
 return record;
}
export async function loadPublicIdentity(db,storage,mint){
 const launch=await registeredLaunch(db,mint);
 const key=identityRecordKey(launch.mint);
 const existing=await readText(storage,key);
 const verified=existing!=null?await assertIdentityEnvelope(JSON.parse(existing),launch.mint):await persistLaunchIdentity(storage,await identityFromLaunchRecord(storage,launch));
 await verifyBoundAssets(storage,verified.document);
 return publicIdentityBody(verified);
}
function tokenInfo(entry,decimals,presentation=null){
 const document=entry.document;
 const twitter=presentation?presentation.twitter:document.twitter;
 const telegram=presentation?presentation.telegram:document.telegram;
 const header=presentation?presentation.header:document.header;
 const extensions={website:document.website};
 if(document.description)extensions.description=document.description;
 if(twitter)extensions.twitter=twitter;
 if(telegram)extensions.telegram=telegram;
 if(presentation?.xCommunity)extensions.xCommunity=presentation.xCommunity;
 if(header){extensions.header=header.uri;extensions.headerSha256=header.sha256;extensions.header600=header.renditions['600x200'].uri;extensions.header600Sha256=header.renditions['600x200'].sha256;}
 if(document.creator)extensions.creator=document.creator;
 if(document.launch){extensions.chain=document.launch.chain;extensions.programId=document.launch.programId;if(document.launch.platformId)extensions.platformId=document.launch.platformId;if(document.launch.pool)extensions.pool=document.launch.pool;if(document.launch.quoteMint)extensions.quoteMint=document.launch.quoteMint;if(document.launch.quoteAsset)extensions.quoteAsset=document.launch.quoteAsset;if(document.launch.slot!=null)extensions.slot=String(document.launch.slot);if(document.launch.signature)extensions.signature=document.launch.signature;}
 extensions.launchedAt=document.sealedAt;
 extensions.identityUri=`${TOKEN_WEBSITE_ORIGIN}/api/identity/token/${document.mint}`;
 extensions.identitySha256=entry.sha256;
 return {
  chainId:SOLANA_MAINNET_CHAIN_ID,address:document.mint,name:document.name,symbol:document.symbol,decimals,
  logoURI:document.image.uri,tags:['grainpad-launch'],extensions,
 };
}
/** Solana/Uniswap token-list shape. Header and identity live in string extensions because the base schema has no header object. */
export function tokenListDocument(entries){
 const tokens=[...entries].sort((a,b)=>a.info.address.localeCompare(b.info.address)).map(entry=>entry.info);
 const launched=tokens.map(token=>token.extensions.launchedAt).filter(Boolean).sort();
 return {
  name:'Grainpad Token List',
  logoURI:`${TOKEN_WEBSITE_ORIGIN}/brand/grain-token.png`,
  keywords:['solana','spl','grainpad',IDENTITY_SCHEMA],
  tags:{'grainpad-launch':{name:'Grainpad launch',description:'Token launched through Grainpad. Extension strings besides website, twitter, telegram and description are Grainpad identity fields. Third parties may show different mutable profile data.'}},
  timestamp:launched.at(-1)||TOKEN_LIST_EPOCH,
  tokens,
  version:{major:TOKEN_LIST_VERSION.major,minor:TOKEN_LIST_VERSION.minor,patch:TOKEN_LIST_VERSION.patch},
 };
}
export async function publicTokenList(db,storage){
 const platform=grainpadPlatformId().toBase58();
 const launches=[];
 let cursor=null;
 do{
  const page=await indexedLaunchPage(db,'mainnet-beta',platform,cursor);
  launches.push(...page.launches);
  cursor=page.nextCursor;
  if(cursor&&launches.length>=TOKEN_LIST_CAP)throw Error('Token list cap exceeded.');
 }while(cursor);
 const entries=[];
 for(const launch of launches){
  if(launch.verification!=='confirmed-on-chain'||launch.network!=='mainnet-beta')continue;
  const identity=await loadPublicIdentity(db,storage,launch.mint);
  const decimals=Number.isInteger(launch.decimals)&&launch.decimals>=0&&launch.decimals<=9?launch.decimals:6;
  let presentation=null;try{presentation=await currentCanonicalPresentation(storage,identity);}catch{presentation=null;}
  entries.push({info:tokenInfo(identity,decimals,presentation)});
 }
 return tokenListDocument(entries);
}
/** Interoperability view. Not the canonical identity document. Banner fields stay off this object so a strict Token Info reader is unchanged. */
export function tokenInfoView(document){
 const links=[{type:'website',label:'Website',url:document.website}];
 if(document.twitter)links.push({type:'twitter',label:'Twitter',url:document.twitter});
 if(document.telegram)links.push({type:'telegram',label:'Telegram',url:document.telegram});
 const body={schemaVersion:TOKEN_INFO_SCHEMA_VERSION,icon:document.image.uri};
 if(document.description)body.description=document.description;
 body.links=links;
 return body;
}
/**
 * Runtime projection of one grainpad.identity.v1 document. Not stored.
 * banner and imageBannerUrl are the same current header URI. Neither is an input.
 * @param {{document:object,sha256:string,uri?:string}} identity
 * @param {{header?:{uri?:string,renditions?:{'600x200'?:{uri?:string}}}|null,twitter?:string,telegram?:string,xCommunity?:string,revision?:number,amendmentSha256?:string|null}|null} [presentation]
 */
export function indexerView(identity,presentation=null){
 const document=identity?.document;
 if(!document||document.schema!==IDENTITY_SCHEMA||typeof identity.sha256!=='string')throw Error('Indexer projection requires grainpad.identity.v1.');
 const current=presentation||{header:document.header??null,twitter:document.twitter||'',telegram:document.telegram||'',xCommunity:'',revision:0,amendmentSha256:null,identitySha256:identity.sha256};
 const body={schema:INDEXER_SCHEMA,mint:document.mint,icon:document.image.uri};
 if(current.header){
  const banner=current.header.uri;
  const small=current.header.renditions?.['600x200']?.uri;
  if(typeof banner==='string'&&banner){body.banner=banner;body.imageBannerUrl=banner;}
  if(typeof small==='string'&&small)body.banner600x200=small;
 }
 body.website=document.website;
 body.twitter=current.twitter||'';
 body.telegram=current.telegram||'';
 body.description=document.description||'';
 if(current.xCommunity)body.xCommunity=current.xCommunity;
 body.identityUri=typeof identity.uri==='string'&&identity.uri?identity.uri:`${TOKEN_WEBSITE_ORIGIN}/api/identity/token/${document.mint}`;
 body.identitySha256=identity.sha256;
 body.revision=current.revision||0;
 body.amendmentSha256=current.amendmentSha256||null;
 if(document.launch){
  const source=document.launch;
  const launch={chain:source.chain,programId:source.programId};
  for(const key of ['platformId','pool','quoteMint','quoteAsset','slot','signature'])if(source[key]!=null&&source[key]!=='')launch[key]=source[key];
  body.launch=launch;
 }
 return body;
}
/** @param {string} sha256 @returns {Record<string, string>} */
export function tokenInfoResponseHeaders(sha256){
 return {...identityResponseHeaders(sha256),'Cache-Control':'public, max-age=31536000, immutable','X-Grainpad-Token-Info':TOKEN_INFO_SCHEMA_VERSION};
}
/** @param {string} sha256 @returns {Record<string, string>} */
export function indexerResponseHeaders(sha256,amendmentSha256=null){
 const headers=identityResponseHeaders(sha256);
 headers['Cache-Control']='public, max-age=300';
 headers.ETag=`"${sha256}:${amendmentSha256||'0'}"`;
 headers['X-Grainpad-Indexer-Schema']=INDEXER_SCHEMA;
 return headers;
}
/** @param {string} [sha256] @returns {Record<string, string>} */
export function identityResponseHeaders(sha256){
 const headers={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'GET, OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type, If-None-Match',
  'Cache-Control':sha256?'public, max-age=300':'no-store',
  'X-Grainpad-Identity-Schema':IDENTITY_SCHEMA,
 };
 if(sha256)headers.ETag=`"${sha256}"`;
 return headers;
}
