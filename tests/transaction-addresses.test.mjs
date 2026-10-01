import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicKey,Keypair,AddressLookupTableAccount,AddressLookupTableProgram,TransactionInstruction,TransactionMessage,VersionedTransaction,ComputeBudgetProgram,SystemProgram} from '@solana/web3.js';
import {loadAddressLookupTables,resolveTransactionAddresses,transactionAddressKeys} from '../lib/transaction-addresses.mjs';
import {decodeReviewedTransaction,inspectWalletTransaction,LIGHTHOUSE_PROGRAM} from '../lib/wallet-transaction-policy.mjs';
import {simulationCostProof} from '../lib/simulation-cost.mjs';
import {createSimulationConnection} from '../lib/simulation-connection.mjs';
const key=n=>Keypair.fromSeed(new Uint8Array(32).fill(n)).publicKey,owner=key(31),tableKey=key(32),keys=[key(33),key(34),key(35)];
const state={deactivationSlot:18446744073709551615n,lastExtendedSlot:90,lastExtendedSlotStartIndex:0,authority:owner,addresses:keys};
const table=new AddressLookupTableAccount({key:tableKey,state});
// Actual SDK/Rust lookup table account layout: metadata56bytes, followed by32byte addresses.
function account(patch={}){const data=Buffer.alloc(56+32*keys.length);data.writeUInt32LE(1,0);data.writeBigUInt64LE(state.deactivationSlot,4);data.writeBigUInt64LE(BigInt(state.lastExtendedSlot),12);data[20]=state.lastExtendedSlotStartIndex;data[21]=1;owner.toBuffer().copy(data,22);keys.forEach((k,i)=>k.toBuffer().copy(data,56+i*32));return {owner:AddressLookupTableProgram.programId,executable:false,lamports:2000000,data,...patch};}
function readConnection({slot=100,mutate=a=>a}={}){return {getMultipleAccountsInfoAndContext:async (requested,config)=>{assert.equal(config.commitment,'confirmed');assert.equal(config.minContextSlot,95);assert.deepEqual(requested.map(String),[String(tableKey)]);return {context:{slot},value:[mutate(account())]};}};}
function instructions(){return [ComputeBudgetProgram.setComputeUnitLimit({units:300000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}),new TransactionInstruction({programId:keys[2],keys:[{pubkey:owner,isSigner:true,isWritable:true},{pubkey:keys[0],isSigner:false,isWritable:true},{pubkey:keys[1],isSigner:false,isWritable:false}],data:Buffer.from([1,2,3])})];}
const compile=ix=>new VersionedTransaction(new TransactionMessage({payerKey:owner,recentBlockhash:PublicKey.default.toBase58(),instructions:ix}).compileToV0Message([table]));
const transaction=()=>compile(instructions());
const resolve=tx=>resolveTransactionAddresses(readConnection(),tx,{minContextSlot:95});
test('verified mapping decodes writable and readonly loaded privileges and cannot be hydrated from client JSON',async()=>{
 const tx=transaction(),context=await resolve(tx),view=decodeReviewedTransaction(tx,context);
 assert.equal(context.slot,100);assert(Object.isFrozen(context)&&Object.isFrozen(context.lookups)&&Object.isFrozen(context.lookups[0].writableKeys));
 assert.equal(context.loadedWritable[0],String(keys[0]));assert.equal(context.loadedReadonly[0],String(keys[1]));
 const lookupKey=view.keys.find(k=>k.key===String(keys[0]));assert.equal(lookupKey.signer,false);assert.equal(lookupKey.writable,true);
 assert.equal(view.keys.find(k=>k.key===String(keys[1])).writable,false);
 assert.equal(view.instructions[2].accounts[1].key,String(keys[0]));assert.equal(view.instructions[2].accounts[2].key,String(keys[1]));
 assert.throws(()=>decodeReviewedTransaction(tx),/Verified address/);assert.throws(()=>decodeReviewedTransaction(tx,JSON.parse(JSON.stringify(context))),/Verified address/);
 assert.deepEqual(transactionAddressKeys(tx,context),[...tx.message.staticAccountKeys.map(String),...context.loadedWritable,...context.loadedReadonly]);
});
test('lookup ownership, deactivation, future extension, slot floor and exact bounded layout fail closed',async()=>{
 const mutations=[a=>({...a,owner:SystemProgram.programId}),a=>({...a,executable:true}),()=>null,a=>({...a,data:a.data.subarray(0,55)}),a=>({...a,data:Buffer.concat([a.data,Buffer.alloc(1)])}),a=>{a.data.writeBigUInt64LE(99n,4);return a;},a=>{a.data.writeBigUInt64LE(101n,12);return a;},a=>{a.data[20]=255;return a;},a=>{a.data.writeUInt32LE(0,0);return a;}];
 for(const mutate of mutations)await assert.rejects(()=>resolveTransactionAddresses(readConnection({mutate}),transaction(),{minContextSlot:95}));
 await assert.rejects(()=>resolveTransactionAddresses(readConnection({slot:94}),transaction(),{minContextSlot:95}),/stale/);
 await assert.rejects(()=>loadAddressLookupTables({},[tableKey,tableKey],{minContextSlot:95}),/set/);
 await assert.rejects(()=>resolveTransactionAddresses({},transaction(),{minContextSlot:0}),/slot floor/);
});
test('same-slot new entries and duplicate loaded keys cannot acquire privileges',async()=>{
 await assert.rejects(()=>resolveTransactionAddresses(readConnection({mutate:a=>{a.data.writeBigUInt64LE(100n,12);a.data[20]=0;return a;}}),transaction(),{minContextSlot:95}),/not yet active/);
 await assert.rejects(()=>resolveTransactionAddresses(readConnection({mutate:a=>{owner.toBuffer().copy(a.data,56);return a;}}),transaction(),{minContextSlot:95}),/Duplicate/);
 const tx=transaction();tx.message.addressTableLookups[0].readonlyIndexes=new Uint8Array([tx.message.addressTableLookups[0].writableIndexes[0]]);
 await assert.rejects(()=>resolve(tx),/duplicate lookup index/);
});
test('wallet additions remain constrained while lookup index/order/privilege substitutions are rejected',async()=>{
 const tx=transaction(),context=await resolve(tx),before=decodeReviewedTransaction(tx,context),ix=instructions();
 ix.push(new TransactionInstruction({programId:new PublicKey(LIGHTHOUSE_PROGRAM),keys:[{pubkey:owner,isSigner:false,isWritable:false}],data:Buffer.from([5,0,7,0,0])}));
 const approved=inspectWalletTransaction(before,compile(ix),context);assert.equal(approved.valid,true,JSON.stringify(approved.reasons));
 const changed=transaction();changed.message.addressTableLookups[0].writableIndexes=new Uint8Array([1]);assert.equal(inspectWalletTransaction(before,changed,context).valid,false);
 const promoted=instructions();promoted[2].keys[2].isWritable=true;const ptx=compile(promoted),pcontext=await resolve(ptx);assert.equal(inspectWalletTransaction(before,ptx,pcontext).valid,false);
 const transfer=instructions();transfer.push(SystemProgram.transfer({fromPubkey:owner,toPubkey:key(36),lamports:1}));assert.equal(inspectWalletTransaction(before,compile(transfer),context).valid,false);
 const clone=transaction();clone.message.recentBlockhash=String(key(37));assert.equal(inspectWalletTransaction(before,clone,context).valid,false);
});
test('verified recompilation may change lookup packaging while semantic changes still fail',async()=>{
 const tx=transaction(),context=await resolve(tx),before=decodeReviewedTransaction(tx,context);
 const staticTx=new VersionedTransaction(new TransactionMessage({payerKey:owner,recentBlockhash:PublicKey.default.toBase58(),instructions:instructions()}).compileToV0Message());
 const strict=inspectWalletTransaction(before,staticTx);assert.equal(strict.valid,false);assert.match(strict.reasons.join(' '),/lookup mapping/);
 const permitted=inspectWalletTransaction(before,staticTx,undefined,{allowVerifiedLookupRemap:true});assert.equal(permitted.valid,true,JSON.stringify(permitted.reasons));
 const changed=instructions();changed[2].keys[2].isWritable=true;
 const privilegeTx=new VersionedTransaction(new TransactionMessage({payerKey:owner,recentBlockhash:PublicKey.default.toBase58(),instructions:changed}).compileToV0Message());
 const rejected=inspectWalletTransaction(before,privilegeTx,undefined,{allowVerifiedLookupRemap:true});assert.equal(rejected.valid,false);assert.match(rejected.reasons.join(' '),/privileges|removed/);
});
test('actual SDK transport retains one-bank LUT balance mapping, clamps snapshot floor and verifies loaded account postbalance',async()=>{
 const tx=transaction(),context=await resolve(tx),all=transactionAddressKeys(tx,context),dest=context.loadedWritable[0],pre=all.map((_,i)=>i===0?10000000:100),post=all.map((_,i)=>i===0?9000000:100);
 const raw=()=>({context:{slot:101},value:{err:null,fee:5000,preBalances:[...pre],postBalances:[...post],loadedAddresses:{writable:[...context.loadedWritable],readonly:[...context.loadedReadonly]},accounts:[{lamports:9000000},{lamports:100}],unitsConsumed:100000}});
 const opts={sigVerify:false,addresses:[String(owner),dest],minContextSlot:95,addressContext:context};let calls=0;
 const connection=createSimulationConnection(async body=>{calls++;assert.equal(body.method,'simulateTransaction');assert.equal(body.params[1].minContextSlot,100);assert.equal(body.params[1].sigVerify,false);return {jsonrpc:'2.0',id:body.id,result:raw()};});
 const proof=await simulationCostProof(connection,tx,owner,opts);assert.equal(proof.debit,1000000);assert.equal(proof.slot,101);assert.equal(calls,1);
 const changes=[r=>r.value.loadedAddresses.writable=[String(key(40))],r=>r.value.loadedAddresses.readonly=[String(key(41))],r=>r.value.preBalances.pop(),r=>r.value.postBalances[all.indexOf(dest)]++,r=>r.context.slot=99,r=>delete r.value.loadedAddresses,r=>r.value.accounts[1].lamports++];
 for(const mutate of changes){const bad=createSimulationConnection(async body=>{const r=raw();mutate(r);return {jsonrpc:'2.0',id:body.id,result:r};});await assert.rejects(()=>simulationCostProof(bad,tx,owner,opts));}
 await assert.rejects(()=>simulationCostProof(connection,tx,owner,{...opts,addressContext:JSON.parse(JSON.stringify(context))}));assert.equal(calls,1);
});

test('two-table global writable then readonly ordering is bound, including fresh context substitutions',async()=>{
 const k2=key(44),extra=[key(45),key(46)],table2=new AddressLookupTableAccount({key:k2,state:{...state,addresses:extra}});
 const ix=instructions();ix[2].keys.push({pubkey:extra[0],isSigner:false,isWritable:true},{pubkey:extra[1],isSigner:false,isWritable:false});
 const tx=new VersionedTransaction(new TransactionMessage({payerKey:owner,recentBlockhash:PublicKey.default.toBase58(),instructions:ix}).compileToV0Message([table,table2]));
 const second=account();second.data=Buffer.alloc(56+64);account().data.subarray(0,56).copy(second.data);extra.forEach((k,i)=>k.toBuffer().copy(second.data,56+i*32));
 const connection={getMultipleAccountsInfoAndContext:async requested=>{assert.deepEqual(requested.map(String),[String(tableKey),String(k2)]);return {context:{slot:100},value:[account(),second]};}};
 const context=await resolveTransactionAddresses(connection,tx,{minContextSlot:95}),before=decodeReviewedTransaction(tx,context);
 assert.deepEqual(context.loadedWritable,[String(keys[0]),String(extra[0])]);assert.deepEqual(context.loadedReadonly,[String(keys[1]),String(extra[1])]);
 const changed=VersionedTransaction.deserialize(tx.serialize());changed.message.addressTableLookups.reverse();assert.equal(inspectWalletTransaction(before,changed,context).valid,false);
 const moved=VersionedTransaction.deserialize(tx.serialize());moved.message.addressTableLookups[0].accountKey=k2;assert.equal(inspectWalletTransaction(before,moved,context).valid,false);
 const resolvedDifferent={getMultipleAccountsInfoAndContext:async()=>{const first=account();key(47).toBuffer().copy(first.data,56);return {context:{slot:101},value:[first,second]};}};
 const altered=await resolveTransactionAddresses(resolvedDifferent,tx,{minContextSlot:95});assert.equal(inspectWalletTransaction(before,tx,altered).valid,false);
 const all=transactionAddressKeys(tx,context),values={err:null,fee:1,preBalances:all.map(()=>100),postBalances:all.map(()=>99),accounts:[{lamports:99}],loadedAddresses:{writable:[...context.loadedWritable].reverse(),readonly:[...context.loadedReadonly]},unitsConsumed:100};
 const simulation=createSimulationConnection(async body=>({jsonrpc:'2.0',id:body.id,result:{context:{slot:101},value:values}}));
 await assert.rejects(()=>simulationCostProof(simulation,tx,owner,{sigVerify:false,addresses:[String(owner)],addressContext:context}));
});

test('missing or forged LUT context rejects before any simulation transport; no-LUT mapping remains usable',async()=>{
 const tx=transaction();let calls=0;const connection={_rpcRequest:async()=>{calls++;throw Error('must not contact RPC');}};
 for(const addressContext of [undefined,{},Object.freeze({slot:100,lookups:[],loadedWritable:[],loadedReadonly:[]})])await assert.rejects(()=>simulationCostProof(connection,tx,owner,{sigVerify:false,addresses:[String(owner)],addressContext}));
 assert.equal(calls,0);
 const plain=new VersionedTransaction(new TransactionMessage({payerKey:owner,recentBlockhash:PublicKey.default.toBase58(),instructions:instructions()}).compileToV0Message());assert.deepEqual(transactionAddressKeys(plain),plain.message.staticAccountKeys.map(String));
});

test('missing indexes, missing tables, invalid account metadata and changed writable order are refused',async()=>{
 for(const mutate of [a=>({...a,executable:undefined}),a=>({...a,lamports:0}),a=>{a.data[21]=2;return a;}])await assert.rejects(()=>resolveTransactionAddresses(readConnection({mutate}),transaction(),{minContextSlot:95}));
 const tx=transaction();tx.message.addressTableLookups[0].writableIndexes=new Uint8Array([255]);await assert.rejects(()=>resolve(tx),/missing/);
 await assert.rejects(()=>resolveTransactionAddresses({getMultipleAccountsInfoAndContext:async()=>({context:{slot:100},value:[]})},transaction(),{minContextSlot:95}),/unavailable/);
 const base=instructions();base[2].keys[2].isWritable=true;const both=compile(base),context=await resolve(both),before=decodeReviewedTransaction(both,context),changed=compile(base);changed.message.addressTableLookups[0].writableIndexes.reverse();assert.equal(inspectWalletTransaction(before,changed,context).valid,false);
});
