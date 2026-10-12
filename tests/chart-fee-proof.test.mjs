import test from 'node:test';import assert from 'node:assert/strict';import bs58 from 'bs58';
import {PublicKey} from '@solana/web3.js';import * as sdk from '@raydium-io/raydium-sdk-v2';
import {TOKEN_2022_PROGRAM_ID,MintLayout,getMintLen,ExtensionType,TransferFeeConfigLayout} from '@solana/spl-token';
import {parseChainEvents,parseChartTradeEvents} from '../lib/chain-events.mjs';import {readChartFeeProof,chartTransferFee} from '../lib/chart-fee-proof.mjs';
import {decodeChartTrades} from '../lib/chart-trade-decoder.mjs';
import {POLICY,grainpadPlatformId} from '../lib/platform-policy.mjs';import {QUOTES} from '../lib/quote-assets.mjs';
const key=n=>new PublicKey(new Uint8Array(32).fill(n)).toBase58(),record={mint:key(3),creator:key(4),pool:key(5),platformId:grainpadPlatformId().toBase58(),quoteMint:QUOTES.SOL.mint,quoteAsset:'SOL',quoteDecimals:9,rewards:{taxBps:200},verification:'confirmed-on-chain'};
function mintData(){const bytes=Buffer.alloc(getMintLen([ExtensionType.TransferFeeConfig]));MintLayout.encode({mintAuthorityOption:0,mintAuthority:PublicKey.default,supply:1000000000000000n,decimals:6,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:PublicKey.default},bytes);bytes[165]=1;bytes.writeUInt16LE(ExtensionType.TransferFeeConfig,166);bytes.writeUInt16LE(TransferFeeConfigLayout.span,168);TransferFeeConfigLayout.encode({transferFeeConfigAuthority:PublicKey.default,withdrawWithheldAuthority:PublicKey.default,withheldAmount:0n,olderTransferFee:{epoch:1n,maximumFee:1000000000000000n,transferFeeBasisPoints:200},newerTransferFee:{epoch:3n,maximumFee:1000000000000000n,transferFeeBasisPoints:10000}},bytes,170);return bytes;}
const rpc=async(method)=>{if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';if(method==='getEpochInfo')return {epoch:1,absoluteSlot:150,slotIndex:50,slotsInEpoch:100};if(method==='getAccountInfo')return {context:{slot:150},value:{owner:TOKEN_2022_PROGRAM_ID.toBase58(),lamports:1000000,executable:false,data:[mintData().toString('base64'),'base64']}};throw Error('Unexpected read');};
function ambiguous(){
 const keys=Array.from({length:24},(_,i)=>key(i+10)),vault=sdk.getPdaCreatorVault(sdk.LAUNCHPAD_PROGRAM,new PublicKey(record.creator),new PublicKey(record.quoteMint)).publicKey.toBase58();
 for(const [i,k] of [[0,key(1)],[3,record.platformId],[4,record.pool],[9,record.mint],[10,record.quoteMint],[19,POLICY.program],[20,TOKEN_2022_PROGRAM_ID.toBase58()],[21,vault],[22,'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA']])keys[i]=k;
 const swap={programIdIndex:19,accounts:Array.from({length:19},(_,i)=>i),data:bs58.encode(Buffer.concat([Buffer.from('faea0d7bd59c13ec','hex'),Buffer.alloc(24)])),stackHeight:1};
 const transfer=(from,to,amount,base=false)=>{const b=Buffer.alloc(base?10:9);b[0]=base?12:3;b.writeBigUInt64LE(amount,1);if(base)b[9]=6;return {programIdIndex:base?20:22,accounts:base?[from,9,to,0]:[from,to,0],data:bs58.encode(b),stackHeight:2};};
 return {slot:123,blockTime:1790000000,transaction:{message:{accountKeys:keys,instructions:[swap]}},meta:{err:null,preTokenBalances:[{accountIndex:5,mint:record.mint,uiTokenAmount:{amount:'1000000'}}],postTokenBalances:[{accountIndex:5,mint:record.mint,uiTokenAmount:{amount:'3900000'}}],innerInstructions:[{index:0,instructions:[transfer(7,5,5000000n,true),transfer(6,8,990000000n),transfer(6,21,10000000n),transfer(5,23,2000000n,true)]}]}};
}
test('current-epoch per-transfer proof recovers a routed chart price without weakening the financial receipt guard',async()=>{
 const tx=ambiguous();assert.throws(()=>parseChainEvents(tx,'routed',[record],POLICY.cpConfig),/Ambiguous Token/);
 const proof=await readChartFeeProof(rpc,record.mint);assert.equal(proof.fee.transferFeeBasisPoints,200);const rows=parseChartTradeEvents(tx,'routed',[record],POLICY.cpConfig,proof);
 assert.equal(rows.length,1);assert.equal(rows[0].baseAmount,'4900000');assert.equal(rows[0].quoteAmount,'1000000000');assert.equal(rows[0].kind,'buy');assert.equal(rows[0].chartTransferFeeProof.epoch,1);
 assert.throws(()=>parseChainEvents(tx,'routed',[record],POLICY.cpConfig),/Ambiguous Token/);
 assert.equal(chartTransferFee(proof,tx,record.mint,5000001n),100001n);
 assert.throws(()=>parseChartTradeEvents(tx,'routed',[record],POLICY.cpConfig,{...proof}),/proof required/);
 assert.throws(()=>parseChartTradeEvents({...tx,slot:99},'routed',[record],POLICY.cpConfig,proof),/proof required/);
 assert.throws(()=>parseChartTradeEvents({...tx,slot:200},'routed',[record],POLICY.cpConfig,proof),/proof required/);
 assert.throws(()=>chartTransferFee(proof,tx,key(30),1n),/proof required/);
 assert.throws(()=>chartTransferFee(proof,tx,record.mint,1n,proof.expiresAt+1),/proof required/);
});
test('a wrong-genesis source cannot create a chart fee proof',async()=>{await assert.rejects(readChartFeeProof(async()=> 'foreign',key(31)),/mainnet/);});

test('an unavailable closed recipient balance still requires the verified epoch proof for chart-only decoding',async()=>{
 const tx=ambiguous();tx.meta.postTokenBalances=[];
 assert.throws(()=>parseChainEvents(tx,'closed-recipient',[record],POLICY.cpConfig),/balance receipt unavailable/);
 const rows=await decodeChartTrades(rpc,tx,'closed-recipient',record,POLICY.cpConfig);
 assert.equal(rows.length,1);assert.equal(rows[0].baseAmount,'4900000');assert.equal(rows[0].chartTransferFeeProof.epoch,1);
 assert.throws(()=>parseChainEvents(tx,'closed-recipient',[record],POLICY.cpConfig),/balance receipt unavailable/);
 await assert.rejects(decodeChartTrades(rpc,{...tx,slot:99},'old-recipient',record,POLICY.cpConfig),/proof required/);
});

test('an epoch rollover retains a provably unchanged active fee for the immediately previous normal epoch',async()=>{
 const mint=key(40),rpc2=async(method)=>{if(method==='getEpochInfo')return {epoch:2,absoluteSlot:250,slotIndex:50,slotsInEpoch:100};if(method==='getAccountInfo'){const value=await rpc(method);value.context.slot=250;return value;}return rpc(method);};
 const proof=await readChartFeeProof(rpc2,mint);assert.equal(proof.currentFirstSlot,200);assert.equal(proof.firstSlot,100);
 assert.equal(chartTransferFee(proof,{slot:123},mint,5000000n),100000n);
 assert.throws(()=>chartTransferFee(proof,{slot:99},mint,5000000n),/proof required/);
 assert.throws(()=>chartTransferFee(proof,{slot:300},mint,5000000n),/proof required/);
 const tx=ambiguous(),real=await readChartFeeProof(rpc2,record.mint,Date.now(),250);
 const rows=parseChartTradeEvents(tx,'retained-epoch',[record],POLICY.cpConfig,real);assert.equal(rows[0].baseAmount,'4900000');assert.equal(rows[0].chartTransferFeeProof.epoch,1);assert.equal(rows[0].chartTransferFeeProof.observedEpoch,2);
 assert.throws(()=>parseChainEvents(tx,'retained-epoch',[record],POLICY.cpConfig),/Ambiguous Token/);
});

test('a fee activated this epoch never certifies the previous epoch, and a rollover refreshes a cached proof',async()=>{
 let epoch=3;const changing=async(method)=>{if(method==='getEpochInfo')return {epoch,absoluteSlot:epoch*100+50,slotIndex:50,slotsInEpoch:100};if(method==='getAccountInfo'){const value=await rpc(method);value.context.slot=epoch*100+50;return value;}return rpc(method);};
 const current=await readChartFeeProof(changing,key(41));assert.equal(current.fee.transferFeeBasisPoints,10000);assert.equal(current.firstSlot,300);
 assert.throws(()=>chartTransferFee(current,{slot:250},key(41),5000000n),/proof required/);
 epoch=1;const before=await readChartFeeProof(changing,key(42));assert.equal(before.lastSlot,199);
 epoch=2;const after=await readChartFeeProof(changing,key(42),Date.now(),250);assert.equal(after.epoch,2);assert.equal(after.firstSlot,100);assert.equal(chartTransferFee(after,{slot:123},key(42),5000000n),100000n);
});
