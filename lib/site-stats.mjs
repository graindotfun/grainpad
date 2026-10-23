/** Homepage "ON THE RECORD" figures from chain-derived stores. No viewer RPC: callers cache server-side.
 * The public catalog still requires a fresh observation; these totals record what was confirmed. */
import {Buffer} from 'buffer';
import {PublicKey} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID,TOKEN_PROGRAM_ID,unpackMint} from '@solana/spl-token';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import {catalogMembership,launchFields} from './verified-monero-catalog.mjs';
import {liveCoverageKey} from './live-coverage.mjs';
import {deriveUsd} from './native-market.mjs';
import {LIVE_COVERAGE_LAG_MS,BURN_TTL_MS,BURN_MAX_STALE_MS} from './public-overview.mjs';

/** Append each fresh ten-confirmation witness for a launch identity and Monero record not yet recorded.
 * The insert re-checks the witness against launch_index and the stored proof in the same statement,
 * like catalog reads. The table refuses updates and deletes; a changed identity is a new row.
 * @param {any} db @param {Array<{key:string,launch:string,proof:string}>} witnesses */
export async function recordLaunchConfirmations(db,witnesses,now=Date.now()){
 if(!Number.isSafeInteger(now)||now<=0)throw Error('Invalid confirmation clock.');
 const statements=[];
 for(const witness of witnesses){
  const split=witness.key.lastIndexOf(':'),network=witness.key.slice(0,split),mint=witness.key.slice(split+1);
  if(network!=='mainnet-beta'||!mint)continue;
  statements.push(db.prepare(`INSERT INTO launch_confirmation(network,mint,launch,tx_hash,record,proof,confirmed_at) SELECT l.network,l.mint,?,json_extract(?,'$.tx_hash'),json_extract(?,'$.record'),?,? FROM launch_index l WHERE l.network=? AND l.mint=? AND ${catalogMembership('l')} ON CONFLICT(network,mint,launch,tx_hash,record) DO NOTHING`)
   .bind(witness.launch,witness.proof,witness.proof,witness.proof,now,network,mint,JSON.stringify([witness])));
 }
 if(!statements.length)return 0;
 const results=await db.batch(statements);
 return results.reduce((n,result)=>n+(Number(result?.meta?.changes)||0),0);
}

/** Counted after the observation window closes while a recorded confirmation matches the current index
 * identity and stored Monero record, and the record's last authoritative observation (launch_monero_state:
 * a trusted, synchronized daemon answer about that transaction) found it verified with ten confirmations.
 * Read failures never change that state, so a suspension (back in the mempool, named missing by the daemon,
 * under ten confirmations, rejected) holds through an outage until a verified observation lifts it.
 * A discovery reorg newer than that observation also suspends it; the coarse checkpoint rewind does so
 * only for records under REORG_SAFE_DEPTH confirmations, and those are shown as awaiting re-verification.
 * 720 blocks (about one day) is the decided technical default; per-transaction reorgs suspend at any depth. */
export const REORG_SAFE_DEPTH=720;
export const confirmedLaunch=(alias='l')=>`EXISTS (SELECT 1 FROM launch_confirmation c JOIN monero_launch_record p ON p.mint=c.mint AND p.tx_hash=c.tx_hash AND p.record=c.record JOIN launch_monero_state s ON s.tx_hash=p.tx_hash AND s.mint=p.mint AND s.record=p.record WHERE c.network=${alias}.network AND c.mint=${alias}.mint AND c.launch=${launchFields(alias)} AND p.status IN ('verified','unavailable') AND s.state='eligible' AND NOT EXISTS (SELECT 1 FROM monero_discovery_candidate d WHERE d.tx_hash=p.tx_hash AND d.status='orphaned' AND d.updated_at>=s.observed_at AND (d.reason NOT LIKE 'Checkpoint reorg:%' OR s.confirmations<${REORG_SAFE_DEPTH})))`;
/** A stored record with no authoritative observation yet (e.g. right after migration 0046, or after the
 * state is cleared on roll-forward). Unresolved does not depend on the mutable public status or a witness,
 * so a later outage cannot make it look settled. */
const unresolved=(record='p')=>`NOT EXISTS (SELECT 1 FROM launch_monero_state s WHERE s.tx_hash=${record}.tx_hash AND s.record=${record}.record)`;
/** Not counted and not authoritatively suspended: either unresolved, or eligible but waiting on its
 * confirmation witness or on re-verification after a checkpoint rewind. Shown, never added. */
const awaitingLaunch=(alias='l')=>`EXISTS (SELECT 1 FROM monero_launch_record p WHERE p.mint=${alias}.mint AND p.status<>'rejected' AND (${unresolved('p')} OR EXISTS (SELECT 1 FROM launch_monero_state s WHERE s.tx_hash=p.tx_hash AND s.record=p.record AND s.state='eligible')))`;
const unresolvedLaunch=(alias='l')=>`EXISTS (SELECT 1 FROM monero_launch_record p WHERE p.mint=${alias}.mint AND p.status<>'rejected' AND ${unresolved('p')})`;
const retiredSql=retired=>retired.length?` AND l.mint NOT IN (${retired.map(()=>'?').join(',')})`:'';
const scope=retired=>`l.network='mainnet-beta' AND l.platform_id=? AND ${confirmedLaunch('l')}${retiredSql(retired)}`;

/** Confirmed launches; launches awaiting recording or re-verification (shown, never added); and of those,
 * launches whose Monero record has no authoritative observation yet. Population is complete only when
 * launchesUnresolved is 0.
 * @param {any} db @param {string} platform @param {string[]} [retired] */
export async function countConfirmedLaunches(db,platform,retired=[]){
 const row=await db.prepare(`SELECT
 (SELECT count(*) FROM launch_index l WHERE ${scope(retired)}) AS confirmed,
 (SELECT count(*) FROM launch_index l WHERE l.network='mainnet-beta' AND l.platform_id=? AND NOT ${confirmedLaunch('l')}${retiredSql(retired)} AND ${awaitingLaunch('l')}) AS awaiting,
 (SELECT count(*) FROM launch_index l WHERE l.network='mainnet-beta' AND l.platform_id=?${retiredSql(retired)} AND ${unresolvedLaunch('l')}) AS unresolved`)
  .bind(platform,...retired,platform,...retired,platform,...retired).first();
 return {launches:Number(row?.confirmed)||0,launchesAwaiting:Number(row?.awaiting)||0,launchesUnresolved:Number(row?.unresolved)||0};
}

export const VOLUME_WINDOW_SECONDS=86400;
export {LIVE_COVERAGE_LAG_MS,BURN_TTL_MS,BURN_MAX_STALE_MS} from './public-overview.mjs';
/** 24h volume of every confirmed launch from the finalized-trade index, never per-viewer market caches.
 * Coverage is 'indexed' only when, for every counted launch, both curve and CPMM streams completed a
 * live pass that began within LIVE_COVERAGE_LAG_MS (a completed pass covers the address history up to
 * its start), nothing for the launch waits in the queue, no trade lacks a block time or quote scale,
 * and an unexpired quote price exists (the shared cache serves prices up to ten minutes old). Anything less is 'partial' with indexed trades as a lower bound;
 * a launch without a quote asset, price or streams is left out (unknown, never zero).
 * @param {any} db @param {string} platform
 * @param {{retired?:string[],prices?:Record<string,any>|null,now?:number}} [options] */
export async function readIndexedVolume(db,platform,{retired=[],prices=null,now=Date.now()}={}){
 const end=Math.floor(now/1000),start=end-VOLUME_WINDOW_SECONDS;
 const window="e.mint=l.mint AND e.kind IN ('buy','sell') AND e.block_time>=? AND e.block_time<=?";
 const rows=await db.prepare(`SELECT l.mint,json_extract(l.record,'$.quoteAsset') AS quote,
 (SELECT sum(CAST(json_extract(e.record,'$.quoteAmount') AS REAL)/CAST('1e'||json_extract(e.record,'$.quoteDecimals') AS REAL)) FROM chain_event e WHERE ${window}
  AND json_type(e.record,'$.quoteDecimals')='integer' AND CAST(json_extract(e.record,'$.baseAmount') AS REAL)>0 AND CAST(json_extract(e.record,'$.quoteAmount') AS REAL)>0) AS volume,
 (SELECT count(*) FROM chain_event e WHERE ${window} AND coalesce(json_type(e.record,'$.quoteDecimals'),'')<>'integer') AS malformed,
 (SELECT count(*) FROM chain_event e WHERE e.mint=l.mint AND e.kind IN ('buy','sell') AND e.block_time IS NULL) AS untimed,
 (SELECT count(DISTINCT s.kind) FROM indexer_stream s WHERE s.mint=l.mint AND s.kind IN ('curve','cpmm')) AS streams,
 (SELECT CASE WHEN count(DISTINCT s.kind)=2 AND count(json_extract(st.cursor,'$.coveredThrough'))=count(*) THEN min(json_extract(st.cursor,'$.coveredThrough')) END
  FROM indexer_stream s LEFT JOIN indexer_state st ON st.key=(?||s.address) WHERE s.mint=l.mint AND s.kind IN ('curve','cpmm')) AS covered,
 (SELECT count(*) FROM indexer_stream s JOIN indexer_queue q ON q.source=s.address WHERE s.mint=l.mint AND q.status IN ('pending','quarantined')
  AND NOT EXISTS (SELECT 1 FROM chain_event x WHERE x.mint=l.mint AND x.signature=q.signature)) AS gaps
 FROM launch_index l WHERE ${scope(retired)} ORDER BY l.mint`).bind(start,end,start,end,liveCoverageKey(''),platform,...retired).all();
 let volume=0,tokens=0,complete=true,through=Infinity;
 for(const row of rows.results??[]){
  const price=typeof row.quote==='string'?prices?.[row.quote]??null:null;
  const usd=Number(row.streams)>0?deriveUsd(Number(row.volume??0),price):null;
  if(usd===null){complete=false;continue;}
  volume+=usd;tokens++;
  const covered=Number(row.covered);
  through=Math.min(through,Number.isSafeInteger(covered)&&covered>0?covered:0);
  if(Number(row.streams)!==2||!(covered>=now-LIVE_COVERAGE_LAG_MS)||Number(row.gaps)>0||Number(row.untimed)>0||Number(row.malformed)>0)complete=false;
 }
 return {volume:tokens?volume:null,volumeTokens:tokens,volumeCoverage:tokens&&complete?'indexed':'partial',
  volumeIndexedThrough:tokens&&through>0&&Number.isFinite(through)?new Date(Math.min(through,now)).toISOString():null,volumeSource:'indexed-trades'};
}

/** Anchor account discriminator: sha256('account:PoolState')[0..8]. */
export const POOL_DISCRIMINATOR=Buffer.from('f7ede3f5d7c3de46','hex');
const accountBytes=account=>Buffer.from(Array.isArray(account.data)?account.data[0]:account.data,'base64');
/** Burned = supply the LaunchLab pool recorded at creation minus current mint supply, from one finalized
 * getMultipleAccounts read. Refused unless the pool is the canonical LaunchLab PDA for this mint and its
 * quote, the mint is initialized with six decimals (the homepage scale) and has no mint authority.
 * @param {string} mint @param {string} poolAddress @param {any} mintAccount @param {any} poolAccount */
export function supplyBurn(mint,poolAddress,mintAccount,poolAccount){
 if(!mintAccount||!poolAccount)throw Error('Supply accounts are unavailable.');
 const owner=String(mintAccount.owner);
 if(owner!==String(TOKEN_2022_PROGRAM_ID)&&owner!==String(TOKEN_PROGRAM_ID))throw Error('Mint is not a token mint.');
 const program=new PublicKey(owner),token=unpackMint(new PublicKey(mint),{owner:program,data:accountBytes(mintAccount),lamports:mintAccount.lamports??0,executable:false},program);
 if(!token.isInitialized||token.decimals!==6)throw Error('Mint is not an initialized six-decimal mint.');
 if(token.mintAuthority!==null)throw Error('Mint authority is active; supply is not a burn record.');
 if(String(poolAccount.owner)!==String(sdk.LAUNCHPAD_PROGRAM))throw Error('Pool is not a LaunchLab pool.');
 const bytes=accountBytes(poolAccount);
 if(!bytes.subarray(0,8).equals(POOL_DISCRIMINATOR))throw Error('Account is not a LaunchLab pool state.');
 const pool=sdk.LaunchpadPool.decode(bytes);
 if(String(pool.mintA)!==mint||pool.mintDecimalsA!==token.decimals)throw Error('Pool does not belong to this mint.');
 if(sdk.getPdaLaunchpadPoolId(sdk.LAUNCHPAD_PROGRAM,pool.mintA,pool.mintB).publicKey.toBase58()!==poolAddress)throw Error('Pool is not the canonical LaunchLab pool for this mint.');
 const initial=BigInt(pool.supply.toString()),current=token.supply;
 if(initial<=0n||current>initial)throw Error('Supply exceeds the launch supply.');
 return {burned:String(initial-current),initialSupply:String(initial),currentSupply:String(current),decimals:token.decimals};
}

/** Official GRAIN burn through one shared cache entry per mint and pool. Each refresh asks for a context
 * no older than the last accepted slot and refuses a regressing slot or a rising supply, so an older
 * snapshot never becomes fresh evidence. Past BURN_MAX_STALE_MS the figure is unavailable.
 * @param {any} db
 * @param {{rpc:(method:string,params:unknown[])=>Promise<any>,cache:Function,now?:()=>number}} options */
export async function loadSupplyBurn(db,{rpc,cache,now=()=>Date.now()}){
 const official=await db.prepare('SELECT mint,pool FROM official_token WHERE id=1').first();
 if(!official?.mint)return null;
 const launch=await db.prepare("SELECT pool FROM launch_index WHERE network='mainnet-beta' AND mint=?").bind(official.mint).first();
 if(!launch?.pool)return null;
 // Both records name the LaunchLab pool; disagreement means neither is trusted for the burn figure.
 if(official.pool!==launch.pool)throw Error('Official and indexed launch pools differ.');
 const mint=official.mint,pool=launch.pool;
 const cached=await cache(db,`grain-supply-burn:v2:${mint}:${pool}`,async(/** @type {any} */previous)=>{
  const floor=Number.isSafeInteger(previous?.slot)&&previous.slot>0?previous.slot:null;
  const read=await rpc('getMultipleAccounts',[[mint,pool],{encoding:'base64',commitment:'finalized',...(floor?{minContextSlot:floor}:{})}]);
  const slot=read?.context?.slot;
  if(!Number.isSafeInteger(slot)||slot<=0||!Array.isArray(read?.value)||read.value.length!==2)throw Error('Malformed supply read.');
  if(floor&&slot<floor)throw Error('Supply read is older than the last accepted observation.');
  const burn=supplyBurn(mint,pool,read.value[0],read.value[1]);
  if(previous?.currentSupply&&BigInt(burn.currentSupply)>BigInt(previous.currentSupply))throw Error('Supply rose without a mint authority.');
  return {...burn,mint,pool,slot};
 },{ttl:BURN_TTL_MS,maxStale:BURN_MAX_STALE_MS,now});
 return {...cached.data,checkedAt:cached.updatedAt,stale:cached.stale};
}
