/** Read-only launch verification shared by the CLI and CA publication gate. */
import {getLaunchProof} from './launch-proof.mjs';
import {OFFICIAL_ARTWORK,isPng} from './official-artwork.mjs';
import {Buffer} from 'buffer';import bs58 from 'bs58';import {PublicKey} from '@solana/web3.js';import {NATIVE_MINT,TOKEN_PROGRAM_ID,unpackMint,unpackAccount} from '@solana/spl-token';import * as s from '@raydium-io/raydium-sdk-v2';import {PLATFORM_SETTINGS} from './platform-settings.mjs';
export const LAUNCH_EXPECTED={...PLATFORM_SETTINGS,config:'6s1xP3hpbAfFoNtUNF8mfHsjr2Bd97JxFJRWLbL6aHuX',cpConfig:'CRRS5ieQmBrZjWhcj99JuGrT5tyuWDaGAXLXLFjbAtjQ',name:'Grainpad',symbol:'GRAIN',origin:'https://grainpad.fun',twitter:'https://x.com/GrainXMR',imageHash:OFFICIAL_ARTWORK.sha256};
export function metadataFields(data){let offset=65;const read=()=>{if(offset+4>data.length)throw Error('Truncated metadata');const n=data.readUInt32LE(offset);offset+=4;if(n>1000||offset+n>data.length)throw Error('Invalid metadata string');const v=data.subarray(offset,offset+n).toString('utf8').replace(/\0/g,'').trim();offset+=n;return v;};return {name:read(),symbol:read(),uri:read()};}
export function assetHash(uri,origin){const u=new URL(uri);if(u.origin!==origin||!/^\/api\/assets\/[a-f0-9]{64}$/.test(u.pathname)||u.search||u.hash)throw Error('Metadata/image must use the immutable Grainpad asset store.');return u.pathname.split('/').pop();}
export async function verifiedAsset(uri,origin,loader=async url=>{const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Asset unavailable');return new Uint8Array(await r.arrayBuffer());}){const hash=assetHash(uri,origin),bytes=await loader(uri);if(bytes.length>2000000)throw Error('Asset is too large');const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==digest)throw Error('Immutable asset hash mismatch');return bytes;}
export async function verifyOfficialArtwork(uri,expected=LAUNCH_EXPECTED,loadAsset){
 const image=await verifiedAsset(uri,expected.origin,loadAsset);
 return assetHash(uri,expected.origin)===expected.imageHash&&isPng(image);
}
export async function verifyLaunch({connection,platform,pool,mint,expected=LAUNCH_EXPECTED,loadAsset}){
 const checks=[];const check=(name,pass,observed)=>checks.push({name,status:pass?'PASS':'FAIL',observed});
 try{
  const pid=new PublicKey(platform),poolId=new PublicKey(pool),mid=new PublicKey(mint),admin=new PublicKey(expected.admin),founder=new PublicKey(expected.founder);
  const proof=await getLaunchProof(connection,mid,pid);check('enforced-both-quote-rules',proof.status==='PASS',proof);
  const metadataId=s.getPdaMetadataKey(mid).publicKey;
  const [pa,po,ma,ca,meta]=await connection.getMultipleAccountsInfo([pid,poolId,mid,new PublicKey(expected.config),metadataId],'finalized');
  check('platform-exists',!!pa?.owner.equals(s.LAUNCHPAD_PROGRAM),pa?.owner.toBase58()||null);
  check('admin-PDA',s.getPdaPlatformId(s.LAUNCHPAD_PROGRAM,admin).publicKey.equals(pid),{admin:expected.admin,platform});
  if(!pa||!po||!ma||!ca||!meta)throw Error('A required on-chain account is missing.');
  check('pool-owner',po.owner.equals(s.LAUNCHPAD_PROGRAM),po.owner.toBase58());check('global-config-owner',ca.owner.equals(s.LAUNCHPAD_PROGRAM),ca.owner.toBase58());
  const p=s.PlatformConfig.decode(pa.data),q=s.LaunchpadPool.decode(po.data),cfg=s.LaunchpadConfig.decode(ca.data),token=unpackMint(mid,ma,TOKEN_PROGRAM_ID);
  check('fee-wallet',p.platformClaimFeeWallet.toBase58()===expected.feeWallet,p.platformClaimFeeWallet.toBase58());
  const fees={protocol:cfg.tradeFeeRate.toString(),platform:p.feeRate.toString(),creator:p.creatorFeeRate.toString()};check('curve-fees',Object.values(fees).every(x=>x==='2500'),fees);
  check('LP-lock-policy',p.platformScale.toString()==='1000000'&&p.creatorScale.isZero()&&p.burnScale.isZero()&&p.platformLockNftWallet.toBase58()===expected.feeKeyWallet&&p.cpConfigId.toBase58()===expected.cpConfig,{platformScale:p.platformScale.toString(),creatorScale:p.creatorScale.toString(),burnScale:p.burnScale.toString(),feeKeyWallet:p.platformLockNftWallet.toBase58(),cpConfig:p.cpConfigId.toBase58()});
  check('no-extra-platform-allocation',p.platformVestingScale.isZero()&&p.platformCpCreator.equals(PublicKey.default)&&p.transferFeeExtensionAuth.equals(PublicKey.default)&&pa.data[832]===1&&pa.data[833]===1,{vesting:p.platformVestingScale.toString(),cpCreator:p.platformCpCreator.toBase58(),restrictGlobal:pa.data[832],restrictCurve:pa.data[833]});
  check('supply',token.supply===1000000000000000n,token.supply.toString());check('decimals',token.decimals===6,token.decimals);
  check('mint-authority-revoked',token.mintAuthority===null,token.mintAuthority?.toBase58()||null);check('freeze-authority-revoked',token.freezeAuthority===null,token.freezeAuthority?.toBase58()||null);
  check('pool-identity',q.mintA.equals(mid)&&q.mintB.equals(NATIVE_MINT)&&q.platformId.equals(pid)&&q.configId.toBase58()===expected.config&&q.creator.equals(founder)&&s.getPdaLaunchpadPoolId(s.LAUNCHPAD_PROGRAM,mid,NATIVE_MINT).publicKey.equals(poolId),{mint:q.mintA.toBase58(),platform:q.platformId.toBase58(),creator:q.creator.toBase58()});
  check('curve-allocations',q.supply.toString()==='1000000000000000'&&q.totalSellA.toString()==='793100000000000'&&q.totalFundRaisingB.toString()==='85000000000'&&q.vestingSchedule.totalLockedAmount.isZero()&&q.migrateType===1,{supply:q.supply.toString(),curve:q.totalSellA.toString(),liquidity:q.supply.sub(q.totalSellA).toString(),targetLamports:q.totalFundRaisingB.toString(),vesting:q.vestingSchedule.totalLockedAmount.toString(),migrateType:q.migrateType});
  check('metadata-owner',meta.owner.toBase58()==='metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',meta.owner.toBase58());check('metadata-mint',new PublicKey(meta.data.subarray(33,65)).equals(mid),new PublicKey(meta.data.subarray(33,65)).toBase58());
  const onchain=metadataFields(meta.data);check('metadata-identity',onchain.name===expected.name&&onchain.symbol===expected.symbol,onchain);
  const body=JSON.parse(new TextDecoder().decode(await verifiedAsset(onchain.uri,expected.origin,loadAsset)));
  check('metadata-image',await verifyOfficialArtwork(body.image,expected,loadAsset),body.image);
  check('metadata-links',body.name===expected.name&&body.symbol===expected.symbol&&(body.website||body.external_url)?.replace(/\/$/,'')===expected.origin&&(body.twitter||body.extensions?.twitter)===expected.twitter,{website:body.website||body.external_url,twitter:body.twitter||body.extensions?.twitter});
  const accounts=await connection.getTokenAccountsByOwner(founder,{mint:mid},'finalized');const balance=accounts.value.reduce((sum,a)=>sum+unpackAccount(a.pubkey,a.account,TOKEN_PROGRAM_ID).amount,0n);
  check('founder-zero-balance',balance===0n,balance.toString());
  // Verify the creation transaction, so unrelated traders cannot block CA publication by buying first.
  const history=await connection.getSignaturesForAddress(mid,{limit:100},'finalized');let creation=null;
  const initDisc=Buffer.from([67,153,175,39,218,16,38,32]);
  for(const h of history.filter(x=>!x.err).slice(-5).reverse()){
   const tx=await connection.getParsedTransaction(h.signature,{maxSupportedTransactionVersion:1,commitment:'finalized'});if(!tx||tx.meta?.err)continue;
   const ixs=tx.transaction.message.instructions;
   const init=ixs.find(i=>i.programId.equals(s.LAUNCHPAD_PROGRAM)&&i.data&&Buffer.from(bs58.decode(i.data)).subarray(0,8).equals(initDisc)&&i.accounts?.some(k=>k.equals(mid)));
   if(!init)continue;
   const onlyCreate=ixs.every(i=>i===init||i.programId.toBase58()==='ComputeBudget111111111111111111111111111111');
   const zero=(tx.meta.postTokenBalances||[]).filter(b=>b.mint===mint&&b.owner===expected.founder).every(b=>b.uiTokenAmount.amount==='0');
   creation={signature:h.signature,onlyCreate,founderZeroAtCreation:zero};break;
  }
  check('T0-creation-no-dev-buy',!!creation?.onlyCreate&&!!creation?.founderZeroAtCreation,creation||'Creation transaction not found in bounded history; manual historical verification required.');
 }catch(e){check('verification-completed',false,e instanceof Error?e.message:String(e));}
 return {status:checks.every(c=>c.status==='PASS')?'PASS':'FAIL',checkedAt:new Date().toISOString(),platform,pool,mint,readOnly:true,checks,note:'T0 checks the creation transaction plus the founder balance observed now; it is not proof that the founder never traded later. This report does not verify migration keeper coverage.'};
}
