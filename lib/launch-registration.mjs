/** Register or recover a Grainpad launch into the existing R2 launch records. Mint-directed only; never scans the program. */
import {Buffer} from 'buffer';
import {PublicKey} from '@solana/web3.js';
import {QUOTES,quoteByMint} from './quote-assets.mjs';
import {isOwnPlatform,reservedIdentity} from './launch-identity.mjs';
import {assetHash} from './verify-launch.mjs';
import {SITE,NETWORKS,identityPolicy} from './site-config.ts';
import {grainpadPlatformId} from './platform-policy.mjs';
import {assertMintSuffix} from './vanity-suffix.ts';

export const TOKEN_PROGRAM='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const METADATA_PROGRAM='metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
export const LAUNCH_PROGRAMS={devnet:'DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6','mainnet-beta':'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj'};
export const LAUNCH_FINALIZING='Launch is confirmed and still finalizing. Retry shortly.';
export const AWAITING_FINALIZATION='awaiting-finalization';
export const CONFIRMED_ON_CHAIN='confirmed-on-chain';
export class LaunchFinalizingError extends Error{
 constructor(){super(LAUNCH_FINALIZING);this.name='LaunchFinalizingError';}
}

export function launchRecordKey(network,mint){return `launches/${network}/${mint}`;}
export function isLaunchFinalizing(error){return error instanceof LaunchFinalizingError||(error instanceof Error&&error.message===LAUNCH_FINALIZING);}

function account(value,encoding='base64'){
 if(!value||!Array.isArray(value.data)||typeof value.data[0]!=='string')return null;
 return {owner:value.owner,data:Buffer.from(value.data[0],encoding)};
}
function metadataFields(data){
 if(data.length<70)throw Error('Invalid metadata');
 let cursor=65;const readString=()=>{if(cursor+4>data.length)throw Error('Invalid metadata');const length=data.readUInt32LE(cursor);cursor+=4;if(length>500||cursor+length>data.length)throw Error('Invalid metadata');const value=data.subarray(cursor,cursor+length).toString('utf8').replace(/\0/g,'');cursor+=length;return value;};
 return {name:readString(),symbol:readString(),uri:readString()};
}
function imageHashFromUri(uri){
 try{return assetHash(uri,SITE.origin);}catch{return undefined;}
}
async function readJson(storage,key){
 const stored=await storage.get(key);if(!stored)return null;
 return JSON.parse(await stored.text());
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

async function persistPending(storage,key,row){
 const existing=await readJson(storage,key);
 if(existing?.verification===CONFIRMED_ON_CHAIN)return existing;
 await storage.put(key,JSON.stringify(row));
}

export async function registerLaunch({network,mint:mintInput,owner:ownerInput,metadataHash:hashInput,storage,chain,prove}){
 if(network!=='devnet'&&network!=='mainnet-beta')throw Error('Unknown network.');
 const mint=new PublicKey(mintInput),program=new PublicKey(LAUNCH_PROGRAMS[network]),platformId=grainpadPlatformId();
 assertMintSuffix(mint.toBase58());
 const suppliedOwner=ownerInput?new PublicKey(ownerInput):null;
 if(hashInput!=null&&hashInput!==''&&!/^[0-9a-f]{64}$/.test(hashInput))throw Error('Invalid metadata hash.');
 const key=launchRecordKey(network,mint.toBase58());
 const existing=await readJson(storage,key);
 if(existing?.verification===CONFIRMED_ON_CHAIN&&existing.mint===mint.toBase58())return existing;

 const genesis=await chain('getGenesisHash',[]);
 if(genesis!==NETWORKS[network].genesis)throw Error('Network mismatch.');

 const pools=poolAddresses(mint,program);
 const finalized=await findPool(chain,pools,program,'finalized');
 if(!finalized){
  const confirmed=await findPool(chain,pools,program,'confirmed');
  if(!confirmed)throw Error('Launch pool missing or ambiguous.');
  const pendingPool=account(confirmed.raw);
  if(!pendingPool||pendingPool.data.length<365||!pendingPool.data.subarray(205,237).equals(mint.toBuffer()))
   throw new LaunchFinalizingError();
  if(pendingPool.data.readBigUInt64LE(101)!==0n)throw Error('Unexpected team vesting allocation.');
  const pendingPlatform=new PublicKey(pendingPool.data.subarray(173,205)).toBase58();
  if(!isOwnPlatform(pendingPlatform,platformId.toBase58()))throw Error('This launch did not use Grainpad’s PlatformConfig. Reference-platform launches are not listed.');
  const pendingCreator=new PublicKey(pendingPool.data.subarray(333,365));
  if(suppliedOwner&&!pendingPool.data.subarray(333,365).equals(suppliedOwner.toBuffer()))throw Error('Pool mint or creator did not match.');
  await persistPending(storage,key,{
   mint:mint.toBase58(),pool:confirmed.pool.toBase58(),creator:pendingCreator.toBase58(),platformId:pendingPlatform,network,
   verification:AWAITING_FINALIZATION,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),
  });
  throw new LaunchFinalizingError();
 }
 const pool=finalized.pool;

 const metaPda=PublicKey.findProgramAddressSync([Buffer.from('metadata'),new PublicKey(METADATA_PROGRAM).toBuffer(),mint.toBuffer()],new PublicKey(METADATA_PROGRAM))[0];
 const result=await accounts(chain,[pool.toBase58(),metaPda.toBase58(),mint.toBase58()],'finalized');
 const [poolAcc,metaAcc,mintAcc]=result.value.map(value=>account(value));
 if(!poolAcc||poolAcc.owner!==program.toBase58()||!metaAcc||metaAcc.owner!==METADATA_PROGRAM||!mintAcc||mintAcc.owner!==TOKEN_PROGRAM)
  throw Error('Confirmed launch not found.');

 const data=poolAcc.data;
 if(data.length<365||!data.subarray(205,237).equals(mint.toBuffer()))throw Error('Pool mint or creator did not match.');
 const creator=new PublicKey(data.subarray(333,365));
 if(suppliedOwner&&!data.subarray(333,365).equals(suppliedOwner.toBuffer()))throw Error('Pool mint or creator did not match.');
 if(data.readBigUInt64LE(101)!==0n)throw Error('Unexpected team vesting allocation.');
 const onchainPlatform=new PublicKey(data.subarray(173,205)).toBase58();
 if(!isOwnPlatform(onchainPlatform,platformId.toBase58()))throw Error('This launch did not use Grainpad’s PlatformConfig. Reference-platform launches are not listed.');
 const quote=quoteByMint(new PublicKey(data.subarray(237,269)));

 const proof=await prove(mint,platformId);
 if(proof.status!=='PASS')throw Error('Launch rules did not pass finalized on-chain verification.');
 const mintData=mintAcc.data;
 if(mintData.length!==82||mintData.readUInt32LE(0)!==0||mintData.readUInt32LE(46)!==0||mintData[44]!==6||mintData.readBigUInt64LE(36)!==1000000000000000n)
  throw Error('Token supply or authority settings do not match the launch policy.');
 const md=metadataFields(metaAcc.data);
 if(!metaAcc.data.subarray(33,65).equals(mint.toBuffer()))throw Error('Metadata mint mismatch.');
 const metadataHash=assetHash(md.uri,SITE.origin);
 if(hashInput&&hashInput!==metadataHash)throw Error('On-chain metadata URI does not match this upload.');

 const claim=await readJson(storage,`owners/${metadataHash}/${creator.toBase58()}`);
 if(suppliedOwner&&hashInput&&!claim)throw Error('No signed metadata found for this wallet.');
 const saved=claim?.metadata||await readJson(storage,`assets/${metadataHash}`);
 if(!saved||typeof saved!=='object')throw Error('No signed metadata found for this wallet.');
 if(md.name!==saved.name||md.symbol!==saved.symbol)throw Error('Metadata identity mismatch.');

 const website=saved.website||saved.external_url||'';
 const twitter=saved.twitter||'';
 const imageHash=imageHashFromUri(saved.image);
 const reserved=reservedIdentity({name:saved.name,symbol:saved.symbol,imageHash,website,twitter},identityPolicy(creator.toBase58()));
 if(reserved)throw Error(reserved);

 const row={
  tokenProgram:mintAcc.owner,mint:mint.toBase58(),pool:pool.toBase58(),creator:creator.toBase58(),platformId:onchainPlatform,
  platformName:'Grainpad',quoteAsset:quote.symbol,quoteMint:quote.mint,quoteDecimals:quote.decimals,proofSlot:proof.slot,
  network,name:saved.name,symbol:saved.symbol,image:saved.image,description:saved.description||'',website,twitter,uri:md.uri,
  createdAt:existing?.createdAt||new Date().toISOString(),verification:CONFIRMED_ON_CHAIN,mintAuthority:null,freezeAuthority:null,
  supply:'1000000000000000',decimals:6,
 };
 await storage.put(key,JSON.stringify(row));
 return row;
}
