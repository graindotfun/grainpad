import {QUOTES} from './quote-assets.mjs';
import {REWARDS_DEPLOYMENT} from './rewards-deployment.mjs';
import {rewardMintMetadata} from './rewards-metadata.mjs';
import {assertCanonicalTokenWebsite} from './token-website.mjs';
import {COMPUTE_PROGRAM,LIGHTHOUSE_PROGRAM} from './wallet-transaction-policy.mjs';
/** Read-only launch verification shared by the CLI and CA publication gate. */
import {getLaunchProof} from './launch-proof.mjs';
import {OFFICIAL_ARTWORK,isPng} from './official-artwork.mjs';
import {Buffer} from 'buffer';import bs58 from 'bs58';import {PublicKey} from '@solana/web3.js';import {TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';import * as s from '@raydium-io/raydium-sdk-v2';import {PLATFORM_SETTINGS} from './platform-settings.mjs';
import {OFFICIAL_DECLARED_CREATOR_BUY,OFFICIAL_LAUNCH_CREATOR,OFFICIAL_LAUNCH_PINS} from './official-launch-policy.mjs';
import {officialAtomicInstructions} from './official-launch-shape.mjs';
import {isPreviousOfficialMint} from './previous-official-mints.mjs';
import {assertOfficialIdentityPins} from './official-pin-consistency.mjs';
export const LAUNCH_EXPECTED={...PLATFORM_SETTINGS,founder:OFFICIAL_LAUNCH_CREATOR,config:QUOTES.wXMR.config,officialMint:REWARDS_DEPLOYMENT.officialGrainMint,collector:REWARDS_DEPLOYMENT.collector,taxBps:200,metadataHash:null,cpConfig:'CRRS5ieQmBrZjWhcj99JuGrT5tyuWDaGAXLXLFjbAtjQ',name:'Grainpad',symbol:'GRAIN',origin:'https://grainpad.fun',twitter:'https://x.com/GrainXMR',imageHash:OFFICIAL_ARTWORK.sha256,declaredCreatorBuy:OFFICIAL_DECLARED_CREATOR_BUY};
export function metadataFields(data){let offset=65;const read=()=>{if(offset+4>data.length)throw Error('Truncated metadata');const n=data.readUInt32LE(offset);offset+=4;if(n>1000||offset+n>data.length)throw Error('Invalid metadata string');const v=data.subarray(offset,offset+n).toString('utf8').replace(/\0/g,'').trim();offset+=n;return v;};return {name:read(),symbol:read(),uri:read()};}
export function assetHash(uri,origin){const u=new URL(uri);if(u.origin!==origin||!/^\/api\/assets\/[a-f0-9]{64}$/.test(u.pathname)||u.search||u.hash)throw Error('Metadata/image must use the immutable Grainpad asset store.');return u.pathname.split('/').pop();}
export async function verifiedAsset(uri,origin,loader=async url=>{const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Asset unavailable');return new Uint8Array(await r.arrayBuffer());}){const hash=assetHash(uri,origin),bytes=await loader(uri);if(bytes.length>2000000)throw Error('Asset is too large');const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==digest)throw Error('Immutable asset hash mismatch');return bytes;}
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
  check('metadata-links',body.name===expected.name&&body.symbol===expected.symbol&&(body.twitter||body.extensions?.twitter)===expected.twitter,{website:body.website,twitter:body.twitter||body.extensions?.twitter});
  const atomic=officialAtomicInstructions({mint:mid,name:expected.name,symbol:expected.symbol,uri:onchain.uri,taxBps:expected.taxBps,admin,creator:founder,platform:pid});
  // Verify the creation transaction, so unrelated traders cannot block CA publication by buying first.
  // The automatic publisher supplies the stored reservation signature. Never
  // replace a failed pinned lookup with a different transaction from recent history.
  const history=creationSignature?[{signature:creationSignature}]:await connection.getSignaturesForAddress(mid,{limit:100},'finalized');let creation=null;
  const sameInstruction=(ix,want)=>ix.programId.equals(want.programId)&&typeof ix.data==='string'&&Buffer.from(bs58.decode(ix.data)).equals(want.data)&&ix.accounts?.length===want.keys.length&&ix.accounts.every((key,index)=>key.equals(want.keys[index].pubkey));
  for(const h of history.filter(x=>!x.err).slice(-5).reverse()){
   const tx=await connection.getParsedTransaction(h.signature,{maxSupportedTransactionVersion:1,commitment:'finalized'});if(!tx||!tx.meta||tx.meta.err||!tx.transaction.signatures?.includes(h.signature))continue;
   const ixs=tx.transaction.message.instructions;
   const business=ixs.filter(ix=>![COMPUTE_PROGRAM,LIGHTHOUSE_PROGRAM].includes(ix.programId.toBase58()));
   if(business.length!==atomic.instructions.length||!atomic.instructions.every((want,index)=>sameInstruction(business[index],want)))continue;
   const rows=Array.isArray(tx.meta.postTokenBalances)?tx.meta.postTokenBalances.filter(row=>row.mint===mint):null;
   const pre=new Map((tx.meta.preTokenBalances||[]).filter(row=>row.mint===mint).map(row=>[row.owner,BigInt(row.uiTokenAmount.amount)]));
   const founder=rows?.find(row=>row.owner===expected.founder);
   const founderPre=pre.get(expected.founder)||0n;
   const founderPost=founder?BigInt(founder.uiTokenAmount.amount):null;
   const otherCredit=rows?.some(row=>row.owner!==expected.founder&&BigInt(row.uiTokenAmount.amount)>(pre.get(row.owner)||0n));
   const buyOutput=founderPre===0n&&founderPost!==null?founderPost:null;
   const declared=buyOutput!==null&&buyOutput>=BigInt(OFFICIAL_DECLARED_CREATOR_BUY.minOut)&&otherCredit!==true;
   creation={signature:h.signature,declared,buyOutput:buyOutput?.toString()??null,founderBalance:founderPost?.toString()??null};break;
  }
  check('T0-creation-declared-creator-buy',!!creation?.declared&&creation.founderBalance===creation.buyOutput,creation||'Creation transaction not found in bounded history; manual historical verification required.');
 }catch(e){check('verification-completed',false,e instanceof Error?e.message:String(e));}
 return {status:checks.every(c=>c.status==='PASS')?'PASS':'FAIL',checkedAt:new Date().toISOString(),platform,pool,mint,readOnly:true,checks,note:'T0 checks the verified creation transaction and founder balance at creation. Later trades or permissionless transfers to the founder do not invalidate publication; it is not proof that the founder never traded later. This report does not verify migration keeper coverage.'};
}
