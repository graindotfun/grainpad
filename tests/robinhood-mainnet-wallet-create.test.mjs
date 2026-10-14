import test from 'node:test';
import assert from 'node:assert/strict';
import {connectRobinhoodMainnet, watchRobinhoodMainnetWallet} from '../lib/chain/robinhood-mainnet-wallet.ts';
import {buildRobinhoodMainnetCreateTransaction, submitRobinhoodMainnetCreate, readRobinhoodMainnetCreateReceipt, mainnetReceiptIsFinalized, newRobinhoodMainnetLaunchId} from '../lib/chain/robinhood-mainnet-create.ts';
import {buildRobinhoodCreateTransaction} from '../lib/chain/robinhood-create.ts';
const owner='0x'+ '11'.repeat(20), factory='0x'+'22'.repeat(20), launchId='0x'+'33'.repeat(32);
const input={factory,name:'GrainCat',symbol:'GC',launchId};

test('mainnet connection adds the right network and checks again after approval',async()=>{
 const calls=[];
 const provider={async request({method,params}){
  calls.push(method);
  if(method==='wallet_switchEthereumChain') {assert.deepEqual(params,[{chainId:'0x1237'}]);throw {code:4902};}
  if(method==='wallet_addEthereumChain') {assert.equal(params[0].chainId,'0x1237');assert.equal(params[0].rpcUrls[0],'https://rpc.mainnet.chain.robinhood.com');return null;}
  if(method==='eth_chainId')return '0x1237';
  if(method==='eth_requestAccounts')return [owner];
  throw Error(method);
 }};
 const session=await connectRobinhoodMainnet(provider);
 assert.equal(session.networkId,'robinhood:mainnet');assert.equal(session.chainId,4663);assert.equal(session.account,owner);
 assert.deepEqual(calls,['wallet_switchEthereumChain','wallet_addEthereumChain','eth_chainId','eth_requestAccounts','eth_chainId']);
});

test('mainnet refuses wrong chain before account request and chain drift during approval',async()=>{
 for(const drift of [false,true]){
  let reads=0,accounts=0;
  await assert.rejects(connectRobinhoodMainnet({async request({method}){
   if(method==='wallet_switchEthereumChain')return null;
   if(method==='eth_chainId')return drift&&reads++===0?'0x1237':'0xb626';
   if(method==='eth_requestAccounts'){accounts++;return [owner];}
   throw Error(method);
  }}),/mainnet/);
  assert.equal(accounts,drift?1:0);
 }
});

test('mainnet connection rejection does not silently add or request accounts',async()=>{
 const methods=[];
 await assert.rejects(connectRobinhoodMainnet({async request({method}){methods.push(method);throw {code:4001};}}));
 assert.deepEqual(methods,['wallet_switchEthereumChain']);
});

test('mainnet wallet events invalidate the session on testnet or disconnect and clean listeners',()=>{
 const listeners=new Map(),events=[];
 const provider={request(){throw Error('unexpected');},on(name,fn){listeners.set(name,fn);},removeListener(name){listeners.delete(name);}};
 const cleanup=watchRobinhoodMainnetWallet({provider,account:owner,chainId:4663,networkId:'robinhood:mainnet'},value=>events.push(value));
 listeners.get('accountsChanged')(['0x'+'44'.repeat(20)]);
 assert.equal(events[0].account,'0x'+'44'.repeat(20));
 listeners.get('chainChanged')('0xb626');assert.equal(events[1],null);
 listeners.get('accountsChanged')([owner]);assert.equal(events.length,2);
 cleanup();assert.equal(listeners.size,0);
});

test('mainnet candidate encoding has the same ABI and a distinct chain identity',()=>{
 const main=buildRobinhoodMainnetCreateTransaction(input),old=buildRobinhoodCreateTransaction(input);
 assert.equal(main.data,old.data);assert.equal(main.chainId,4663);assert.equal(main.networkId,'robinhood:mainnet');assert.equal(main.value,'0x0');
 assert.throws(()=>buildRobinhoodMainnetCreateTransaction({...input,name:'a'.repeat(33)}));
 assert.throws(()=>buildRobinhoodMainnetCreateTransaction({...input,factory:'0x'+'00'.repeat(20)}));
});

test('caller cannot replace the pinned mainnet factory or prompt the wallet for it',async()=>{
 const calls=[];const provider={async request({method}){calls.push(method);throw Error('unexpected');}};
 await assert.rejects(submitRobinhoodMainnetCreate(provider,buildRobinhoodMainnetCreateTransaction(input),owner),/configured mainnet deployment/);
 assert.deepEqual(calls,[]);
 const wrongChain={async request({method}){calls.push(method);return '0xb626';}};
 await assert.rejects(readRobinhoodMainnetCreateReceipt(wrongChain,launchId,launchId),/not on Robinhood Chain mainnet/);
 assert.deepEqual(calls,['eth_chainId']);
});

test('creator-bound ids use exactly 96 bits of entropy after the signer address',()=>{
 const id=newRobinhoodMainnetLaunchId(owner,new Uint8Array(12).fill(7));assert.equal(id,owner+'07'.repeat(12));
 assert.throws(()=>newRobinhoodMainnetLaunchId(owner,new Uint8Array(32)),/12 bytes/);
});
test('only a canonical finalized receipt can authorize a retry after a reverted create',async()=>{
 const blockHash='0x'+'66'.repeat(32);const receipt={blockNumber:'0x10',blockHash};
 for(const mode of ['good','young','reorg','outage','wrongChain']){
  const provider={async request({method,params}){
   if(method==='eth_chainId')return mode==='wrongChain'?'0xb626':'0x1237';
   if(mode==='outage')throw Error('offline');
   if(method==='eth_getBlockByNumber')return params[0]==='finalized'?{number:mode==='young'?'0xf':'0x10'}:{hash:mode==='reorg'?launchId:blockHash};
   throw Error(method);
  }};
  assert.equal(await mainnetReceiptIsFinalized(provider,receipt),mode==='good');
 }
});
