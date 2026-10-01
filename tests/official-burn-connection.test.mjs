/** The readiness script fetches the first burn with a real web3.js Connection. This drives that Connection
 * over a raw JSON-RPC getTransaction response (v0, json encoding), so the decoder sees the shapes web3.js returns:
 * PublicKey keys, compiledInstructions bytes, base58 inner instructions and PublicKey loaded addresses. */
import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {Connection,Keypair,PublicKey} from '@solana/web3.js';
import {fetchOfficialBurnEvidence,officialBurnEvidenceError} from '../lib/official-burn-evidence.mjs';
const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const LAUNCH='LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj',TOKEN_2022='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const payer=Keypair.fromSeed(new Uint8Array(32).fill(81)).publicKey.toBase58();
const mint=Keypair.fromSeed(new Uint8Array(32).fill(82)).publicKey.toBase58();
const ata=Keypair.fromSeed(new Uint8Array(32).fill(83)).publicKey.toBase58();
const pool=Keypair.fromSeed(new Uint8Array(32).fill(84)).publicKey.toBase58();
const signature=bs58.encode(Buffer.alloc(64,9));
function burnData(amount){const data=Buffer.alloc(9);data[0]=8;data.writeBigUInt64LE(amount,1);return bs58.encode(data);}
/** loaded: the mint arrives through a lookup table; inner: the burn is a CPI. */
function rpcTransaction({amount=5n,err=null,loaded=false,inner=false}={}){
 const accountKeys=loaded?[payer,ata,LAUNCH,TOKEN_2022,pool]:[payer,ata,LAUNCH,TOKEN_2022,pool,mint];
 const mintIndex=5;
 const buy={programIdIndex:2,accounts:[0,4,mintIndex,1],data:bs58.encode(Buffer.from([1,2,3,4,5,6,7,8])),stackHeight:null};
 const burn={programIdIndex:3,accounts:[1,mintIndex,0],data:burnData(amount),stackHeight:inner?2:null};
 return {slot:7,blockTime:null,version:0,
  meta:{err,fee:5000,status:err?{Err:err}:{Ok:null},innerInstructions:inner?[{index:0,instructions:[burn]}]:[],loadedAddresses:{writable:loaded?[mint]:[],readonly:[]},logMessages:[],preBalances:[1,1,1,1,1,1],postBalances:[1,1,1,1,1,1],preTokenBalances:[],postTokenBalances:[],rewards:[],computeUnitsConsumed:1},
  transaction:{signatures:[signature],message:{header:{numRequiredSignatures:1,numReadonlySignedAccounts:0,numReadonlyUnsignedAccounts:2},accountKeys,recentBlockhash:PublicKey.default.toBase58(),instructions:inner?[buy]:[buy,burn],addressTableLookups:loaded?[{accountKey:pool,writableIndexes:[0],readonlyIndexes:[]}]:[]}}};
}
function connection(result){
 return new Connection('http://127.0.0.1:9',{commitment:'finalized',fetch:async(_url,init)=>{
  const body=JSON.parse(init.body);
  const value=body.method==='getGenesisHash'?MAINNET:body.method==='getTransaction'?result:null;
  return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result:value}),{headers:{'Content-Type':'application/json'}});
 }});
}
test('a real Connection response for a buy-and-burn of the pinned mint is accepted',async()=>{
 for(const shape of [{},{loaded:true},{inner:true}]){
  const burn=await fetchOfficialBurnEvidence(connection(rpcTransaction(shape)),{signature,pinnedMint:mint});
  assert.equal(burn.mint,mint);assert.equal(burn.burnedRaw,'5');assert.equal(burn.source,'primary-mainnet-rpc');
  assert.equal(officialBurnEvidenceError({checks:{grainBuybackBurnFinalized:true},officialBurn:burn},{pinnedMint:mint}),null);
 }
});
test('a real Connection response is still refused for a failure, a zero burn or another mint',async()=>{
 await assert.rejects(fetchOfficialBurnEvidence(connection(rpcTransaction({err:{InstructionError:[1,'Custom']}})),{signature,pinnedMint:mint}),/successful finalized/);
 await assert.rejects(fetchOfficialBurnEvidence(connection(rpcTransaction({amount:0n})),{signature,pinnedMint:mint}),/buy and burn/);
 await assert.rejects(fetchOfficialBurnEvidence(connection(rpcTransaction()),{signature,pinnedMint:pool}),/buy and burn/);
 await assert.rejects(fetchOfficialBurnEvidence(connection(null),{signature,pinnedMint:mint}),/successful finalized/);
});
