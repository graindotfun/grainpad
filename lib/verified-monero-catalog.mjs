/** Public listing eligibility from stored, cryptographically checked observations.
 * Never creates an intent, spends a fee, or calls a chain. Trading admission is independent.
 */
import {PublicKey} from '@solana/web3.js';
import {receiptMonero,OBSERVATION_MAX_AGE_MS} from './monero-index.mjs';
import {verifyEvmRecord,manifestHash} from './monero-evm-record.mjs';
import {isPublicRobinhoodToken} from './robinhood-publication.mjs';
import {isRetiredEvmLaunch} from './retired-evm-launches.mjs';

export const catalogKey=(network,mint)=>network+':'+mint;
const solProofFields=p=>`json_object('tx_hash',${p}.tx_hash,'record',${p}.record,'height',${p}.height,'confirmations',${p}.confirmations,'status',${p}.status,'observed_at',${p}.observed_at)`;
const evmProofFields=p=>`json_object('network',${p}.network,'token',${p}.token,'creator',${p}.creator,'manifest',${p}.manifest,'manifest_hash',${p}.manifest_hash,'record',${p}.record,'state',${p}.state,'tx_hash',${p}.tx_hash,'height',${p}.height,'block_hash',${p}.block_hash,'confirmations',${p}.confirmations,'observed_at',${p}.observed_at,'expires_at',${p}.expires_at)`;
// Match the exact independently verified identity AND observation in the same SQL
// statement that reads/counts the catalog. Concurrent changes fail closed.
export const catalogMembership=(alias='l')=>`EXISTS (SELECT 1 FROM json_each(?) witness WHERE json_extract(witness.value,'$.key')=${alias}.network||':'||${alias}.mint AND ${alias}.creator=json_extract(json_extract(witness.value,'$.launch'),'$.creator') AND ${alias}.platform_id=CASE ${alias}.network WHEN 'mainnet-beta' THEN json_extract(json_extract(witness.value,'$.launch'),'$.platformId') ELSE json_extract(json_extract(witness.value,'$.launch'),'$.factory') END AND ${alias}.pool=CASE ${alias}.network WHEN 'mainnet-beta' THEN json_extract(json_extract(witness.value,'$.launch'),'$.pool') ELSE json_extract(json_extract(witness.value,'$.launch'),'$.launchId') END AND json_extract(witness.value,'$.launch')=${launchFields(alias)} AND ((${alias}.network='mainnet-beta' AND EXISTS (SELECT 1 FROM monero_launch_record proof WHERE proof.mint=${alias}.mint AND ${solProofFields('proof')}=json_extract(witness.value,'$.proof'))) OR (${alias}.network='robinhood:mainnet' AND EXISTS (SELECT 1 FROM monero_evm_mainnet_anchor proof WHERE proof.network=${alias}.network AND proof.token=${alias}.mint AND ${evmProofFields('proof')}=json_extract(witness.value,'$.proof')))))`;
export function catalogSolTokenMatches(witnesses,token){
 const witness=witnesses.find(row=>row.key===catalogKey('mainnet-beta',token.address));if(!witness)return false;
 const launch=JSON.parse(witness.launch);return token.name===launch.name&&token.symbol===launch.symbol&&token.extensions?.creator===launch.creator&&token.extensions?.platformId===launch.platformId&&token.extensions?.pool===launch.pool;
}
export function catalogTokenMatches(witnesses,token){
 const witness=witnesses.find(row=>row.key===catalogKey('robinhood:mainnet',token.address));if(!witness||token.chainId!==4663)return false;
 const identity=JSON.parse(witness.launch);return token.name===identity.name&&token.symbol===identity.symbol;
}

/** @param {Array<{key:string,launch:string,proof:string}>} witnesses @param {string} network @param {string} mint @param {any} [record] */
export function catalogContains(witnesses,network,mint,record=null){
 const witness=witnesses.find(row=>row.key===catalogKey(network,mint));if(!witness)return false;
 if(!record)return true;
 const identity=JSON.parse(witness.launch),candidate=network==='robinhood:mainnet'?{...record,network,mint:record.tokenAddress,platformId:record.factory,pool:record.launchId}:record;return Object.keys(identity).every(key=>(candidate[key]??null)===identity[key]);
}
export function verifiedCatalogProof(row,now=Date.now()){
 try{
  const launch=typeof row.launch==='string'?JSON.parse(row.launch):row.launch;
  const proof=typeof row.proof==='string'?JSON.parse(row.proof):row.proof;
  if(row.network==='mainnet-beta'){
   if(launch.network!==row.network||launch.mint!==row.mint||launch.creator!==row.creator||launch.platformId!==row.platform_id||launch.pool!==row.pool)return null;
   const receipt=receiptMonero(proof,{mintHex:Buffer.from(new PublicKey(row.mint).toBytes()).toString('hex'),creatorHex:Buffer.from(new PublicKey(row.creator).toBytes()).toString('hex'),metadataHash:launch.metadataHash},now);
   return receipt.status==='verified'&&receipt.confirmations>=10?receipt:null;
  }
  if(row.network!=='robinhood:mainnet'||!isPublicRobinhoodToken(row.network,row.mint)||isRetiredEvmLaunch(row.network,row.mint))return null;
  const m=JSON.parse(proof.manifest);
  if(proof.state!=='indexed'||!Number.isSafeInteger(proof.confirmations)||proof.confirmations<10||!proof.record||manifestHash(m)!==proof.manifest_hash||!/^[0-9a-f]{64}$/.test(proof.tx_hash??'')||!/^[0-9a-f]{64}$/.test(proof.block_hash??'')||proof.observed_at>now||now-proof.observed_at>=OBSERVATION_MAX_AGE_MS||!Number.isSafeInteger(proof.height)||proof.height<0||!Number.isSafeInteger(proof.observed_at)||proof.observed_at<=0||proof.network!==row.network||proof.token!==row.mint||proof.creator!==row.creator)return null;
  if(m.networkId!==row.network||m.chainId!==4663||m.tokenAddress!==row.mint||m.factory!==row.platform_id||m.creator!==row.creator||m.launchId!==row.pool)return null;
  if(launch.networkId!==row.network||launch.tokenAddress!==row.mint||launch.factory!==row.platform_id||launch.creator!==row.creator||launch.launchId!==row.pool||launch.name!==m.name||launch.symbol!==m.symbol)return null;
  const record=verifyEvmRecord(Buffer.from(proof.record,'hex'),m);
  // A renewed GRNE v2 authorization names its renewal transaction, while the
  // registration keeps the original creation transaction. Neither identity is rewritten.
  if(!(record.version===2&&record.sequence>0)&&launch.transactionHash!==m.transactionHash)return null;
  return {verified:true,status:'verified',confirmations:proof.confirmations,txHash:proof.tx_hash,observedAt:proof.observed_at,expiresAt:proof.observed_at+OBSERVATION_MAX_AGE_MS};
 }catch{return null;}
}

export const launchFields=(alias='l')=>"json_object('network',json_extract(l.record,'$.network'),'networkId',json_extract(l.record,'$.networkId'),'mint',json_extract(l.record,'$.mint'),'tokenAddress',json_extract(l.record,'$.tokenAddress'),'platformId',json_extract(l.record,'$.platformId'),'factory',json_extract(l.record,'$.factory'),'creator',json_extract(l.record,'$.creator'),'pool',json_extract(l.record,'$.pool'),'launchId',json_extract(l.record,'$.launchId'),'metadataHash',json_extract(l.record,'$.metadataHash'),'transactionHash',json_extract(l.record,'$.transactionHash'),'name',json_extract(l.record,'$.name'),'symbol',json_extract(l.record,'$.symbol'))".replaceAll('l.',alias+'.');
const scope=(network,mint)=>`${network?' AND l.network=?':''}${mint?' AND l.mint=?':''}`;
/** Filter before SQL pagination/counts. Raw launch_index rows remain available to publication/recovery.
 * @param {any} db
 * @param {{now?:number,network?:string|null,mint?:string|null}} [options]
 */
export async function verifiedCatalogWitnesses(db,{now=Date.now(),network=null,mint=null}={}){
 if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid catalog observation clock.');
 const args=[now-OBSERVATION_MAX_AGE_MS,now,...(network?[network]:[]),...(mint?[mint]:[])];
 const queries=[];
 if(!network||network==='mainnet-beta')queries.push(db.prepare(`SELECT l.network,l.mint,l.platform_id,l.creator,l.pool,${launchFields()} AS launch,
 ${solProofFields('p')} AS proof
 FROM launch_index l JOIN monero_launch_record p ON p.mint=l.mint
 WHERE l.network='mainnet-beta' AND p.status='verified' AND p.confirmations>=10 AND p.height>=0 AND p.observed_at>? AND p.observed_at<=?${scope(network,mint)}`).bind(...args).all());
 if(!network||network==='robinhood:mainnet')queries.push(db.prepare(`SELECT l.network,l.mint,l.platform_id,l.creator,l.pool,${launchFields()} AS launch,
 ${evmProofFields('p')} AS proof
 FROM launch_index l JOIN monero_evm_mainnet_anchor p ON p.network=l.network AND p.token=l.mint
 WHERE l.network='robinhood:mainnet' AND p.state='indexed' AND p.confirmations>=10 AND p.height>=0 AND p.observed_at>? AND p.observed_at<=?${scope(network,mint)}`).bind(...args).all());
 const witnesses=[];for(const result of await Promise.all(queries))for(const row of result.results??[])if(verifiedCatalogProof(row,now))witnesses.push({key:catalogKey(row.network,row.mint),launch:row.launch,proof:row.proof});
 return witnesses;
}

export async function verifiedCatalogKeys(db,options={}){return [...new Set((await verifiedCatalogWitnesses(db,options)).map(row=>row.key))];}

