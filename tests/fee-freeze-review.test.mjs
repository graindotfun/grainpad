import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicKey,Keypair,VersionedTransaction,TransactionMessage,ComputeBudgetProgram} from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import {GRAIN_FEE_FREEZE_POLICY,FEE_FREEZE_EXECUTION_ENABLED,assertFeeFreezeExecutionEnabled,graduatedFeeFreezePolicy,feeFreezeRefusals,observeFeeFreezeCandidate,compileFeeFreezeTransaction,assertFeeFreezeMessage,graduatedFeeFreezeQueue,LAUNCH_MAXIMUM_FEE_RAW} from '../lib/fee-freeze-review.mjs';
import {grainpadPlatformId} from '../lib/platform-policy.mjs';
import {QUOTES} from '../lib/quote-assets.mjs';

const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const P=GRAIN_FEE_FREEZE_POLICY,BLOCKHASH='11111111111111111111111111111111';
function mintAccount({config=P.authority,withdraw=P.withdrawAuthority,older=200,newer=older,olderMax=LAUNCH_MAXIMUM_FEE_RAW,newerMax=olderMax,newerEpoch=1050n,mintAuthority=null,freeze=null,decimals=6,extra=[]}={}){
 const fee=Buffer.alloc(spl.TRANSFER_FEE_CONFIG_SIZE),k=v=>v?new PublicKey(v):PublicKey.default;
 spl.TransferFeeConfigLayout.encode({transferFeeConfigAuthority:k(config),withdrawWithheldAuthority:k(withdraw),withheldAmount:0n,olderTransferFee:{epoch:1050n,maximumFee:BigInt(olderMax),transferFeeBasisPoints:older},newerTransferFee:{epoch:newerEpoch,maximumFee:BigInt(newerMax),transferFeeBasisPoints:newer}},fee);
 const base=Buffer.alloc(166);spl.MintLayout.encode({mintAuthorityOption:mintAuthority?1:0,mintAuthority:k(mintAuthority),supply:10n**15n,decimals,isInitialized:true,freezeAuthorityOption:freeze?1:0,freezeAuthority:k(freeze)},base);base[165]=1;
 const ext=(type,value)=>{const h=Buffer.alloc(4);h.writeUInt16LE(type);h.writeUInt16LE(value.length,2);return Buffer.concat([h,value]);};
 return {owner:spl.TOKEN_2022_PROGRAM_ID,data:Buffer.concat([base,ext(spl.ExtensionType.TransferFeeConfig,fee),...extra.map(t=>ext(t,Buffer.alloc(t===spl.ExtensionType.PermanentDelegate?32:0)))]),lamports:1,executable:false};
}
function poolAccount({status=2,mint=P.mint,platform=P.platform}={}){
 const p=sdk.LaunchpadPool.decode(Buffer.alloc(sdk.LaunchpadPool.span));
 Object.assign(p,{status,mintA:new PublicKey(mint),mintB:new PublicKey(QUOTES.wXMR.mint),platformId:new PublicKey(platform),configId:new PublicKey(QUOTES.wXMR.config),creator:PublicKey.default,supply:new BN(0),totalSellA:new BN(0),totalFundRaisingB:new BN(0)});
 const data=Buffer.alloc(sdk.LaunchpadPool.span);sdk.LaunchpadPool.encode(p,data);return {owner:sdk.LAUNCHPAD_PROGRAM,data,lamports:1,executable:false};
}
function connection({mint=mintAccount(),pool=poolAccount(),epochs=[1050,1050],genesis=MAINNET}={}){
 let n=0;
 return {getGenesisHash:async()=>genesis,getEpochInfo:async()=>({epoch:epochs[Math.min(n++,1)],absoluteSlot:453991000}),
  getMultipleAccountsInfoAndContext:async keys=>{assert.deepEqual(keys.map(String),[P.mint,P.pool]);return {context:{slot:453991042},value:[mint,pool]};},
  sendTransaction:()=>assert.fail('must never send'),signTransaction:()=>assert.fail('must never sign')};
}
const codes=r=>r.refusals.map(x=>x.code);

test('GRAIN policy pins the verified evidence: 2%, full-supply maximum, collector authority, graduated pool',()=>{
 assert.equal(P.mint,'FCN2KLyUGT9EddKf8MZYjPce8CWxUid7nWpAx9ograin');assert.equal(P.pool,'BvvuZ87WjoUyAuTZ4sLVFAwz8EVWXcZfe4RTwifayxQ2');
 assert.equal(P.basisPoints,200);assert.equal(P.maximumFee,'1000000000000000');assert.equal(P.authority,'BxJZSApDy7i4VVAQSRCL5FQJ2RCCP676PUWKYEcY1Z6i');
 assert.equal(P.platform,String(grainpadPlatformId()));assert(Object.isFrozen(P));
});

test('execution is disabled for GRAIN and for graduated launches; nothing auto-revokes',()=>{
 assert.deepEqual({...FEE_FREEZE_EXECUTION_ENABLED},{grain:false,graduated:false});
 assert.throws(()=>assertFeeFreezeExecutionEnabled('grain'),/not approved/);assert.throws(()=>assertFeeFreezeExecutionEnabled('graduated'),/not approved/);
});

test('a fresh matching GRAIN observation compiles one canonical unsigned SetAuthority(None) transaction',async()=>{
 const c=await observeFeeFreezeCandidate(connection(),P,{clock:()=>1000});
 assert.equal(c.ready,true,JSON.stringify(c.refusals));
 const {transaction,unsigned,executionEnabled,review}=compileFeeFreezeTransaction(c,{blockhash:BLOCKHASH,now:5000});
 assert.equal(unsigned,true);assert.equal(executionEnabled,false);assert.equal(review.irreversible,true);
 assert(transaction.signatures.every(s=>s.every(b=>b===0)));
 const ix=TransactionMessage.decompile(transaction.message).instructions.at(-1);
 assert(ix.programId.equals(spl.TOKEN_2022_PROGRAM_ID));
 const decoded=spl.decodeSetAuthorityInstruction(ix,spl.TOKEN_2022_PROGRAM_ID);
 assert.equal(decoded.data.authorityType,spl.AuthorityType.TransferFeeConfig);assert.equal(decoded.data.newAuthority,null);
 assert(decoded.keys.account.pubkey.equals(new PublicKey(P.mint)));assert(decoded.keys.currentAuthority.pubkey.equals(new PublicKey(P.authority)));
});

test('stale, tampered or never-observed candidates refuse to compile',async()=>{
 const c=await observeFeeFreezeCandidate(connection(),P,{clock:()=>1000});
 assert.throws(()=>compileFeeFreezeTransaction(c,{blockhash:BLOCKHASH,now:31001}),/older than 30 seconds/);
 assert.throws(()=>compileFeeFreezeTransaction({...c},{blockhash:BLOCKHASH,now:2000}),/unmodified/);
 assert.throws(()=>compileFeeFreezeTransaction(c,{blockhash:'not-a-hash',now:2000}),/blockhash/);
});

for(const [name,setup,code] of [
 ['a future-scheduled fee (revocation would not cancel it)',{mint:mintAccount({newer:10000,newerEpoch:1052n})},'scheduled'],
 ['a rate other than 2%',{mint:mintAccount({older:300,newer:300})},'rate'],
 ['a different maximum fee',{mint:mintAccount({olderMax:'999'})},'rate'],
 ['a matured change that left older ≠ newer',{mint:mintAccount({older:100,newer:200})},'rate'],
 ['an already revoked tax-rate authority',{mint:mintAccount({config:null})},'authority'],
 ['an unexpected tax-rate authority',{mint:mintAccount({config:String(Keypair.generate().publicKey)})},'authority'],
 ['a changed withdraw authority',{mint:mintAccount({withdraw:String(Keypair.generate().publicKey)})},'withdraw-authority'],
 ['a live mint authority',{mint:mintAccount({mintAuthority:String(Keypair.generate().publicKey)})},'mint-authorities'],
 ['a live freeze authority',{mint:mintAccount({freeze:String(Keypair.generate().publicKey)})},'mint-authorities'],
 ['an unexpected Token-2022 extension',{mint:mintAccount({extra:[spl.ExtensionType.PermanentDelegate]})},'extensions'],
 ['a pool that has not graduated',{pool:poolAccount({status:0})},'not-graduated'],
 ['a pool attributed to another platform',{pool:poolAccount({platform:String(Keypair.generate().publicKey)})},'attribution'],
 ['a missing pool',{pool:null},'pool-missing'],
 ['a missing mint',{mint:null},'mint-missing'],
 ['an epoch boundary during the read',{epochs:[1050,1051]},'epoch'],
 ['a non-mainnet genesis',{genesis:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'},'network'],
 ['a classic SPL mint instead of Token-2022',{mint:{...mintAccount(),owner:spl.TOKEN_PROGRAM_ID}},'program'],
])test(`refuses ${name}`,async()=>{
 const c=await observeFeeFreezeCandidate(connection(setup),P,{clock:()=>1000});
 assert.equal(c.ready,false);assert(codes(c).includes(code),JSON.stringify(c.refusals));
 assert.throws(()=>compileFeeFreezeTransaction(c,{blockhash:BLOCKHASH,now:2000}),/ready/);
});

test('message guard rejects added instructions, extra writable accounts and signatures',async()=>{
 const c=await observeFeeFreezeCandidate(connection(),P,{clock:()=>1000}),{transaction}=compileFeeFreezeTransaction(c,{blockhash:BLOCKHASH,now:2000});
 assert.equal(assertFeeFreezeMessage(transaction,P),true);
 const extra=new VersionedTransaction(new TransactionMessage({payerKey:new PublicKey(P.authority),recentBlockhash:BLOCKHASH,instructions:[...TransactionMessage.decompile(transaction.message).instructions,ComputeBudgetProgram.setComputeUnitPrice({microLamports:1})]}).compileToV0Message());
 assert.throws(()=>assertFeeFreezeMessage(extra,P),/canonical/);
 const changeFee=new VersionedTransaction(new TransactionMessage({payerKey:new PublicKey(P.authority),recentBlockhash:BLOCKHASH,instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:20000}),spl.createSetTransferFeeInstruction(new PublicKey(P.mint),new PublicKey(P.authority),[],10000,10n**15n,spl.TOKEN_2022_PROGRAM_ID)]}).compileToV0Message());
 assert.throws(()=>assertFeeFreezeMessage(changeFee,P),/canonical/);
 const signed=VersionedTransaction.deserialize(transaction.serialize());signed.signatures[0][0]=1;
 assert.throws(()=>assertFeeFreezeMessage(signed,P),/unsigned/);
});

test('graduated-launch policy takes the rate from the registered launch, inside the approved range only',()=>{
 const mint=String(Keypair.generate().publicKey),pool=String(Keypair.generate().publicKey),platformId=String(grainpadPlatformId());
 const policy=graduatedFeeFreezePolicy({mint,pool,platformId,rewards:{taxBps:150}});
 assert.equal(policy.basisPoints,150);assert.equal(policy.maximumFee,LAUNCH_MAXIMUM_FEE_RAW);assert.equal(policy.kind,'graduated');
 for(const taxBps of [99,301,undefined,1.5])assert.throws(()=>graduatedFeeFreezePolicy({mint,pool,platformId,rewards:{taxBps}}),/1–3%/);
 assert.throws(()=>graduatedFeeFreezePolicy({mint,pool,platformId:String(Keypair.generate().publicKey),rewards:{taxBps:150}}),/Grainpad launch/);
 assert.throws(()=>graduatedFeeFreezePolicy({mint:P.mint,pool,platformId,rewards:{taxBps:200}}),/own pinned policy/);
});

test('graduation queue is review-only, refuses partial evidence and needs registered rates',()=>{
 const [a,b,c,d,pa]=Array.from({length:5},()=>String(Keypair.generate().publicKey)),platformId=String(grainpadPlatformId());
 const snapshot={status:'OBSERVED',discoveryComplete:true,pools:[{mint:a,pool:pa,status:2},{mint:b,pool:'pb',status:2},{mint:c,pool:'pc',status:0},{mint:d,pool:'pd',status:2},{mint:P.mint,pool:P.pool,status:2}],
  accounts:[{address:a,decoded:{transferFeeConfigAuthority:P.authority}},{address:b,decoded:{transferFeeConfigAuthority:null}},{address:d,decoded:{transferFeeConfigAuthority:P.authority}}]};
 const q=graduatedFeeFreezeQueue(snapshot,[{mint:a,pool:pa,platformId,rewards:{taxBps:100}}]);
 assert.equal(q.automaticExecution,false);
 assert.deepEqual(q.items.map(i=>[i.mint,i.state]),[[a,'review-candidate'],[b,'already-frozen'],[d,'blocked']]);
 assert.equal(graduatedFeeFreezeQueue({...snapshot,status:'INCOMPLETE'},[]).complete,false);
 assert.equal(graduatedFeeFreezeQueue({...snapshot,discoveryComplete:false},[]).items.length,0);
});

test('pure refusal check reports every problem at once',()=>{
 const r=feeFreezeRefusals({genesis:MAINNET,epoch:1050,epochStable:true,mint:{address:P.mint,owner:String(spl.TOKEN_2022_PROGRAM_ID),mintAuthority:'x',freezeAuthority:null,decimals:6,unexpectedExtensions:[],transferFee:{configAuthority:P.authority,withdrawWithheldAuthority:P.withdrawAuthority,older:{epoch:'1050',basisPoints:200,maximumFee:LAUNCH_MAXIMUM_FEE_RAW},newer:{epoch:'1052',basisPoints:500,maximumFee:LAUNCH_MAXIMUM_FEE_RAW}}},pool:{owner:String(sdk.LAUNCHPAD_PROGRAM),mint:P.mint,quoteMint:P.quoteMint,platform:P.platform,status:1}},P);
 const c=r.map(x=>x.code);for(const code of ['mint-authorities','scheduled','rate','not-graduated'])assert(c.includes(code),code);
});
