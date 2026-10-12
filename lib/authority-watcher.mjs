/** Read-only finalized observer. Missing evidence is explicit, never inferred.
 * No keys, signing, transaction submission or automatic remediation. */
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {unpackMint,getTransferFeeConfig,TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import {decodePlatform,grainpadPlatformId} from './platform-policy.mjs';
import {expectedRuleAccounts,decodeAllowConfig} from './launch-rules.mjs';
import {REWARDS_DEPLOYMENT} from './rewards-deployment.mjs';
import {QUOTES} from './quote-assets.mjs';
import {PREVIOUS_OFFICIAL_MINTS} from './previous-official-mints.mjs';
const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export const authorityFingerprint=value=>createHash('sha256').update(JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v)).digest('hex');
const json=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v));
export function decodeWatchedMint(address,account){
 const mint=new PublicKey(address),token=unpackMint(mint,account,account.owner),fee=account.owner.equals(TOKEN_2022_PROGRAM_ID)?getTransferFeeConfig(token):null;
 return json({mint:String(mint),program:String(account.owner),mintAuthority:token.mintAuthority,freezeAuthority:token.freezeAuthority,transferFeeConfigAuthority:fee?.transferFeeConfigAuthority&&!fee.transferFeeConfigAuthority.equals(PublicKey.default)?fee.transferFeeConfigAuthority:null,withdrawWithheldAuthority:fee?.withdrawWithheldAuthority&&!fee.withdrawWithheldAuthority.equals(PublicKey.default)?fee.withdrawWithheldAuthority:null,olderTransferFee:fee?.olderTransferFee??null,newerTransferFee:fee?.newerTransferFee??null});
}
// SDK layouts include Anchor's 8-byte discriminator. Do not strip it again.
export function decodeWatchedCpmm(data){return sdk.CpmmPoolInfoLayout.decode(data);}
export async function observeGrainpadAuthorities(connection,{knownMints=[],discover=true}={}){
 if(await connection.getGenesisHash()!==MAINNET)throw Error('Watcher requires mainnet genesis.');
 const epochBefore=await connection.getEpochInfo('finalized'),platform=grainpadPlatformId(),issues=[],rows=[],pools=[];
 const record=(address,account,decoded,slot)=>rows.push({address:String(address),slot,present:!!account,owner:account?String(account.owner):null,bytesFingerprint:account?authorityFingerprint({owner:String(account.owner),data:Buffer.from(account.data).toString('base64')}):null,decoded:json(decoded),authorityFingerprint:authorityFingerprint(decoded)});
 const keys=[platform,...expectedRuleAccounts(platform)];
 const r=await connection.getMultipleAccountsInfoAndContext(keys,{commitment:'finalized',minContextSlot:epochBefore.absoluteSlot});
 if(r.value.length!==keys.length||r.context.slot<epochBefore.absoluteSlot)throw Error('Incomplete platform observation.');
 r.value.forEach((a,i)=>{
  if(!a){if(i===0)issues.push('PLATFORM_ABSENT');record(keys[i],a,{absent:true},r.context.slot);return;}
  if(!a.owner.equals(sdk.LAUNCHPAD_PROGRAM))throw Error('Platform/rule account program mismatch.');
  let decoded;
  if(i===0){decoded=decodePlatform(a.data);decoded.platformId=String(platform);}
  else if(i%3===1)decoded=sdk.LaunchpadConfig.decode(a.data);
  else if(i%3===2)decoded=decodeAllowConfig(a.data);
  else decoded=sdk.PlatformCurveRule.decode(a.data);
  record(keys[i],a,decoded,r.context.slot);
 });
 if(discover){try{
  const scan=await connection.getProgramAccounts(sdk.LAUNCHPAD_PROGRAM,{commitment:'finalized',minContextSlot:r.context.slot,withContext:true,filters:[{dataSize:sdk.LaunchpadPool.span},{memcmp:{offset:sdk.LaunchpadPool.offsetOf('platformId'),bytes:String(platform)}}]});
  if(scan.context.slot<r.context.slot)throw Error('Stale discovery.');
  for(const a of scan.value){const p=sdk.LaunchpadPool.decode(a.account.data);if(!p.platformId.equals(platform))throw Error('Wrong discovered platform.');pools.push({pool:String(a.pubkey),mint:String(p.mintA),quote:String(p.mintB),status:p.status,slot:scan.context.slot});record(a.pubkey,a.account,{mint:String(p.mintA),quote:String(p.mintB),status:p.status,platform:String(p.platformId)},scan.context.slot);}
 }catch{issues.push('LAUNCH_DISCOVERY_INCOMPLETE');}}
 const mints=[...new Set([REWARDS_DEPLOYMENT.officialGrainMint,QUOTES.wXMR.mint,...PREVIOUS_OFFICIAL_MINTS.map(m=>m.mint),...knownMints,...pools.map(p=>p.mint)])].filter(Boolean);
 const floor=Math.max(r.context.slot,...pools.map(p=>p.slot));
 for(let i=0;i<mints.length;i+=100){const ids=mints.slice(i,i+100).map(m=>new PublicKey(m)),res=await connection.getMultipleAccountsInfoAndContext(ids,{commitment:'finalized',minContextSlot:floor});if(res.context.slot<floor||res.value.length!==ids.length)throw Error('Incomplete mint observation.');res.value.forEach((a,n)=>{if(!a){issues.push(`MINT_ABSENT:${ids[n]}`);record(ids[n],a,{absent:true},res.context.slot);}else record(ids[n],a,decodeWatchedMint(ids[n],a),res.context.slot);});}
 const epochAfter=await connection.getEpochInfo({commitment:'finalized',minContextSlot:Math.max(...rows.map(x=>x.slot))});
 if(epochBefore.epoch!==epochAfter.epoch)issues.push('EPOCH_CHANGED_DURING_OBSERVATION');
 return {schemaVersion:1,readOnly:true,mainnetTransactionsSent:0,checkedAt:new Date().toISOString(),commitment:'finalized',genesis:MAINNET,epoch:epochAfter.epoch,slot:epochAfter.absoluteSlot,discoveryComplete:discover&&!issues.includes('LAUNCH_DISCOVERY_INCOMPLETE'),status:issues.length?'INCOMPLETE':'OBSERVED',issues,pools,accounts:rows};
}
export function authorityChanges(previous,current){
 if(previous?.schemaVersion!==1||previous.genesis!==current.genesis)throw Error('Matching trusted watcher baseline required.');
 const old=new Map(previous.accounts.map(a=>[a.address,a]));
 const changes=current.accounts.flatMap(a=>{const prior=old.get(a.address);old.delete(a.address);return !prior||prior.authorityFingerprint!==a.authorityFingerprint?[{address:a.address,before:prior?.decoded??null,after:a.decoded}]:[];});
 for(const a of old.values())changes.push({address:a.address,before:a.decoded,after:null});
 return changes;
}
