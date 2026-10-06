import {QUOTES} from './quote-assets.mjs';
import {REWARDS_DEPLOYMENT} from './rewards-deployment.mjs';
import {rewardMintMetadata} from './rewards-metadata.mjs';
import {assertCanonicalTokenWebsite} from './token-website.mjs';
import {COMPUTE_PROGRAM,LIGHTHOUSE_PROGRAM} from './wallet-transaction-policy.mjs';
/** Read-only launch verification shared by the CLI and CA publication gate. */
import {getLaunchProof} from './launch-proof.mjs';
import {OFFICIAL_ARTWORK,isPng} from './official-artwork.mjs';
import {Buffer} from 'buffer';import bs58 from 'bs58';import {PublicKey} from '@solana/web3.js';import {ASSOCIATED_TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';import * as s from '@raydium-io/raydium-sdk-v2';import {PLATFORM_SETTINGS} from './platform-settings.mjs';
import {OFFICIAL_DECLARED_CREATOR_BUY,OFFICIAL_LAUNCH_CREATOR,OFFICIAL_LAUNCH_PINS} from './official-launch-policy.mjs';
import {officialAtomicInstructions} from './official-launch-shape.mjs';
import {isPreviousOfficialMint} from './previous-official-mints.mjs';
import {canonicalOfficialTwitter} from './official-metadata.mjs';
import {assertOfficialIdentityPins} from './official-pin-consistency.mjs';
export const LAUNCH_EXPECTED={...PLATFORM_SETTINGS,founder:OFFICIAL_LAUNCH_CREATOR,config:QUOTES.wXMR.config,officialMint:/** @type {string|null} */(REWARDS_DEPLOYMENT.officialGrainMint),collector:REWARDS_DEPLOYMENT.collector,taxBps:200,metadataHash:null,cpConfig:'CRRS5ieQmBrZjWhcj99JuGrT5tyuWDaGAXLXLFjbAtjQ',name:'Grainpad',symbol:'GRAIN',origin:'https://grainpad.fun',twitter:'https://x.com/GrainXMR',imageHash:OFFICIAL_ARTWORK.sha256,declaredCreatorBuy:OFFICIAL_DECLARED_CREATOR_BUY};
export function metadataFields(data){let offset=65;const read=()=>{if(offset+4>data.length)throw Error('Truncated metadata');const n=data.readUInt32LE(offset);offset+=4;if(n>1000||offset+n>data.length)throw Error('Invalid metadata string');const v=data.subarray(offset,offset+n).toString('utf8').replace(/\0/g,'').trim();offset+=n;return v;};return {name:read(),symbol:read(),uri:read()};}
export function assetHash(uri,origin){const u=new URL(uri);if(u.origin!==origin||!/^\/api\/assets\/[a-f0-9]{64}$/.test(u.pathname)||u.search||u.hash)throw Error('Metadata/image must use the immutable Grainpad asset store.');return u.pathname.split('/').pop();}
export async function verifiedAsset(uri,origin,loader=async url=>{const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000)});if(r.status>=300&&r.status<400)throw Error('Asset redirect refused');if(!r.ok)throw Error('Asset unavailable');return new Uint8Array(await r.arrayBuffer());}){const hash=assetHash(uri,origin),bytes=await loader(uri);if(bytes.length>2000000)throw Error('Asset is too large');const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==digest)throw Error('Immutable asset hash mismatch');return bytes;}
export async function verifyOfficialArtwork(uri,expected=LAUNCH_EXPECTED,loadAsset){
 const image=await verifiedAsset(uri,expected.origin,loadAsset);
 return assetHash(uri,expected.origin)===expected.imageHash&&isPng(image);
}
export async function verifyLaunch({connection,platform,pool,mint,expected=LAUNCH_EXPECTED,loadAsset,creationSignature=undefined}){
 const checks=[];const check=(name,pass,observed)=>checks.push({name,status:pass?'PASS':'FAIL',observed});
 try{
  assertOfficialIdentityPins({pins:OFFICIAL_LAUNCH_PINS,deployment:REWARDS_DEPLOYMENT,expected:LAUNCH_EXPECTED});
  if(!mint||isPreviousOfficialMint(mint)||expected.officialMint!==mint||!Number.isInteger(expected.taxBps)||!expected.metadataHash||!expected.collector)throw Error('Exact official mint, transfer tax, metadata hash and collector need a reviewed owner configuration.');
  const pid=new PublicKey(platform),poolId=new PublicKey(pool),mid=new PublicKey(mint),admin=new PublicKey(expected.admin),founder=new PublicKey(expected.founder);
  const proof=await getLaunchProof(connection,mid,pid,{collector:expected.collector});
  check('canonical-existing-launch-proof',proof.status==='PASS'&&proof.pool===pool&&proof.reward?.taxBps===expected.taxBps,proof);
  if(proof.status!=='PASS')throw Error('Canonical launch verification failed.');
  const read=await connection.getMultipleAccountsInfoAndContext([poolId,mid],{commitment:'finalized',minContextSlot:proof.slot});
  const [po,ma]=read.value;
  if(!po?.owner.equals(s.LAUNCHPAD_PROGRAM)||!ma?.owner.equals(TOKEN_2022_PROGRAM_ID))throw Error('Official launch requires Token-2022 and a LaunchLab pool.');
  check('admin-PDA',s.getPdaPlatformId(s.LAUNCHPAD_PROGRAM,admin).publicKey.equals(pid),{admin:expected.admin,platform});
  const q=s.LaunchpadPool.decode(po.data);
  check('official-creator-and-pool',q.creator.equals(founder)&&q.mintA.equals(mid)&&q.platformId.equals(pid)&&q.mintB.toBase58()===QUOTES.wXMR.mint&&q.configId.toBase58()===QUOTES.wXMR.config&&s.getPdaLaunchpadPoolId(s.LAUNCHPAD_PROGRAM,mid,new PublicKey(QUOTES.wXMR.mint)).publicKey.equals(poolId),{creator:String(q.creator),quote:String(q.mintB)});
  const onchain=await rewardMintMetadata(mid,ma);
  check('metadata-identity',onchain.name===expected.name&&onchain.symbol===expected.symbol,onchain);
  check('approved-metadata-hash',assetHash(onchain.uri,expected.origin)===expected.metadataHash,onchain.uri);
  const body=JSON.parse(new TextDecoder().decode(await verifiedAsset(onchain.uri,expected.origin,loadAsset)));
  assertCanonicalTokenWebsite(body,mint);
  check('metadata-image',await verifyOfficialArtwork(body.image,expected,loadAsset),body.image);
  const expectedTwitter=canonicalOfficialTwitter(expected.twitter);
  check('metadata-links',body.name===expected.name&&body.symbol===expected.symbol&&body.twitter===expectedTwitter&&(body.extensions?.twitter===undefined||body.extensions.twitter===expectedTwitter),{website:body.website,twitter:body.twitter});
  const atomic=officialAtomicInstructions({mint:mid,name:expected.name,symbol:expected.symbol,uri:onchain.uri,taxBps:expected.taxBps,admin,creator:founder,platform:pid});
  // Verify the creation transaction, so unrelated traders cannot block CA publication by buying first.
  // The automatic publisher supplies the stored reservation signature. Never
  // replace a failed pinned lookup with a different transaction from recent history.
  const history=creationSignature?[{signature:creationSignature}]:await connection.getSignaturesForAddress(mid,{limit:100},'finalized');let creation=null;
  const decodeData=data=>{if(Buffer.isBuffer(data)||data instanceof Uint8Array)return Buffer.from(data);if(typeof data!=='string'||!data)return null;if(/[+/=]/.test(data))return Buffer.from(data,'base64');return Buffer.from(bs58.decode(data));};
  const accountKeysOf=tx=>{const message=tx.transaction?.message??tx.message,meta=tx.meta??{};if(message?.staticAccountKeys){const loaded=[...(meta.loadedAddresses?.writable??[]),...(meta.loadedAddresses?.readonly??[])];return [...message.staticAccountKeys,...loaded].map(key=>key instanceof PublicKey?key:new PublicKey(key));}const listed=(message?.accountKeys??[]).map(key=>typeof key==='string'?key:key.pubkey);const loaded=[...(meta.loadedAddresses?.writable??[]),...(meta.loadedAddresses?.readonly??[])];return [...listed,...loaded].map(key=>new PublicKey(key));};
  const listedInstructions=(tx,keys)=>{const message=tx.transaction?.message??tx.message,compiled=message?.compiledInstructions??message?.instructions??[];return compiled.map(ix=>{if(Number.isInteger(ix.programIdIndex)){const indexes=ix.accountKeyIndexes??ix.accounts;return {programId:keys[ix.programIdIndex],data:decodeData(ix.data)??Buffer.alloc(0),accounts:indexes.map(index=>keys[index])};}if(ix.parsed)return {programId:new PublicKey(ix.programId),parsed:ix.parsed,data:null,accounts:null};return {programId:new PublicKey(ix.programId),data:decodeData(ix.data),accounts:(ix.accounts??[]).map(account=>account instanceof PublicKey?account:new PublicKey(account.pubkey??account))};});};
  const sameInstruction=(ix,want)=>{if(ix.parsed?.type==='createIdempotent'&&want.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)){const info=ix.parsed.info??{},at=index=>want.keys[index].pubkey.toBase58();return info.source===at(0)&&info.account===at(1)&&info.wallet===at(2)&&info.mint===at(3);}if(!ix.data||!ix.accounts)return false;return ix.programId.equals(want.programId)&&ix.data.equals(Buffer.from(want.data))&&ix.accounts.length===want.keys.length&&ix.accounts.every((key,index)=>key.equals(want.keys[index].pubkey));};
  const quote=new PublicKey(QUOTES.wXMR.mint),auth=s.getPdaLaunchpadAuth(s.LAUNCHPAD_PROGRAM).publicKey.toBase58();
  const structural=new Set([String(atomic.vaultA),String(atomic.vaultB),String(s.getPdaPlatformVault(s.LAUNCHPAD_PROGRAM,pid,mid).publicKey),String(s.getPdaPlatformVault(s.LAUNCHPAD_PROGRAM,pid,quote).publicKey),String(s.getPdaCreatorVault(s.LAUNCHPAD_PROGRAM,founder,mid).publicKey),String(s.getPdaCreatorVault(s.LAUNCHPAD_PROGRAM,founder,quote).publicKey)]);
  for(const h of history.filter(x=>!x.err).slice(-5).reverse()){
   const tx=typeof connection.getTransaction==='function'?await connection.getTransaction(h.signature,{maxSupportedTransactionVersion:0,commitment:'finalized'}):await connection.getParsedTransaction(h.signature,{maxSupportedTransactionVersion:0,commitment:'finalized'});if(!tx||!tx.meta||tx.meta.err||!tx.transaction?.signatures?.includes(h.signature))continue;
   const keys=accountKeysOf(tx),business=listedInstructions(tx,keys).filter(ix=>ix.programId&&![COMPUTE_PROGRAM,LIGHTHOUSE_PROGRAM].includes(ix.programId.toBase58()));
   if(business.length!==atomic.instructions.length||!atomic.instructions.every((want,index)=>sameInstruction(business[index],want)))continue;
   const rows=Array.isArray(tx.meta.postTokenBalances)?tx.meta.postTokenBalances.filter(row=>row.mint===mint):null;
   const pre=new Map((tx.meta.preTokenBalances||[]).filter(row=>row.mint===mint).map(row=>[row.owner,BigInt(row.uiTokenAmount.amount)]));
   const founderRow=rows?.find(row=>row.owner===expected.founder);
   const founderPre=pre.get(expected.founder)||0n;
   const founderPost=founderRow?BigInt(founderRow.uiTokenAmount.amount):null;
   const otherCredit=rows?.some(row=>{if(row.owner===expected.founder||row.owner===auth)return false;const account=Number.isInteger(row.accountIndex)?keys[row.accountIndex]?.toBase58():null;if(account&&structural.has(account))return false;return BigInt(row.uiTokenAmount.amount)>(pre.get(row.owner)||0n);});
   const buyOutput=founderPre===0n&&founderPost!==null?founderPost:null;
   const declared=buyOutput!==null&&buyOutput>=BigInt(OFFICIAL_DECLARED_CREATOR_BUY.minOut)&&otherCredit!==true;
   creation={signature:h.signature,declared,buyOutput:buyOutput?.toString()??null,founderBalance:founderPost?.toString()??null};break;
  }
  check('T0-creation-declared-creator-buy',!!creation?.declared&&creation.founderBalance===creation.buyOutput,creation||'Creation transaction not found in bounded history; manual historical verification required.');
 }catch(e){check('verification-completed',false,e instanceof Error?e.message:String(e));}
 return {status:checks.every(c=>c.status==='PASS')?'PASS':'FAIL',checkedAt:new Date().toISOString(),platform,pool,mint,readOnly:true,checks,note:'T0 checks the verified creation transaction and founder balance at creation. Later trades or permissionless transfers to the founder do not invalidate publication; it is not proof that the founder never traded later. This report does not verify migration keeper coverage.'};
}
