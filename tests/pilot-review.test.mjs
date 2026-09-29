// Restricted pilot review: structure, locks and fail-closed simulation checks. No network or signer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,PublicKey} from '@solana/web3.js';
import * as sdk from '@raydium-io/raydium-sdk-v2';
import {PLATFORM_SETTINGS} from '../lib/platform-settings.mjs';
import {PILOT_SIGNING_ENABLED,assertPilotSigningEnabled,pilotInstructions,compilePilot,planPilotFromSummary,planPilot,simulatePilot,readPilotSetupAccounts} from '../lib/pilot-review.mjs';

const mint=Keypair.fromSeed(new Uint8Array(32).fill(151)).publicKey,collector=String(Keypair.fromSeed(new Uint8Array(32).fill(152)).publicKey);
const draft={name:'Grainpad pilot',symbol:'PILOT',uri:'https://grainpad.fun/pilot.json',taxBps:200};
const summary=(state,extra={})=>({slot:451700000,platform:'d9EBYYKcBccQoZWn9uMHnmbMw8PVh46WXrKZFpYaKoV',collector,currentCollector:state==='configure'?String(PublicKey.default):collector,state,
 admission:{SOL:false,wXMR:false},rules:{SOL:'absent',wXMR:state==='configure'?'absent':'rewards'},...extra});
const noNetwork=new Proxy({},{get(){throw Error('Unexpected RPC call');}});

test('pilot signing is locked and the lock fails closed',()=>{
 assert.equal(PILOT_SIGNING_ENABLED,false);
 assert.throws(assertPilotSigningEnabled,/locked/);
 assert.equal(planPilotFromSummary(summary('activation-review'),{draft,mint}).signingAuthorized,false);
});

test('the pilot transaction opens admission, launches and closes admission, with exactly the admin and mint as signers',()=>{
 const {instructions,allow}=pilotInstructions({mint,draft});
 assert.equal(instructions.length,3);
 assert(instructions.every(ix=>ix.programId.equals(sdk.LAUNCHPAD_PROGRAM)));
 assert(instructions[0].keys.some(k=>k.pubkey.equals(allow)));
 assert(instructions[2].keys.some(k=>k.pubkey.equals(allow)));
 assert(instructions[1].keys.some(k=>k.pubkey.equals(mint)&&k.isSigner));
 const tx=compilePilot(instructions,String(PublicKey.default));
 assert.deepEqual(tx.message.staticAccountKeys.slice(0,2).map(String).sort(),[PLATFORM_SETTINGS.admin,String(mint)].sort());
 assert(tx.serialize().length<=1232);
});

test('invalid drafts are rejected by the reviewed launch builder',()=>{
 for(const bad of [{...draft,taxBps:99},{...draft,taxBps:301},{...draft,name:''},{...draft,uri:'http://insecure.test/x.json'}])assert.throws(()=>pilotInstructions({mint,draft:bad}));
});

test('the plan reports blocked until configuration is finalized with admission closed',async()=>{
 const blocked=planPilotFromSummary(summary('configure'),{draft,mint});
 assert.equal(blocked.ready,false);
 assert.equal(blocked.preconditions.find(c=>c.check.startsWith('Rewards collector')).passed,false);
 assert.equal(planPilotFromSummary(summary('activation-review'),{draft,mint}).ready,true);
 assert.equal(planPilotFromSummary(summary('active'),{draft,mint}).ready,false);
 const viaRead=await planPilot(noNetwork,{collector,draft,mint,readSetup:async()=>summary('configure')});
 assert.equal(viaRead.ready,false);assert.equal(viaRead.collectorApproved,false);
});

test('simulation is skipped while blocked and fails closed if admission would stay open',async()=>{
 const blocked=await simulatePilot(noNetwork,{collector,draft,mint,readSetup:async()=>summary('configure')});
 assert.equal(blocked.simulated,false);
 const {pool}=pilotInstructions({mint,draft});
 const connection=(allowAfter)=>({getLatestBlockhash:async()=>({blockhash:String(PublicKey.default),lastValidBlockHeight:1}),getBalance:async()=>1_000_000_000,getFeeForMessage:async()=>({value:15000}),
  simulateTransaction:async()=>({value:{err:null,unitsConsumed:120000,accounts:[{lamports:990_000_000},allowAfter,{lamports:5_000_000,owner:String(sdk.LAUNCHPAD_PROGRAM),data:['AA==','base64']}]}})});
 const ok=await simulatePilot(connection(null),{collector,draft,mint,readSetup:async()=>summary('activation-review')});
 assert.equal(ok.simulated,true);assert.equal(ok.simulation.admissionClosedAfter,true);assert.equal(ok.pool,String(pool));assert.equal(ok.signingAuthorized,false);
 await assert.rejects(()=>simulatePilot(connection({lamports:1_000_000,owner:String(sdk.LAUNCHPAD_PROGRAM),data:['AAAA','base64']}),{collector,draft,mint,readSetup:async()=>summary('activation-review')}),/admission open/);
});

test('the server snapshot is one collector-independent read, so query parameters cannot multiply RPC calls',async()=>{
 let calls=0;const connection={getGenesisHash:async()=>{calls++;return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';},getMultipleAccountsInfoAndContext:async keys=>{calls++;assert.equal(keys.length,8);return {context:{slot:7},value:keys.map(()=>null)};}};
 const snapshot=await readPilotSetupAccounts(connection);
 assert.equal(calls,2);assert.equal(snapshot.slot,7);assert.equal(JSON.parse(JSON.stringify(snapshot)).accounts.length,8);
 await assert.rejects(()=>readPilotSetupAccounts({...connection,getGenesisHash:async()=>'devnet'}),/Mainnet/);
});
