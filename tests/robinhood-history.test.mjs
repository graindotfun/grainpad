import test from 'node:test';
import assert from 'node:assert/strict';
import {readRobinhoodHistory} from '../lib/chain/robinhood-history.ts';
import {TESTNET_WETH, uintWord} from '../lib/chain/robinhood-market.ts';
import {LAUNCH_CREATED_TOPIC} from '../lib/chain/robinhood-create.ts';
const factory='0x'+'11'.repeat(20),curve='0x'+'22'.repeat(20),vault='0x'+'33'.repeat(20),token='0x'+'44'.repeat(20),creator='0x'+'55'.repeat(20),launch='0x'+'66'.repeat(32),hash='0x'+'77'.repeat(32);
const addr=a=>uintWord(BigInt(a));
const eventData='0x'+uintWord(64n)+uintWord(128n)+uintWord(1n)+'47'.padEnd(64,'0')+uintWord(1n)+'47'.padEnd(64,'0');
const record={networkId:'robinhood:testnet',chainId:46630,factory,tokenAddress:token,creator,launchId:launch,transactionHash:hash,name:'G',symbol:'G'};
function fixture(){
 const objects=new Map();let reads=0,reorg=false,moving=false;
 const blockHash=n=>'0x'+(n===100n?'aa':reorg?'cc':'bb').repeat(32);
 const storage={async get(k){return objects.has(k)?{text:async()=>objects.get(k)}:null;},async put(k,v){objects.set(k,v);}};
 async function rpc(method,params){
  if(method==='eth_chainId')return '0xb626';
  if(method==='eth_blockNumber')return '0x7d2'; // confirmed end 2000
  if(method==='eth_getBlockByNumber'){if(moving && reads>0)reorg=true;return {hash:blockHash(BigInt(params[0]))};}
  if(method==='eth_getTransactionReceipt')return {status:'0x1',transactionHash:hash,to:factory,blockNumber:'0x64',blockHash:blockHash(100n),logs:[{address:factory,topics:[LAUNCH_CREATED_TOPIC,launch,'0x'+addr(token),'0x'+addr(creator)],data:eventData}]};
  if(method==='eth_call'){
   const [{to,data}]=params;const selector=data.slice(0,10);
   if(selector==='0x7165485d')return '0x'+addr(curve);
   if(selector==='0xfbfa77cf')return '0x'+addr(vault);
   if(selector==='0xbae667bc')return '0x'+addr(token);
   if(selector==='0xad091230')return '0x'+[BigInt(token),BigInt(creator),10n,100n,1n].map(uintWord).join('');
   if(selector==='0x999b93af')return '0x'+addr(TESTNET_WETH);
   if(selector==='0xc45a0155')return '0x'+addr(factory);
   if(selector==='0xff94e4f3')return '0x'+addr(creator);
   if(selector==='0x4bde38c8')return '0x'+addr(creator);
   if(to===factory || to===curve)return '0x'+uintWord(100n);
   throw Error(selector);
  }
  if(method==='eth_getLogs'){reads++;const [{fromBlock,toBlock}]=params;
   if(BigInt(fromBlock)>1500n || BigInt(toBlock)<1500n || reorg)return [];
   return [{address:curve,topics:['0x1425213da0cb1c09c9763adf9297d47fa65b00e4d96bc5e98fcfd4f9b9750255',launch,'0x'+addr(creator),'0x'+addr(token)],blockNumber:'0x5dc',logIndex:'0x0',transactionHash:hash,data:'0x'+[100n,1n,2n,3n,94n,0n,0n].map(uintWord).join('')}];
  }
  throw Error(method);
 }
 return {storage,rpc,objects,reads:()=>reads,reorg:()=>{reorg=true;},moving:()=>{moving=true;}};
}
test('durable history retains old trades and paginates to creation without gaps',async()=>{
 const f=fixture();const page=await readRobinhoodHistory(f.storage,f.rpc,record);
 assert.equal(page.trades.length,1);assert.equal(page.trades[0].blockNumber,'1500');assert.equal(page.nextCursor,'999');
 assert.equal(f.objects.size,1);const reads=f.reads();await readRobinhoodHistory(f.storage,f.rpc,record);assert.equal(f.reads(),reads+1); // current partial shard stays uncached
 const older=await readRobinhoodHistory(f.storage,f.rpc,record,page.nextCursor);assert.equal(older.nextCursor,null);assert.equal(older.scannedFrom,'100');
 await assert.rejects(readRobinhoodHistory(f.storage,f.rpc,record,'999999'),/cursor/);
});
test('canonical mismatch replaces orphaned shard; a moving read is never persisted',async()=>{
 const f=fixture();await readRobinhoodHistory(f.storage,f.rpc,record);f.reorg();const page=await readRobinhoodHistory(f.storage,f.rpc,record);assert.equal(page.trades.length,0);
 const moving=fixture();moving.moving();await assert.rejects(readRobinhoodHistory(moving.storage,moving.rpc,record),/changed during indexing/);assert.equal(moving.objects.size,0);
});
