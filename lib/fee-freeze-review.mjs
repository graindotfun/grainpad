/** Fee freeze (DP-9): revoke a graduated mint's TransferFeeConfig AUTHORITY so its current
 * transfer fee can never change again. The fee itself is not revoked or altered.
 *
 * Review only. This module observes finalized mainnet state and compiles an UNSIGNED
 * transaction for human review. It has no signer, relay, scheduler or automatic execution.
 * Any missing or unexpected condition refuses. Revocation is irreversible on chain, and it does
 * NOT cancel a fee change that is already scheduled, so a future-dated fee always refuses.
 * Withdraw-withheld custody is unaffected by a freeze and is reported separately. */
import {Buffer} from 'buffer';
import {PublicKey,ComputeBudgetProgram,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {TOKEN_2022_PROGRAM_ID,unpackMint,getTransferFeeConfig,getExtensionTypes,ExtensionType,AuthorityType,createSetAuthorityInstruction} from '@solana/spl-token';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import {rewardsDigest} from './rewards-allocation.mjs';
import {validateTransferFeeRevokeState} from './transfer-fee-revoke-review.mjs';
import {grainpadPlatformId} from './platform-policy.mjs';
import {REWARDS_DEPLOYMENT} from './rewards-deployment.mjs';
import {REWARDS_POLICY} from './rewards-policy.mjs';
import {QUOTES} from './quote-assets.mjs';

const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
/** Rewards launches set maximumFee to the full 1B / 6-decimal supply (`buildRewardsLaunch`). */
export const LAUNCH_MAXIMUM_FEE_RAW='1000000000000000';
export const FEE_FREEZE_FRESHNESS_MS=30000;
export const FEE_FREEZE_COMPUTE_UNITS=20000;
const ALLOWED_EXTENSIONS=new Set([ExtensionType.TransferFeeConfig,ExtensionType.MetadataPointer,ExtensionType.TokenMetadata]);
const GRADUATED=2;

/** Neither switch is read by any signer path in this repository. A future signing review must
 * check it, in its own owner-approved, flag-only commit. Nothing revokes automatically. */
export const FEE_FREEZE_EXECUTION_ENABLED=Object.freeze({grain:false,graduated:false});
export function assertFeeFreezeExecutionEnabled(kind){
 if(!Object.hasOwn(FEE_FREEZE_EXECUTION_ENABLED,kind))throw Error('Unknown fee-freeze kind.');
 if(FEE_FREEZE_EXECUTION_ENABLED[kind]!==true)throw Error('Fee-freeze execution is not approved. This is an unsigned review only.');
}

/** Official GRAIN. Values match TRUST_PREPARATION_20261006.evidence.json (primary slot 453991042,
 * independent read 453992565): pool status 2, both fee fields 200 bps / 1e15 raw at epoch 1050,
 * both fee authorities on the collector, mint and freeze revoked. A fresh read is still required. */
export const GRAIN_FEE_FREEZE_POLICY=Object.freeze({
 kind:'grain',label:'Official GRAIN',
 mint:REWARDS_DEPLOYMENT.officialGrainMint,pool:'BvvuZ87WjoUyAuTZ4sLVFAwz8EVWXcZfe4RTwifayxQ2',
 platform:String(grainpadPlatformId()),quoteMint:QUOTES.wXMR.mint,program:String(TOKEN_2022_PROGRAM_ID),
 authority:REWARDS_DEPLOYMENT.collector,withdrawAuthority:REWARDS_DEPLOYMENT.collector,
 basisPoints:200,maximumFee:LAUNCH_MAXIMUM_FEE_RAW,decimals:6,
});

/** Future graduated launches. The expected rate comes from the verified registered launch record
 * (`rewards.taxBps`, captured from chain at registration), never from the mint being frozen. */
export function graduatedFeeFreezePolicy(launch){
 const taxBps=launch?.rewards?.taxBps;
 if(!launch||typeof launch.mint!=='string'||typeof launch.pool!=='string'||launch.platformId!==String(grainpadPlatformId()))throw Error('Registered Grainpad launch with mint, pool and platform required.');
 if(!Number.isInteger(taxBps)||taxBps<REWARDS_POLICY.minimumTaxBps||taxBps>REWARDS_POLICY.maximumTaxBps)throw Error('Registered launch tax within the approved 1–3% range required.');
 if(launch.mint===REWARDS_DEPLOYMENT.officialGrainMint)throw Error('Official GRAIN uses its own pinned policy.');
 const mint=String(new PublicKey(launch.mint)),pool=String(new PublicKey(launch.pool));
 if(mint!==launch.mint||pool!==launch.pool)throw Error('Canonical launch addresses required.');
 return Object.freeze({kind:'graduated',label:`Graduated launch ${mint}`,mint,pool,platform:launch.platformId,quoteMint:QUOTES.wXMR.mint,program:String(TOKEN_2022_PROGRAM_ID),
  authority:REWARDS_DEPLOYMENT.collector,withdrawAuthority:REWARDS_DEPLOYMENT.collector,basisPoints:taxBps,maximumFee:LAUNCH_MAXIMUM_FEE_RAW,decimals:6});
}

/** Pure check of one finalized observation against a policy. Returns every refusal reason. */
export function feeFreezeRefusals(observed,policy){
 const refuse=[],add=(code,message)=>refuse.push({code,message});
 if(observed?.genesis!==MAINNET)add('network','Finalized mainnet-beta observation required.');
 if(!observed?.mint)add('mint-missing','Mint account not observed.');
 if(!observed?.pool)add('pool-missing','LaunchLab pool account not observed.');
 if(!Number.isSafeInteger(observed?.epoch)||observed.epochStable!==true)add('epoch','Epoch must be identical before and after the read.');
 if(refuse.length)return refuse;
 const {mint,pool}=observed;
 if(mint.owner!==policy.program||policy.program!==String(TOKEN_2022_PROGRAM_ID))add('program','Mint is not owned by the expected Token-2022 program.');
 if(pool.owner!==String(sdk.LAUNCHPAD_PROGRAM))add('pool-program','Pool is not owned by LaunchLab.');
 if(pool.mint!==policy.mint||pool.quoteMint!==policy.quoteMint||pool.platform!==policy.platform)add('attribution','Pool does not bind this mint, wXMR and the Grainpad platform.');
 if(pool.status!==GRADUATED)add('not-graduated','Pool has not graduated; before graduation the tax-rate authority belongs to LaunchLab.');
 if(mint.address!==policy.mint)add('mint-identity','Observed mint differs from policy.');
 if(mint.mintAuthority!==null||mint.freezeAuthority!==null)add('mint-authorities','Mint or freeze authority is present.');
 if(mint.decimals!==policy.decimals)add('decimals','Unexpected decimals.');
 if(mint.unexpectedExtensions.length)add('extensions',`Unexpected Token-2022 extensions: ${mint.unexpectedExtensions.join(', ')}.`);
 const fee=mint.transferFee;
 if(!fee){add('no-fee','Mint has no transfer-fee extension.');return refuse;}
 if(fee.configAuthority!==policy.authority)add('authority',`Tax-rate authority is ${fee.configAuthority??'already revoked'}, expected ${policy.authority}.`);
 if(fee.withdrawWithheldAuthority!==policy.withdrawAuthority)add('withdraw-authority',`Withdraw authority is ${fee.withdrawWithheldAuthority}; custody changed, review first.`);
 if(BigInt(fee.newer.epoch)>BigInt(observed.epoch))add('scheduled',`A fee change is scheduled for epoch ${fee.newer.epoch}; revocation would not cancel it.`);
 for(const [name,f] of [['older',fee.older],['newer',fee.newer]])if(f.basisPoints!==policy.basisPoints||f.maximumFee!==policy.maximumFee)add('rate',`${name} fee is ${f.basisPoints} bps / ${f.maximumFee}, expected ${policy.basisPoints} bps / ${policy.maximumFee}.`);
 if(!refuse.length){
  // The shared DP-9 validator is the second, independent gate on the same values.
  try{validateTransferFeeRevokeState({mint:policy.mint,program:mint.owner,authority:fee.configAuthority,epoch:observed.epoch,newerTransferFee:{epoch:fee.newer.epoch,transferFeeBasisPoints:fee.newer.basisPoints,maximumFee:fee.newer.maximumFee}},{mint:policy.mint,authority:policy.authority,basisPoints:policy.basisPoints,maximumFee:policy.maximumFee});}
  catch(error){add('dp9-validator',error.message);}
 }
 return refuse;
}

export function decodeFreezeMint(address,account){
 const owner=String(account.owner),data=Buffer.from(account.data);
 if(owner!==String(TOKEN_2022_PROGRAM_ID))return {address:String(address),owner,mintAuthority:null,freezeAuthority:null,decimals:null,unexpectedExtensions:[],transferFee:null};
 const token=unpackMint(new PublicKey(address),{...account,owner:TOKEN_2022_PROGRAM_ID,data},TOKEN_2022_PROGRAM_ID),fee=getTransferFeeConfig(token);
 const key=k=>k&&!k.equals(PublicKey.default)?String(k):null,f=x=>({epoch:String(x.epoch),basisPoints:x.transferFeeBasisPoints,maximumFee:String(x.maximumFee)});
 return {address:String(address),owner,mintAuthority:key(token.mintAuthority),freezeAuthority:key(token.freezeAuthority),decimals:token.decimals,
  unexpectedExtensions:getExtensionTypes(token.tlvData).filter(t=>!ALLOWED_EXTENSIONS.has(t)).map(t=>ExtensionType[t]??String(t)),
  transferFee:fee?{configAuthority:key(fee.transferFeeConfigAuthority),withdrawWithheldAuthority:key(fee.withdrawWithheldAuthority),older:f(fee.olderTransferFee),newer:f(fee.newerTransferFee)}:null};
}
export function decodeFreezePool(address,account){
 const p=sdk.LaunchpadPool.decode(Buffer.from(account.data));
 return {address:String(address),owner:String(account.owner),mint:String(p.mintA),quoteMint:String(p.mintB),platform:String(p.platformId),status:p.status};
}

const proofs=new WeakMap();
/** One fresh finalized read of mint and pool in a single call, bracketed by epoch reads. */
export async function observeFeeFreezeCandidate(connection,policy,{clock=Date.now}={}){
 const genesis=await connection.getGenesisHash();
 const before=await connection.getEpochInfo('finalized');
 const read=await connection.getMultipleAccountsInfoAndContext([new PublicKey(policy.mint),new PublicKey(policy.pool)],{commitment:'finalized',minContextSlot:before.absoluteSlot});
 if(!Number.isSafeInteger(read?.context?.slot)||read.context.slot<before.absoluteSlot||read.value?.length!==2)throw Error('Exact finalized mint and pool read required.');
 const after=await connection.getEpochInfo({commitment:'finalized',minContextSlot:read.context.slot});
 const [mintAccount,poolAccount]=read.value;
 const observed={genesis,epoch:after.epoch,epochStable:before.epoch===after.epoch,slot:read.context.slot,observedAt:clock(),
  mint:mintAccount?decodeFreezeMint(policy.mint,mintAccount):null,pool:poolAccount?decodeFreezePool(policy.pool,poolAccount):null,
  accountFingerprint:mintAccount?rewardsDigest({owner:String(mintAccount.owner),data:Buffer.from(mintAccount.data).toString('base64')}):null};
 const refusals=feeFreezeRefusals(observed,policy);
 if(refusals.length)return Object.freeze({ready:false,policy,observed,refusals});
 const candidate=Object.freeze({ready:true,policy,observed:Object.freeze(observed),refusals:[]});
 proofs.set(candidate,rewardsDigest({policy,observed}));
 return candidate;
}

/** Canonical unsigned review transaction: compute limit + SetAuthority(TransferFeeConfig → None).
 * Fee payer and only signer is the current tax-rate authority. Nothing here signs or sends. */
export function compileFeeFreezeTransaction(candidate,{blockhash,now=Date.now()}={}){
 if(candidate?.ready!==true||proofs.get(candidate)!==rewardsDigest({policy:candidate.policy,observed:candidate.observed}))throw Error('A ready, unmodified fee-freeze observation is required.');
 if(!Number.isSafeInteger(now)||now<candidate.observed.observedAt||now-candidate.observed.observedAt>FEE_FREEZE_FRESHNESS_MS)throw Error('Observation is older than 30 seconds; observe again.');
 if(typeof blockhash!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(blockhash))throw Error('Recent blockhash required.');
 const authority=new PublicKey(candidate.policy.authority),mint=new PublicKey(candidate.policy.mint);
 const instructions=[ComputeBudgetProgram.setComputeUnitLimit({units:FEE_FREEZE_COMPUTE_UNITS}),createSetAuthorityInstruction(mint,authority,AuthorityType.TransferFeeConfig,null,[],TOKEN_2022_PROGRAM_ID)];
 const transaction=new VersionedTransaction(new TransactionMessage({payerKey:authority,recentBlockhash:blockhash,instructions}).compileToV0Message());
 assertFeeFreezeMessage(transaction,candidate.policy);
 return {transaction,unsigned:true,executionEnabled:FEE_FREEZE_EXECUTION_ENABLED[candidate.policy.kind]===true,
  review:{mint:candidate.policy.mint,program:candidate.policy.program,authorityToRevoke:candidate.policy.authority,frozenRate:{basisPoints:candidate.policy.basisPoints,maximumFee:candidate.policy.maximumFee},
   observedSlot:candidate.observed.slot,observedEpoch:candidate.observed.epoch,accountFingerprint:candidate.observed.accountFingerprint,
   effect:'Removes the ability to change this token\'s transfer fee. The fee stays at the frozen rate forever. Withdrawal of withheld tax is unchanged.',irreversible:true}};
}

/** Byte-exact shape check for a reviewed or wallet-returned message. Only the blockhash may differ by input. */
export function assertFeeFreezeMessage(transaction,policy){
 const m=transaction?.message;
 if(!m||m.version!==0||m.addressTableLookups.length)throw Error('Fee freeze must be a v0 message without lookup tables.');
 if(m.header.numRequiredSignatures!==1||!m.staticAccountKeys[0].equals(new PublicKey(policy.authority)))throw Error('The current tax-rate authority must be the only signer and fee payer.');
 const writable=m.staticAccountKeys.filter((_,i)=>m.isAccountWritable(i)).map(String).sort();
 if(JSON.stringify(writable)!==JSON.stringify([policy.authority,policy.mint].sort()))throw Error('Only the authority (fee payer) and the mint may be writable.');
 const expected=new VersionedTransaction(new TransactionMessage({payerKey:new PublicKey(policy.authority),recentBlockhash:m.recentBlockhash,instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:FEE_FREEZE_COMPUTE_UNITS}),createSetAuthorityInstruction(new PublicKey(policy.mint),new PublicKey(policy.authority),AuthorityType.TransferFeeConfig,null,[],TOKEN_2022_PROGRAM_ID)]}).compileToV0Message());
 if(!Buffer.from(expected.message.serialize()).equals(Buffer.from(m.serialize())))throw Error('Message differs from the canonical fee-freeze instruction.');
 if(!transaction.signatures.every(s=>s.every(b=>b===0)))throw Error('Review transactions must be unsigned.');
 return true;
}

/** Graduation mechanism (review list only): from a watcher snapshot and registered launches, list
 * graduated mints whose tax-rate authority still sits with the collector. It never executes. */
export function graduatedFeeFreezeQueue(snapshot,launches){
 if(snapshot?.status!=='OBSERVED'||snapshot.discoveryComplete!==true)return {complete:false,reason:'Watcher snapshot incomplete; no queue is produced from partial evidence.',items:[]};
 const accounts=new Map(snapshot.accounts.map(a=>[a.address,a])),registered=new Map((launches??[]).map(l=>[l.mint,l]));
 const items=[];
 for(const p of snapshot.pools){
  if(p.status!==GRADUATED||p.mint===REWARDS_DEPLOYMENT.officialGrainMint)continue;
  const decoded=accounts.get(p.mint)?.decoded,launch=registered.get(p.mint);
  if(decoded?.transferFeeConfigAuthority===null){items.push({mint:p.mint,pool:p.pool,state:'already-frozen'});continue;}
  if(!launch){items.push({mint:p.mint,pool:p.pool,state:'blocked',reason:'No registered launch record with the creation-time tax.'});continue;}
  try{const policy=graduatedFeeFreezePolicy(launch);items.push({mint:p.mint,pool:p.pool,state:'review-candidate',expectedBasisPoints:policy.basisPoints,note:'Needs a fresh observeFeeFreezeCandidate read and owner approval.'});}
  catch(error){items.push({mint:p.mint,pool:p.pool,state:'blocked',reason:error.message});}
 }
 return {complete:true,automaticExecution:false,items};
}
