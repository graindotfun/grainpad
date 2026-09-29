// Independent verification (Claude). Registration attribution: creator identity, signed metadata
// and creator declarations. Deterministic in-memory storage and account fixtures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Buffer} from 'buffer';
import {Keypair,PublicKey} from '@solana/web3.js';
import {NATIVE_MINT} from '@solana/spl-token';
import * as s from '@raydium-io/raydium-sdk-v2';
import {grainpadPlatformId} from '../lib/platform-policy.mjs';
import {SITE} from '../lib/site-config.ts';
import {QUOTES} from '../lib/quote-assets.mjs';
import {AWAITING_FINALIZATION,CONFIRMED_ON_CHAIN,LAUNCH_PROGRAMS,LAUNCH_RECORD_VERSION,METADATA_PROGRAM,TOKEN_PROGRAM,registerLaunch,isLaunchFinalizing} from '../lib/launch-registration.mjs';
// Reproductions are mandatory regression checks in the integrated candidate.

const network='mainnet-beta',program=LAUNCH_PROGRAMS[network],platform=grainpadPlatformId();
const mint=new PublicKey('CzvYJXb3e4KtTd2xZviV9nMUSAC1jary4wLY4cVhwgrn');
const prove=async()=>({status:'PASS',slot:9});
const hashJson=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');

function memory(){
 const objects=new Map(),etag=b=>createHash('sha256').update(b).digest('hex');
 return {objects,
  get:async k=>objects.has(k)?{text:async()=>objects.get(k),httpEtag:etag(objects.get(k))}:null,
  put:async(k,v)=>{objects.set(k,String(v));},
  compareAndSet:async(k,expected,payload)=>{const cur=objects.has(k)?objects.get(k):null;if((cur===null?null:etag(cur))!==(expected??null))return {conflict:true,row:cur?JSON.parse(cur):null};objects.set(k,payload);return {conflict:false,row:JSON.parse(payload)};},
 };
}
function pdas(){
 const pool=PublicKey.findProgramAddressSync([Buffer.from('pool'),mint.toBuffer(),NATIVE_MINT.toBuffer()],new PublicKey(program))[0];
 const meta=PublicKey.findProgramAddressSync([Buffer.from('metadata'),new PublicKey(METADATA_PROGRAM).toBuffer(),mint.toBuffer()],new PublicKey(METADATA_PROGRAM))[0];
 return {pool,meta};
}
function accounts(creator,meta,platformId=platform){
 const {pool,meta:metaPda}=pdas(),uri=`${SITE.origin}/api/assets/${hashJson(meta)}`;
 const p=s.LaunchpadPool.decode(Buffer.alloc(s.LaunchpadPool.span));
 Object.assign(p,{mintA:mint,mintB:NATIVE_MINT,platformId,creator,configId:new PublicKey(QUOTES.SOL.config)});
 const poolData=Buffer.alloc(s.LaunchpadPool.span);s.LaunchpadPool.encode(p,poolData);
 const mintData=Buffer.alloc(82);mintData.writeBigUInt64LE(1_000_000_000_000_000n,36);mintData[44]=6;mintData[45]=1;
 const str=v=>{const b=Buffer.from(v);const o=Buffer.alloc(4+b.length);o.writeUInt32LE(b.length);b.copy(o,4);return o;};
 const metaData=Buffer.concat([Buffer.alloc(1),Buffer.alloc(32),mint.toBuffer(),str(meta.name),str(meta.symbol),str(uri)]);
 const enc=(owner,data)=>({owner,data:[data.toString('base64'),'base64']});
 return {[pool.toBase58()]:enc(program,poolData),[metaPda.toBase58()]:enc(METADATA_PROGRAM,metaData),[mint.toBase58()]:enc(TOKEN_PROGRAM,mintData)};
}
function chain({finalized={},confirmed={}}){
 return async(method,params=[])=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getMultipleAccounts'){const t=params[1]?.commitment==='confirmed'?{...finalized,...confirmed}:finalized;return {value:params[0].map(a=>t[a]??null)};}
  throw Error('unexpected '+method);
 };
}
const metadata=extra=>({name:'Seed Cat',symbol:'SEED',description:'fixture',image:`${SITE.origin}/api/assets/${'ab'.repeat(32)}`,...extra});

test('REG-1: another wallet\'s signed metadata does not become the on-chain creator\'s declaration',async()=>{
 const author=Keypair.generate().publicKey,copycat=Keypair.generate().publicKey;
 const meta=metadata({grainpad:{quoteAsset:'SOL',declaredCreatorBuy:'5'}}),hash=hashJson(meta),storage=memory();
 // The original author uploaded and signed this metadata. The copycat never did.
 storage.objects.set(`assets/${hash}`,JSON.stringify(meta));
 storage.objects.set(`owners/${hash}/${author}`,JSON.stringify({createdAt:'2026-09-29T00:00:00.000Z',metadata:meta}));
 let row=null;
 try{row=await registerLaunch({network,mint:mint.toBase58(),storage,chain:chain({finalized:accounts(copycat,meta)}),prove});}
 catch{/* Refusing registration also satisfies the requirement. */}
 if(row){
  assert.equal(row.creator,copycat.toBase58());
  assert.equal(row.declaredCreatorBuy,null,'A creator-buy declaration authored by another wallet is attributed to the on-chain creator.');
 }
});

test('registration before finality is never a confirmed launch and rejects a foreign PlatformConfig',async()=>{
 const creator=Keypair.generate().publicKey,meta=metadata(),storage=memory();
 storage.objects.set(`assets/${hashJson(meta)}`,JSON.stringify(meta));
 storage.objects.set(`owners/${hashJson(meta)}/${creator}`,JSON.stringify({metadata:meta}));
 await assert.rejects(registerLaunch({network,mint:mint.toBase58(),storage,chain:chain({confirmed:accounts(creator,meta)}),prove}),e=>isLaunchFinalizing(e));
 const pending=JSON.parse(storage.objects.get(`launches/${network}/${mint}`));
 assert.equal(pending.verification,AWAITING_FINALIZATION);assert.equal(pending.creator,creator.toBase58());
 // A supplied owner that differs from the on-chain creator is refused before finality too.
 await assert.rejects(registerLaunch({network,mint:mint.toBase58(),owner:Keypair.generate().publicKey.toBase58(),storage,chain:chain({confirmed:accounts(creator,meta)}),prove}),/did not match/);
 const row=await registerLaunch({network,mint:mint.toBase58(),storage,chain:chain({finalized:accounts(creator,meta)}),prove});
 assert.equal(row.verification,CONFIRMED_ON_CHAIN);
 const foreign=memory();foreign.objects.set(`assets/${hashJson(meta)}`,JSON.stringify(meta));
 await assert.rejects(registerLaunch({network,mint:mint.toBase58(),storage:foreign,chain:chain({finalized:accounts(creator,meta,Keypair.generate().publicKey)}),prove}),/PlatformConfig/);
 await assert.rejects(registerLaunch({network,mint:mint.toBase58(),storage:foreign,chain:chain({confirmed:accounts(creator,meta,Keypair.generate().publicKey)}),prove}),/PlatformConfig/);
 assert.equal(foreign.objects.has(`launches/${network}/${mint}`),false);
});

test('metadata that is not stored yet leaves registration retryable instead of listing a partial record',async()=>{
 const creator=Keypair.generate().publicKey,meta=metadata(),storage=memory();
 await assert.rejects(registerLaunch({network,mint:mint.toBase58(),storage,chain:chain({finalized:accounts(creator,meta)}),prove}),/not available yet/);
 assert.equal(storage.objects.has(`launches/${network}/${mint}`),false);
 storage.objects.set(`assets/${hashJson(meta)}`,JSON.stringify(meta));
 const row=await registerLaunch({network,mint:mint.toBase58(),storage,chain:chain({finalized:accounts(creator,meta)}),prove});
 assert.equal(row.verification,CONFIRMED_ON_CHAIN);
});

test('creator claims survive registration; legacy declarations are revalidated before attribution',async()=>{
 const creator=Keypair.generate().publicKey,meta=metadata({grainpad:{quoteAsset:'SOL',declaredCreatorBuy:'5'}}),hash=hashJson(meta),storage=memory();
 storage.objects.set(`assets/${hash}`,JSON.stringify(meta));
 storage.objects.set(`owners/${hash}/${creator}`,JSON.stringify({metadata:meta}));
 const args={network,mint:mint.toBase58(),storage,chain:chain({finalized:accounts(creator,meta)}),prove};
 const signed=await registerLaunch(args);
 assert.equal(signed.creatorMetadataClaimed,true);assert.equal(signed.declaredCreatorBuy,'5');
 // Old cached rows cannot grandfather in an unbound declaration.
 storage.objects.delete(`owners/${hash}/${creator}`);
 storage.objects.set(`launches/${network}/${mint}`,JSON.stringify({...signed,recordVersion:LAUNCH_RECORD_VERSION-1}));
 const recovered=await registerLaunch(args);
 assert.equal(recovered.recordVersion,LAUNCH_RECORD_VERSION);
 assert.equal(recovered.creatorMetadataClaimed,false);assert.equal(recovered.declaredCreatorBuy,null);
});
