import test from 'node:test';
import assert from 'node:assert/strict';
import {readMainnetPoolRange} from '../lib/chain/robinhood-mainnet-history.ts';
import {uintWord} from '../lib/chain/robinhood-market.ts';
const topic='0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
const quote='0x'+'11'.repeat(20),token='0x'+'22'.repeat(20),pool='0x'+'33'.repeat(20),recipient='0x'+'44'.repeat(20),hash='0x'+'55'.repeat(32);
const market={pool,quote,tokenAddress:token};
const encode=v=>'0x'+v.map(n=>uintWord(BigInt.asUintN(256,n))).join('');
const log=(a,b)=>({address:pool,topics:[topic,'0x'+uintWord(BigInt(pool)),'0x'+uintWord(BigInt(recipient))],data:encode([a,b,1n,1n,0n]),blockNumber:'0x10',logIndex:'0x1',transactionHash:hash});
test('pool history decodes signed amounts and labels the recipient without assuming an originating wallet',async()=>{
 const result=await readMainnetPoolRange(async(method,params)=>{assert.equal(method,'eth_getLogs');assert.equal(params[0].address,pool);return [log(100n,-200n),log(-99n,201n)];},market,0n,100n);
 assert.equal(result[0].side,'buy');assert.equal(result[0].amountIn,'100');assert.equal(result[0].amountOut,'200');assert.equal(result[0].trader,recipient);assert.equal(result[0].venue,'uniswap-v3');
 assert.equal(result[1].side,'sell');assert.equal(result[1].amountIn,'201');assert.equal(result[1].amountOut,'99');
});
test('pool history rejects another pool, wrong range, malformed data and unsupported swap signs',async()=>{
 for(const bad of [{...log(1n,-1n),address:token},{...log(1n,-1n),blockNumber:'0x1000'},{...log(1n,-1n),data:'0x'},log(1n,1n)])await assert.rejects(readMainnetPoolRange(async()=>[bad],market,0n,100n));
 await assert.rejects(readMainnetPoolRange(async()=>[],market,0n,1000n));
 assert.deepEqual(await readMainnetPoolRange(async()=>[{...log(1n,-1n),removed:true}],market,0n,100n),[]);
});
test('pool history preserves zero-output dust trades in both token orders without blocking ordinary trades',async()=>{
 for(const quoteFirst of [true,false]) {
  const orderedMarket=quoteFirst?market:{...market,quote:token,tokenAddress:quote};
  const orderedLog=(q,t)=>quoteFirst?log(q,t):log(t,q);
  const result=await readMainnetPoolRange(async()=>[orderedLog(1n,0n),orderedLog(0n,1n),orderedLog(0n,0n),orderedLog(100n,-200n)],orderedMarket,0n,100n);
  assert.equal(result.length,3);
  assert.deepEqual(result.map(({side,amountIn,amountOut})=>({side,amountIn,amountOut})),[
   {side:'buy',amountIn:'1',amountOut:'0'}, {side:'sell',amountIn:'1',amountOut:'0'}, {side:'buy',amountIn:'100',amountOut:'200'}
  ]);
 }
});
