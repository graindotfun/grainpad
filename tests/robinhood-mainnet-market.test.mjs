import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTrade,prepareWrap,prepareClaim,submitTransaction,uintWord,assertRobinhoodChain} from '../lib/chain/robinhood-market.ts';
import {prepareMainnetTrade, assertMainnetTradeFresh, MAINNET_V3_ROUTER, MAINNET_V3_QUOTER} from '../lib/chain/robinhood-mainnet-market.ts';
import {ROBINHOOD_CHAIN_MAINNET} from '../lib/chain/robinhood-mainnet.ts';
const owner='0x'+'11'.repeat(20),curve='0x'+'22'.repeat(20),token='0x'+'33'.repeat(20),launchId='0x'+'44'.repeat(32);
const market={networkId:'robinhood:mainnet',quote:ROBINHOOD_CHAIN_MAINNET.wethAddress,curve,tokenAddress:token,launchId,block:'0x10',creator:owner,platform:curve,vault:curve};
const encode=v=>'0x'+v.map(uintWord).join('');
function rpcFixture({chain='0x1237',tradeFee=0n}={}){return async(method,params)=>{
 if(method==='eth_chainId')return chain;
 const data=params[0].data;
 if(data.startsWith('0xedd6ea76')||data.startsWith('0xf2c963fd'))return encode([10000n,35n,65n,tradeFee,9900n]);
 if(data.startsWith('0x70a08231'))return encode([100000n]);
 if(data.startsWith('0xdd62ed3e'))return encode([0n]);
 if(data.startsWith('0x866d16bf'))return encode([1n]);
 throw Error(method);
};}
test('mainnet quote, exact approval, buy, sell, wrap and claim keep chain 4663',async()=>{
 const rpc=rpcFixture();
 const buy=await prepareTrade(rpc,market,owner,'buy',10000n,100);
 assert.equal(buy.transaction.chainId,'0x1237');assert.equal(buy.approval.chainId,'0x1237');assert.equal(buy.approval.to,ROBINHOOD_CHAIN_MAINNET.wethAddress);
 assert.equal(buy.fees.platform,35n);assert.equal(buy.fees.creator,65n);assert.equal(buy.fees.trade,0n);
 const sell=await prepareTrade(rpc,market,owner,'sell',100n,100);assert.equal(sell.output,9900n);assert.equal(sell.transaction.chainId,'0x1237');assert.equal(sell.approval.to,token);
 const wrap=prepareWrap(owner,10000n,'robinhood:mainnet');assert.equal(wrap.to,ROBINHOOD_CHAIN_MAINNET.wethAddress);assert.equal(wrap.chainId,'0x1237');
 assert.equal((await prepareClaim(rpc,market,owner,1)).chainId,'0x1237');
});
test('a mainnet market refuses a testnet reader, wrong WETH and any extra trade fee',async()=>{
 await assert.rejects(prepareTrade(rpcFixture({chain:'0xb626'}),market,owner,'buy',10000n,100),/mainnet/);
 await assert.rejects(prepareTrade(rpcFixture({tradeFee:50n}),market,owner,'buy',10000n,100),/approved fee/);
 await assert.rejects(prepareTrade(rpcFixture(),{...market,quote:token},owner,'buy',10000n,100),/Wrong mainnet quote/);
 await assert.rejects(assertRobinhoodChain(rpcFixture(),'unknown'),/Unknown/);
 assert.throws(()=>prepareWrap(owner,1n,'unknown'),/Unknown/);
});
test('mainnet wrapping rejects a testnet wallet before simulation or signing',async()=>{
 const calls=[];const provider={async request({method}){calls.push(method);return '0xb626';}};
 await assert.rejects(submitTransaction(provider,prepareWrap(owner,1n,'robinhood:mainnet')),/not on Robinhood Chain mainnet/);
 assert.deepEqual(calls,['eth_chainId']);
});

test('graduated quoting targets the pinned v3 quoter and exact router approval with an onchain deadline',async()=>{
 const reads=[];const rpc=async(method,params)=>{
  if(method==='eth_chainId')return '0x1237';reads.push(params[0]);
  if(params[0].to===MAINNET_V3_QUOTER){assert.ok(params[0].data.startsWith('0xc6a5026a'));return encode([1000n,1n,1n,1n]);}
  if(params[0].data.startsWith('0x70a08231'))return encode([100000n]);
  if(params[0].data.startsWith('0xdd62ed3e'))return encode([0n]);
  throw Error('unexpected read');
 };
 const graduated={...market,graduated:true,graduationPending:false,pool:curve,locker:token,maxBuy:0n,lockedTokens:0n};
 const buy=await prepareMainnetTrade(rpc,graduated,owner,'buy',10000n,100);
 assert.equal(buy.venue,'uniswap-v3');assert.equal(buy.output,1000n);assert.equal(buy.minimum,990n);
 assert.equal(buy.approval.to,ROBINHOOD_CHAIN_MAINNET.wethAddress);assert.equal(buy.approval.data,'0x095ea7b3'+uintWord(BigInt(MAINNET_V3_ROUTER))+uintWord(10000n));
 assert.equal(buy.transaction.to,MAINNET_V3_ROUTER);assert.equal(buy.transaction.chainId,'0x1237');assert.ok(buy.transaction.data.startsWith('0x5ae401dc'));
 const body=buy.transaction.data.slice(10);assert.equal(BigInt('0x'+body.slice(0,64)),BigInt(Math.floor(buy.expiresAt/1000)));
 assert.equal(BigInt('0x'+body.slice(64,128)),64n);assert.equal(BigInt('0x'+body.slice(128,192)),1n);assert.equal(BigInt('0x'+body.slice(192,256)),32n);
 assert.equal(BigInt('0x'+body.slice(256,320)),228n);assert.equal(body.slice(320,328),'04e45aaf');
 assert.deepEqual(buy.fees,{platform:0n,creator:0n,trade:0n});
 assert.doesNotThrow(()=>assertMainnetTradeFresh(buy,buy.expiresAt-1));assert.throws(()=>assertMainnetTradeFresh(buy,buy.expiresAt),/expired/);
 const sell=await prepareMainnetTrade(rpc,graduated,owner,'sell',100n,100);assert.equal(sell.approval.to,token);
 await assert.rejects(prepareMainnetTrade(rpc,{...graduated,locker:null},owner,'buy',100n,100),/identity/);
});
