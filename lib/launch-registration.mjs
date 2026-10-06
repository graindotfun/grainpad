/** Mint-directed registration into the existing R2 launch records. Never scans the program. */
import {assertCanonicalTokenWebsite} from './token-website.mjs';
import {r2ConditionalEtag} from './r2-conditional-etag.mjs';
import {canonicalLaunchTweet} from './launch-post-link.mjs';
import {Buffer} from 'buffer';
import {PublicKey} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID,unpackMint} from '@solana/spl-token';
import {rewardMintMetadata} from './rewards-metadata.mjs';
import {inspectRewardMint} from './rewards-snapshot.mjs';
import {QUOTES,quoteByMint} from './quote-assets.mjs';
import {isOwnPlatform,reservedIdentity} from './launch-identity.mjs';
import {assetHash} from './verify-launch.mjs';
import {SITE,NETWORKS,identityPolicy} from './site-config.ts';
import {grainpadPlatformId} from './platform-policy.mjs';
import {OFFICIAL_LAUNCH_CREATOR} from './official-launch-policy.mjs';
import {assertMintSuffix} from './vanity-suffix.ts';
import {isPreviousOfficialMint} from './previous-official-mints.mjs';
import {assertMetadataClaim,metadataHashFromUri} from './metadata-publication.mjs';
import {assertIdentityEnvelope,identityFromLaunchRecord,identityRecordKey,persistLaunchIdentity} from './canonical-identity.mjs';
import {applyStoredLaunchIntent} from './identity-amendment.mjs';

export const TOKEN_PROGRAM='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const METADATA_PROGRAM='metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
export const LAUNCH_PROGRAMS={devnet:'DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6','mainnet-beta':'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj'};
export const LAUNCH_FINALIZING='Launch is confirmed and still finalizing. Retry shortly.';
export const AWAITING_FINALIZATION='awaiting-finalization';
export const CONFIRMED_ON_CHAIN='confirmed-on-chain';
export const REVALIDATION_FAILED='revalidation-failed';
/** Bump this when identity or PlatformConfig rules change. The next touch revalidates that mint. */
export const LAUNCH_RECORD_VERSION=5;
export const LAUNCH_IDENTITY_REVISION='reserved-identity-v1';
export class LaunchFinalizingError extends Error{
 constructor(){super(LAUNCH_FINALIZING);this.name='LaunchFinalizingError';}
}

export function launchRecordKey(network,mint){return `launches/${network}/${mint}`;}
export function isLaunchFinalizing(error){return error instanceof LaunchFinalizingError||(error instanceof Error&&error.message===LAUNCH_FINALIZING);}
/** Shared with metadata publication: both call reservedIdentity for the creator, never a second name check. */
export function launchRegistrationIdentity(metadata,creator,mint=metadata?.mint??metadata?.grainpad?.mint){
 const saved=metadata&&typeof metadata==='object'?metadata:{};
 const reserved=reservedIdentity({name:saved.name,symbol:saved.symbol,imageHash:saved.imageHash||imageHashFromUri(saved.image),website:saved.website||saved.external_url||'',twitter:saved.twitter||'',mint},identityPolicy(String(creator||'')));
 if(reserved)return reserved;
 // Upload drafts carry mint at the top level; immutable publications carry it
 // under grainpad. Never infer this binding from the website being checked.
 if([saved.mint,saved.grainpad?.mint].some(bound=>bound!==undefined&&bound!==mint))return 'Token metadata mint binding does not match the actual mint.';
 return null;
}
export function isCurrentLaunchRecord(row,platformId,mint,network){
 return !!row&&row.verification===CONFIRMED_ON_CHAIN&&row.recordVersion===LAUNCH_RECORD_VERSION&&row.identityRevision===LAUNCH_IDENTITY_REVISION&&row.platformId===platformId&&row.mint===mint&&row.network===network;
}

function policy(message){const error=Error(message);error.policy=true;return error;}
/** Caller-supplied attribution. Reject the request; do not retire a stored launch. */
function attribution(message){const error=Error(message);error.attribution=true;return error;}
export function destructiveRegistrationFailure(error){return !!(error&&error.policy&&!error.attribution);}
function account(value){
 if(!value||!Array.isArray(value.data)||typeof value.data[0]!=='string')return null;
 return {owner:value.owner,data:Buffer.from(value.data[0],'base64')};
}
function metadataFields(data){
 if(data.length<70)throw policy('Invalid metadata');
 let cursor=65;const readString=()=>{if(cursor+4>data.length)throw policy('Invalid metadata');const length=data.readUInt32LE(cursor);cursor+=4;if(length>500||cursor+length>data.length)throw policy('Invalid metadata');const value=data.subarray(cursor,cursor+length).toString('utf8').replace(/\0/g,'');cursor+=length;return value;};
 return {name:readString(),symbol:readString(),uri:readString()};
}
function imageHashFromUri(uri){try{return assetHash(uri,SITE.origin);}catch{return undefined;}}
const ARWEAVE_URI=/^https:\/\/arweave\.net\/[A-Za-z0-9_-]{43}$/;
/** #7's archive URI, plus the Grainpad asset store while that uploader is not configured. A provider receipt is neither. */
export function canonicalMetadataUri(uri){
 if(typeof uri==='string'&&uri.startsWith('ipfs://')){try{return {kind:'ipfs',id:metadataHashFromUri(uri,SITE.origin)};}catch{throw policy('Unsupported content-addressed metadata URI.');}}
 let url;try{url=new URL(uri);}catch{throw policy('Metadata URI is not a confirmed archive or Grainpad asset.');}
 if(url.search||url.hash||url.username||url.password)throw policy('Metadata URI is not a confirmed archive or Grainpad asset.');
 if(ARWEAVE_URI.test(`${url.origin}${url.pathname}`))return {kind:'arweave',id:url.pathname.slice(1)};
 try{return {kind:'grainpad',id:assetHash(uri,SITE.origin)};}catch{throw policy('Metadata URI is not a confirmed archive or Grainpad asset.');}
}
function unavailable(message){return Error(message);}
async function digestBytes(bytes){const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}
/** Shared confirmed-launch check. POST /api/launches and discovery both use it, then write the existing R2 record. */
export async function validateConfirmedLaunch({uri,creator,storage,fetchBytes,suppliedHash}){
 const located=canonicalMetadataUri(uri);
 if(located.kind==='ipfs'){
  const claim=(await loadRecord(storage,`owners/${located.id}/${creator}`)).row;
  if(suppliedHash&&suppliedHash!==located.id)throw attribution('On-chain metadata URI does not match this upload.');
  try{const saved=await assertMetadataClaim(claim,located.id,uri,SITE.origin);return {saved,metadataHash:located.id,imageHash:claim.imageHash,creatorMetadataClaimed:true};}catch(error){throw policy(error.message);}
 }
 if(located.kind==='grainpad'){
  const claim=(await loadRecord(storage,`owners/${located.id}/${creator}`)).row;
  if(suppliedHash&&suppliedHash!==located.id)throw attribution('On-chain metadata URI does not match this upload.');
  const asset=(await loadRecord(storage,`assets/${located.id}`)).row;
  const saved=claim?.metadata||asset;
  if(!saved||typeof saved!=='object')throw unavailable('Metadata is not available yet. Retry shortly.');
  try{await assertMetadataClaim(claim||{metadata:saved},located.id,uri,SITE.origin);}catch(error){throw policy(error.message);}
  return {saved,metadataHash:located.id,imageHash:imageHashFromUri(saved.image),creatorMetadataClaimed:!!claim?.metadata};
 }
 if(typeof fetchBytes!=='function')throw unavailable('Metadata is not available yet. Retry shortly.');
 let bytes;try{bytes=await fetchBytes(uri);}catch{throw unavailable('Metadata is not available yet. Retry shortly.');}
 if(!bytes?.length)throw unavailable('Metadata is not available yet. Retry shortly.');
 let saved;try{saved=JSON.parse(new TextDecoder().decode(bytes));}catch{throw policy('Confirmed archive is not launch metadata.');}
 if(!saved||typeof saved!=='object')throw policy('Confirmed archive is not launch metadata.');
 const metadataHash=await digestBytes(bytes);
 if(suppliedHash&&suppliedHash!==metadataHash&&suppliedHash!==located.id)throw attribution('On-chain metadata URI does not match this upload.');
 let imageHash;if(saved.image){
  const image=canonicalMetadataUri(saved.image);
  let imageBytes;try{imageBytes=await fetchBytes(saved.image);}catch{throw unavailable('Metadata is not available yet. Retry shortly.');}
  imageHash=await digestBytes(imageBytes);
  if(image.kind==='grainpad'&&imageHash!==image.id)throw policy('Immutable asset hash mismatch.');
 }
 // Retrieving archive bytes proves their contents, not that this creator signed them.
 const claim=(await loadRecord(storage,`owners/${metadataHash}/${creator}`)).row;
 const creatorMetadataClaimed=!!claim?.metadata&&JSON.stringify(claim.metadata)===JSON.stringify(saved)&&claim.uri===uri;
 return {saved,metadataHash,imageHash,creatorMetadataClaimed};
}
async function loadRecord(storage,key){
 const stored=await storage.get(key);if(!stored)return {etag:null,row:null};
 return {etag:stored.httpEtag??stored.etag??null,row:JSON.parse(await stored.text())};
}
async function accounts(chain,addresses,commitment){
 return chain('getMultipleAccounts',[addresses,{encoding:'base64',commitment}]);
}
function poolAddresses(mint,program){
 return Object.values(QUOTES).map(q=>PublicKey.findProgramAddressSync([Buffer.from('pool'),mint.toBuffer(),new PublicKey(q.mint).toBuffer()],program)[0]);
}
async function findPool(chain,pools,program,commitment){
 const result=await accounts(chain,pools.map(String),commitment);
 const found=pools.flatMap((pool,i)=>result.value[i]?.owner===program.toBase58()?[{pool,raw:result.value[i]}]:[]);
 if(found.length>1)throw Error('Launch pool missing or ambiguous.');
 return found[0]||null;
}
function proofError(proof){
 const incomplete=proof.checks?.some(check=>check.status==='FAIL'&&check.name==='Proof completed');
 return incomplete?Error('Launch rules did not pass finalized on-chain verification.'):policy('Launch rules did not pass finalized on-chain verification.');
}
async function commit(storage,key,latest,next,platformId,mint,network){
 if(latest.row?.verification===CONFIRMED_ON_CHAIN&&next.verification===AWAITING_FINALIZATION){
  if(isCurrentLaunchRecord(latest.row,platformId,mint,network))return latest.row;
  throw new LaunchFinalizingError();
 }
 if(isCurrentLaunchRecord(latest.row,platformId,mint,network)&&next.verification===CONFIRMED_ON_CHAIN)return latest.row;
 if(storage.validationOnly)return next;
 const payload=JSON.stringify(next);
 if(typeof storage.compareAndSet==='function'){
  const result=await storage.compareAndSet(key,latest.etag??null,payload);
  if(!result.conflict)return next;
  if(result.row?.verification===CONFIRMED_ON_CHAIN&&next.verification===AWAITING_FINALIZATION){
   if(isCurrentLaunchRecord(result.row,platformId,mint,network))return result.row;
   throw new LaunchFinalizingError();
  }
  if(isCurrentLaunchRecord(result.row,platformId,mint,network))return result.row;
  throw new LaunchFinalizingError();
 }
 const options=latest.etag?{onlyIf:{etagMatches:r2ConditionalEtag(latest.etag)}}:{onlyIf:{etagDoesNotMatch:'*'}};
 const written=await storage.put(key,payload,options);
 if(written==null){
  const again=await loadRecord(storage,key);
  if(again.row?.verification===CONFIRMED_ON_CHAIN&&next.verification===AWAITING_FINALIZATION){
   if(isCurrentLaunchRecord(again.row,platformId,mint,network))return again.row;
   throw new LaunchFinalizingError();
  }
  if(isCurrentLaunchRecord(again.row,platformId,mint,network))return again.row;
  throw new LaunchFinalizingError();
 }
 return next;
}
/** Best-effort seal. A missing, corrupt, or unavailable identity or amendment must not fail or retire the confirmed launch. */
async function recordCanonicalIdentity(storage,stored){
 if(storage?.validationOnly||stored?.verification!==CONFIRMED_ON_CHAIN)return;
 try{
  const identityObject=await storage.get(identityRecordKey(stored.mint));
  if(identityObject)await assertIdentityEnvelope(JSON.parse(await identityObject.text()),stored.mint);
  else await persistLaunchIdentity(storage,await identityFromLaunchRecord(storage,stored));
 }catch(error){
  const message=error instanceof Error?error.message:'Canonical identity was not stored.';
  console.error(`Canonical identity was not stored for ${stored.mint}. The confirmed launch stays registered. ${message}`);
  return;
 }
 try{await applyStoredLaunchIntent(storage,stored);}
 catch(error){
  const message=error instanceof Error?error.message:'Canonical identity amendment was not stored.';
  console.error(`Canonical identity amendment was not stored for ${stored.mint}. The confirmed launch stays registered. ${message}`);
 }
}

export async function registerLaunch({network,mint:mintInput,owner:ownerInput,metadataHash:hashInput,storage,chain,prove,fetchBytes=undefined}){
 if(network!=='mainnet-beta')throw Error(network==='devnet'?'Launch registration is mainnet-only. The proof path does not verify devnet.':'Unknown network.');
 const mint=new PublicKey(mintInput);
 // Only the server's already-confirmed immutable generation identity admits an
 // official grain address. A body owner/name/suffix claim cannot select it.
 const official=mint.toBase58().endsWith('grain')&&typeof storage.readOfficialIdentity==='function'?await storage.readOfficialIdentity():null;
 const registeredOfficial=official?.generation===2&&official.mint===mint.toBase58()&&/^[a-f0-9]{64}$/.test(official.metadata_hash??'');
 if(!registeredOfficial){try{assertMintSuffix(mint.toBase58());}catch(error){throw policy(error.message);}}
 if(registeredOfficial&&(ownerInput&&ownerInput!==OFFICIAL_LAUNCH_CREATOR||hashInput&&hashInput!==official.metadata_hash))throw attribution('Official registered creator or metadata hash differs.');
 const program=new PublicKey(LAUNCH_PROGRAMS[network]),platformId=grainpadPlatformId();
 const suppliedOwner=ownerInput?new PublicKey(ownerInput):null;
 if(hashInput!=null&&hashInput!==''&&!/^[0-9a-f]{64}$/.test(hashInput))throw Error('Invalid metadata hash.');
 const key=launchRecordKey(network,mint.toBase58()),platform=platformId.toBase58();
 const previous=await loadRecord(storage,key);
 const historicalMint=isPreviousOfficialMint(mint.toBase58())||mint.toBase58()==='FGrHB6tEqXNfMBXZ4xNoa6hKwjWCjjxwijeB5uKLvgrn';
 if(!isCurrentLaunchRecord(previous.row,platform,mint.toBase58(),network)&&!historicalMint&&!registeredOfficial){try{assertMintSuffix(mint.toBase58());}catch(error){throw policy(error.message);}}
 if(isCurrentLaunchRecord(previous.row,platform,mint.toBase58(),network)){
  if(suppliedOwner&&previous.row.creator!==suppliedOwner.toBase58())throw attribution('Pool mint or creator did not match.');
  if(hashInput&&previous.row.metadataHash!==hashInput)throw attribution('On-chain metadata URI does not match this upload.');
  return previous.row;
 }

 try{
  const genesis=await chain('getGenesisHash',[]);
  if(genesis!==NETWORKS[network].genesis)throw Error('Network mismatch.');
  const pools=poolAddresses(mint,program);
  const finalized=await findPool(chain,pools,program,'finalized');
  if(!finalized){
   const confirmed=await findPool(chain,pools,program,'confirmed');
   if(!confirmed)throw Error('Launch pool missing or ambiguous.');
   const pendingPool=account(confirmed.raw);
   if(!pendingPool||pendingPool.data.length<365||!pendingPool.data.subarray(205,237).equals(mint.toBuffer()))throw new LaunchFinalizingError();
   if(pendingPool.data.readBigUInt64LE(101)!==0n)throw policy('Unexpected team vesting allocation.');
   const pendingPlatform=new PublicKey(pendingPool.data.subarray(173,205)).toBase58();
   if(!isOwnPlatform(pendingPlatform,platform))throw policy('This launch did not use Grainpad’s PlatformConfig. Reference-platform launches are not listed.');
   const pendingCreator=new PublicKey(pendingPool.data.subarray(333,365));
   if(suppliedOwner&&!pendingPool.data.subarray(333,365).equals(suppliedOwner.toBuffer()))throw attribution('Pool mint or creator did not match.');
   const pending={
    mint:mint.toBase58(),pool:confirmed.pool.toBase58(),creator:pendingCreator.toBase58(),platformId:pendingPlatform,network,
    verification:AWAITING_FINALIZATION,createdAt:previous.row?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),
   };
   const latest=await loadRecord(storage,key);
   const stored=await commit(storage,key,latest,pending,platform,mint.toBase58(),network);
   if(stored.verification===CONFIRMED_ON_CHAIN)return stored;
   throw new LaunchFinalizingError();
  }

  const metaPda=PublicKey.findProgramAddressSync([Buffer.from('metadata'),new PublicKey(METADATA_PROGRAM).toBuffer(),mint.toBuffer()],new PublicKey(METADATA_PROGRAM))[0];
  const result=await accounts(chain,[finalized.pool.toBase58(),metaPda.toBase58(),mint.toBase58()],'finalized');
  const [poolAcc,metaAcc,mintAcc]=result.value.map(value=>account(value));
  if(!poolAcc||poolAcc.owner!==program.toBase58()||!mintAcc||![TOKEN_PROGRAM,String(TOKEN_2022_PROGRAM_ID)].includes(mintAcc.owner))throw Error('Confirmed launch not found.');
  const data=poolAcc.data;
  if(data.length<365||!data.subarray(205,237).equals(mint.toBuffer()))throw policy('Pool mint or creator did not match.');
  const creator=new PublicKey(data.subarray(333,365));
  if(suppliedOwner&&!data.subarray(333,365).equals(suppliedOwner.toBuffer()))throw attribution('Pool mint or creator did not match.');
  if(data.readBigUInt64LE(101)!==0n)throw policy('Unexpected team vesting allocation.');
  const onchainPlatform=new PublicKey(data.subarray(173,205)).toBase58();
  if(!isOwnPlatform(onchainPlatform,platform))throw policy('This launch did not use Grainpad’s PlatformConfig. Reference-platform launches are not listed.');
  const quote=quoteByMint(new PublicKey(data.subarray(237,269)));
  const proof=await prove(mint,platformId);
  if(proof.status!=='PASS')throw proofError(proof);
  const mintData=mintAcc.data,taxed=mintAcc.owner===String(TOKEN_2022_PROGRAM_ID);
  let md,remainingSupply;
  if(taxed){
   if(!proof.reward||quote.symbol!=='wXMR')throw policy('A verified Grainpad rewards policy is required.');
   const account={...mintAcc,owner:TOKEN_2022_PROGRAM_ID};
   const {token}=inspectRewardMint(mint,account,new PublicKey(proof.reward.collector));
   if(token.supply<=0n||token.supply>1000000000000000n)throw policy('Invalid remaining rewards supply.');
   md=await rewardMintMetadata(mint,account);remainingSupply=String(token.supply);
  }else{
   if(!metaAcc||metaAcc.owner!==METADATA_PROGRAM)throw Error('Confirmed metadata not found.');
   if(mintData.length!==82||mintData.readUInt32LE(0)!==0||mintData.readUInt32LE(46)!==0||mintData[44]!==6||mintData.readBigUInt64LE(36)!==1000000000000000n)throw policy('Token supply or authority settings do not match the launch policy.');
   md=metadataFields(metaAcc.data);remainingSupply=String(unpackMint(mint,{...mintAcc,owner:new PublicKey(TOKEN_PROGRAM)}).supply);
   if(!metaAcc.data.subarray(33,65).equals(mint.toBuffer()))throw policy('Metadata mint mismatch.');
  }
  if(suppliedOwner&&hashInput){
   const claim=(await loadRecord(storage,`owners/${hashInput}/${creator.toBase58()}`)).row;
   if(!claim)throw unavailable('No signed metadata found for this wallet.');
  }
  const validated=await validateConfirmedLaunch({uri:md.uri,creator:creator.toBase58(),storage,fetchBytes,suppliedHash:hashInput});
  const saved=validated.saved,metadataHash=validated.metadataHash;
  if(md.name!==saved.name||md.symbol!==saved.symbol)throw policy('Metadata identity mismatch.');
  const website=saved.website||saved.external_url||'',twitter=saved.twitter||'';
  const reserved=launchRegistrationIdentity({...saved,imageHash:validated.imageHash},creator.toBase58(),mint.toBase58());
  if(reserved)throw policy(reserved);
  assertCanonicalTokenWebsite(saved,mint.toBase58());
  const row={
   tokenProgram:mintAcc.owner,mint:mint.toBase58(),pool:finalized.pool.toBase58(),creator:creator.toBase58(),platformId:onchainPlatform,
   platformName:'Grainpad',quoteAsset:quote.symbol,quoteMint:quote.mint,quoteDecimals:quote.decimals,proofSlot:proof.slot,
   network,name:saved.name,symbol:saved.symbol,image:md.uri.startsWith('ipfs://')?`${SITE.origin}/api/assets/${validated.imageHash}`:saved.image,description:saved.description||'',website,twitter,uri:md.uri,metadataHash,
   ...(saved.launchTweet?{launchTweet:canonicalLaunchTweet(saved.launchTweet)}:{}),
   creatorMetadataClaimed:validated.creatorMetadataClaimed,
   declaredCreatorBuy:validated.creatorMetadataClaimed&&saved.grainpad?.quoteAsset===quote.symbol?saved.grainpad.declaredCreatorBuy??null:null,
   createdAt:previous.row?.createdAt||new Date().toISOString(),verification:CONFIRMED_ON_CHAIN,mintAuthority:null,freezeAuthority:null,
   supply:'1000000000000000',   remainingSupply,rewards:taxed?proof.reward:null,decimals:6,recordVersion:LAUNCH_RECORD_VERSION,identityRevision:LAUNCH_IDENTITY_REVISION,
  };
  const stored=await commit(storage,key,await loadRecord(storage,key),row,platform,mint.toBase58(),network);
  if(!storage.validationOnly&&stored?.verification===CONFIRMED_ON_CHAIN&&stored.mint===row.mint&&stored.metadataHash===row.metadataHash&&stored.creator===row.creator)await recordCanonicalIdentity(storage,stored);
  return stored;
 }catch(error){
  if(destructiveRegistrationFailure(error)&&previous.row?.verification===CONFIRMED_ON_CHAIN){
   const retired=await commit(storage,key,await loadRecord(storage,key),{
    mint:mint.toBase58(),network,platformId:previous.row.platformId,creator:previous.row.creator,verification:REVALIDATION_FAILED,
    recordVersion:LAUNCH_RECORD_VERSION,identityRevision:LAUNCH_IDENTITY_REVISION,createdAt:previous.row.createdAt,retiredAt:new Date().toISOString(),reason:error.message,
   },platform,mint.toBase58(),network);
   if(isCurrentLaunchRecord(retired,platform,mint.toBase58(),network))return retired;
  }
  throw error;
 }
}
