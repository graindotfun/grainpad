import test from 'node:test';
import assert from 'node:assert/strict';
import {LAUNCH_CREATED_TOPIC} from '../lib/chain/robinhood-create.ts';
import {registerRobinhoodMainnetLaunch, mainnetLaunchRecordKey, readRobinhoodMainnetLaunch} from '../lib/chain/robinhood-mainnet-registration.ts';
import {robinhoodLaunchRecordKey} from '../lib/chain/robinhood-registration.ts';
const factory='0x'+'11'.repeat(20),token='0x'+'22'.repeat(20),creator='0x'+'33'.repeat(20);
const launchId=creator+'44'.repeat(12),hash='0x'+'55'.repeat(32),blockHash='0x'+'66'.repeat(32);
const word=n=>BigInt(n).toString(16).padStart(64,'0');
const str=s=>word(Buffer.byteLength(s))+Buffer.from(s).toString('hex').padEnd(64,'0');
const receipt={status:'0x1',transactionHash:hash,to:factory,blockNumber:'0x10',blockHash,
 logs:[{address:factory,topics:[LAUNCH_CREATED_TOPIC,launchId,'0x'+token.slice(2).padStart(64,'0'),'0x'+creator.slice(2).padStart(64,'0')],data:'0x'+word(64)+word(128)+str('GrainCat')+str('GC')}]};
function memory(){const entries=new Map();return {entries,async get(key){const value=entries.get(key);return value?{async text(){return value;}}:null;},async put(k,v){entries.set(k,v);}};}
function rpcFixture({chain='0x1237',finalized='0x10',canonical=blockHash,create=receipt}={}){return async(method,params)=>{
 if(method==='eth_chainId')return chain;
 if(method==='eth_getTransactionReceipt')return create;
 if(method==='eth_getBlockByNumber')return params[0]==='finalized'?{number:finalized}:{hash:canonical};
 throw Error(method);
};}
test('finalized mainnet registration uses a different key from the same testnet address',async()=>{
 const storage=memory();storage.entries.set(robinhoodLaunchRecordKey(token),'testnet sentinel');
 const record=await registerRobinhoodMainnetLaunch({factory,transactionHash:hash},{storage,rpc:rpcFixture()});
 assert.equal(record.chainId,4663);assert.equal(record.networkId,'robinhood:mainnet');assert.equal(record.creator,creator);
 assert.equal(mainnetLaunchRecordKey(token),'robinhood-launches/4663/'+token);
 assert.equal(storage.entries.get(robinhoodLaunchRecordKey(token)),'testnet sentinel');
 assert.deepEqual(await readRobinhoodMainnetLaunch(storage,token,factory),record);
 assert.deepEqual(await registerRobinhoodMainnetLaunch({factory,transactionHash:hash},{storage,rpc:rpcFixture()}),record);
});
test('wrong chain, unfinalized, reorganized and spoofed receipts never write',async()=>{
 for(const options of [{chain:'0xb626'},{finalized:'0xf'},{canonical:'0x'+'77'.repeat(32)},{create:{...receipt,status:'0x0'}},{create:{...receipt,to:creator}},{create:{...receipt,transactionHash:launchId}},{create:{...receipt,logs:[{...receipt.logs[0],address:creator}]}}]){
  const storage=memory();await assert.rejects(registerRobinhoodMainnetLaunch({factory,transactionHash:hash},{storage,rpc:rpcFixture(options)}));assert.equal(storage.entries.size,0);
 }
});
test('network drift after reading finalization cannot write a registration',async()=>{
 const storage=memory(),base=rpcFixture();let chains=0;
 await assert.rejects(registerRobinhoodMainnetLaunch({factory,transactionHash:hash},{storage,rpc:async(method,params)=>method==='eth_chainId'&&chains++>0?'0xb626':base(method,params)}),/not Robinhood mainnet/);
 assert.equal(storage.entries.size,0);
});
test('a testnet record cannot be loaded from mainnet storage or another factory',async()=>{
 const storage=memory();const record=await registerRobinhoodMainnetLaunch({factory,transactionHash:hash},{storage,rpc:rpcFixture()});
 assert.equal(await readRobinhoodMainnetLaunch(storage,token,creator),null);
 storage.entries.set(mainnetLaunchRecordKey(token),JSON.stringify({...record,chainId:46630,networkId:'robinhood:testnet'}));
 assert.equal(await readRobinhoodMainnetLaunch(storage,token,factory),null);
});
