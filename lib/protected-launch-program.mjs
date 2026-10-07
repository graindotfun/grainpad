/** Unsigned client for the experimental PDA escrow. No wallet calls or submission.
 * The namespace below is LOCAL ONLY. Public execution remains disabled.
 */
import {Buffer} from 'buffer';
import {sha256} from '@noble/hashes/sha256';
import {PublicKey,TransactionInstruction,SystemProgram,SYSVAR_INSTRUCTIONS_PUBKEY,TransactionMessage,VersionedTransaction,AddressLookupTableProgram} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {QUOTES} from './quote-assets.mjs';
import {protectedRaw} from './protected-launch-economics.mjs';
import {grainpadPlatformId,POLICY} from './platform-policy.mjs';
export const PROTECTED_LOCAL_PROGRAM='DRsQYZEX7T54UjS74pVffs1r85qpL4rSuQcPbG3DkbHY';
export const PROTECTED_PROGRAM_PUBLIC_EXECUTION=false;
const key=x=>new PublicKey(x),meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey:key(pubkey),isWritable,isSigner});
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(protectedRaw(String(n)));return b;};
const i64=n=>{if(!Number.isSafeInteger(n)||n<0)throw Error('Nonnegative safe chain time required.');const b=Buffer.alloc(8);b.writeBigInt64LE(BigInt(n));return b;};
const str=s=>{const b=Buffer.from(s),n=Buffer.alloc(4);n.writeUInt32LE(b.length);return Buffer.concat([n,b]);};
const tag=name=>Buffer.from(sha256(Buffer.from('global:'+name))).subarray(0,8);
const hash32=x=>{if(typeof x!=='string'||!/^[a-f0-9]{64}$/.test(x))throw Error('Exact on-chain commitment required.');return Buffer.from(x,'hex');};
const pda=(program,...seeds)=>PublicKey.findProgramAddressSync(seeds.map(s=>typeof s==='string'?Buffer.from(s):s),key(program))[0];
export function encodeProtectedProgramTerms(t){
 if(!t||Object.keys(t).sort().join(',')!==['nonce','opensAt','closesAt','deadline','capRaw','minimumTokenRaw','taxBps','metadataHash','name','symbol','uri'].sort().join(','))throw Error('Exact escrow terms required.');
 if(!(t.opensAt<t.closesAt&&t.closesAt<t.deadline)||protectedRaw(t.capRaw,{positive:true})>=BigInt(QUOTES.wXMR.floor)||protectedRaw(t.minimumTokenRaw,{positive:true})===0n)throw Error('Invalid escrow timing or purchase bounds.');
 if(!Number.isInteger(t.taxBps)||t.taxBps<100||t.taxBps>300||t.taxBps%10)throw Error('Selected 1–3% launch tax required.');
 if(typeof t.name!=='string'||!t.name||Buffer.byteLength(t.name)>32||typeof t.symbol!=='string'||!t.symbol||Buffer.byteLength(t.symbol)>10||typeof t.uri!=='string'||Buffer.byteLength(t.uri)>200||! /^(https:\/\/|ipfs:\/\/)/.test(t.uri))throw Error('Invalid frozen metadata.');
 if(t.metadataHash==='0'.repeat(64))throw Error('Frozen metadata digest is required.');
 const tax=Buffer.alloc(2);tax.writeUInt16LE(t.taxBps);
 return Buffer.concat([u64(t.nonce),i64(t.opensAt),i64(t.closesAt),i64(t.deadline),u64(t.capRaw),u64(t.minimumTokenRaw),tax,hash32(t.metadataHash),str(t.name),str(t.symbol),str(t.uri)]);
}
export function protectedProgramCommitment(terms){return Buffer.from(sha256(encodeProtectedProgramTerms(terms))).toString('hex');}
export function protectedProgramAddresses({creator,nonce,owner=creator,programId=PROTECTED_LOCAL_PROGRAM}){
 const P=key(programId),C=key(creator),O=key(owner),Q=key(QUOTES.wXMR.mint),R=key(POLICY.program),platform=grainpadPlatformId(),config=key(QUOTES.wXMR.config);
 const launch=pda(P,'launch',C.toBuffer(),u64(nonce)),mint=pda(P,'mint',launch.toBuffer()),authority=pda(P,'authority',launch.toBuffer()),pool=pda(R,'pool',mint.toBuffer(),Q.toBuffer());
 return {program:P,creator:C,owner:O,launch,mint,authority,quote:Q,quoteVault:pda(P,'quote',launch.toBuffer()),position:pda(P,'position',launch.toBuffer(),O.toBuffer()),tokenVault:getAssociatedTokenAddressSync(mint,authority,true,TOKEN_2022_PROGRAM_ID),raydium:R,platform,config,
  auth:pda(R,'vault_auth_seed'),pool,vaultA:pda(R,'pool_vault',pool.toBuffer(),mint.toBuffer()),vaultB:pda(R,'pool_vault',pool.toBuffer(),Q.toBuffer()),event:pda(R,'__event_authority'),platformFee:pda(R,platform.toBuffer(),Q.toBuffer()),creatorFee:pda(R,C.toBuffer(),Q.toBuffer()),allow:pda(R,'platform_allow_config',platform.toBuffer(),config.toBuffer()),rule:pda(R,'platform_curve_rule',platform.toBuffer(),config.toBuffer())};
}
const ix=(a,name,keys,data=Buffer.alloc(0))=>new TransactionInstruction({programId:a.program,keys,data:Buffer.concat([tag(name),data])});
export function buildProtectedCreate({creator,terms,programId}){
 const encoded=encodeProtectedProgramTerms(terms),a=protectedProgramAddresses({creator,nonce:terms.nonce,programId});
 return {addresses:a,commitment:protectedProgramCommitment(terms),instruction:ix(a,'create',[meta(a.creator,true,true),meta(a.launch,true),meta(a.mint),meta(a.authority),meta(a.quote),meta(a.quoteVault,true),meta(a.config),meta(a.platform),meta(a.allow),meta(a.rule),meta(TOKEN_PROGRAM_ID),meta(SystemProgram.programId)],encoded)};
}
export function buildProtectedDeposit({creator,nonce,owner,source,amountRaw,commitment,programId}){
 protectedRaw(amountRaw,{positive:true});const a=protectedProgramAddresses({creator,nonce,owner,programId});
 return ix(a,'deposit',[meta(owner,true,true),meta(a.launch,true),meta(a.position,true),meta(source,true),meta(a.quoteVault,true),meta(a.quote),meta(TOKEN_PROGRAM_ID),meta(SystemProgram.programId)],Buffer.concat([u64(amountRaw),hash32(commitment)]));
}
/** Both instructions have exactly identical account metas. begin_conversion
 * checks for its matching terminal instruction in the transaction's sysvar.
 * Caller inserts only the verified funding swaps between these instructions.
 */
export function buildProtectedConversionPair({creator,nonce,owner,inputSource,intermediate,inputRaw,minimumQuoteRaw,commitment,programId}){
 protectedRaw(inputRaw,{positive:true});protectedRaw(minimumQuoteRaw,{positive:true});const a=protectedProgramAddresses({creator,nonce,owner,programId});
 const keys=[meta(owner,true,true),meta(a.launch,true),meta(a.position,true),meta(inputSource,true),meta(intermediate,true),meta(a.quoteVault,true),meta(a.quote),meta(SYSVAR_INSTRUCTIONS_PUBKEY),meta(TOKEN_PROGRAM_ID),meta(SystemProgram.programId)];
 const data=Buffer.concat([u64(inputRaw),u64(minimumQuoteRaw),hash32(commitment)]);
 return {begin:ix(a,'begin_conversion',keys,data),deposit:ix(a,'deposit_converted',keys,data)};
}
export function buildProtectedSettle({creator,nonce,sponsor,programId}){
 const a=protectedProgramAddresses({creator,nonce,programId});
 return ix(a,'settle',[meta(sponsor,true,true),meta(a.launch,true),meta(a.authority,true),meta(a.creator),meta(a.mint,true),meta(a.quote),meta(a.quoteVault,true),meta(a.tokenVault,true),meta(a.raydium),meta(TOKEN_PROGRAM_ID),meta(TOKEN_2022_PROGRAM_ID),meta(ASSOCIATED_TOKEN_PROGRAM_ID),meta(SystemProgram.programId),
 meta(a.auth),meta(a.pool,true),meta(a.config),meta(a.platform),meta(a.vaultA,true),meta(a.vaultB,true),meta(a.event),meta(a.platformFee,true),meta(a.creatorFee,true),meta(a.allow),meta(a.rule)]);
}
export function buildProtectedExpire({creator,nonce,programId}){const a=protectedProgramAddresses({creator,nonce,programId});return ix(a,'expire',[meta(a.launch,true)]);}
export function buildProtectedClaim({creator,nonce,owner,destination,asset,programId}){
 const a=protectedProgramAddresses({creator,nonce,owner,programId});
 if(asset==='wXMR')return ix(a,'claim_quote',[meta(a.launch),meta(a.authority),meta(a.position,true),meta(a.quoteVault,true),meta(a.quote),meta(destination,true),meta(TOKEN_PROGRAM_ID)]);
 if(asset==='token')return ix(a,'claim_tokens',[meta(a.launch),meta(a.authority),meta(a.position,true),meta(a.mint),meta(a.tokenVault,true),meta(destination,true),meta(TOKEN_2022_PROGRAM_ID)]);
 throw Error('Claim wXMR or launch token.');
}
/** No silent split: oversized atomic funding/settlement refuses the transaction. */
export function compileProtectedTransaction({payer,blockhash,instructions,lookupTables=[]}){
 const tx=new VersionedTransaction(new TransactionMessage({payerKey:key(payer),recentBlockhash:blockhash,instructions}).compileToV0Message(lookupTables));
 let size;try{size=tx.serialize().length;}catch{throw Error('Protected transaction exceeds the atomic packet limit; a complete funding lookup table is required.');}
 if(size>1232)throw Error('Protected transaction exceeds the atomic packet limit; a complete funding lookup table is required.');
 return tx;
}

/** Prepare a reusable route table before funding. This separate setup transaction
 * moves no token funds into escrow and never splits the actual swap/deposit.
 * Caller must confirm table extension and wait until its addresses are active.
 */
export function buildProtectedFundingLookup({plan,creator,nonce,owner,recentSlot,programId}){
 if(!Number.isSafeInteger(recentSlot)||recentSlot<0||!Array.isArray(plan?.instructions))throw Error('Recent slot and exact funding plan required.');
 const a=protectedProgramAddresses({creator,nonce,owner,programId});
 const excluded=new Set([a.launch,a.mint,a.authority,a.position,a.quoteVault,a.tokenVault,a.owner,a.creator].map(String));
 for(const i of plan.instructions)for(const k of i.keys)if(k.isSigner)excluded.add(String(k.pubkey));
 const addresses=[...new Map(plan.instructions.flatMap(i=>i.keys).filter(k=>!excluded.has(String(k.pubkey))).map(k=>[String(k.pubkey),k.pubkey])).values()];
 if(!addresses.length||addresses.length>256)throw Error('Funding lookup address set is invalid.');
 const [create,table]=AddressLookupTableProgram.createLookupTable({authority:key(owner),payer:key(owner),recentSlot});
 const extend=[];for(let at=0;at<addresses.length;at+=20)extend.push(AddressLookupTableProgram.extendLookupTable({payer:key(owner),authority:key(owner),lookupTable:table,addresses:addresses.slice(at,at+20)}));
 return {table,addresses,setupTransactions:[[create],...extend.map(i=>[i])],requiresConfirmedActiveTable:true};
}
