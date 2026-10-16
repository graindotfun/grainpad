import test from 'node:test';import assert from 'node:assert/strict';import{keccak_256}from'@noble/hashes/sha3';
import{readMainnetPaymentEstimate}from'../lib/chain/robinhood-mainnet-indicative.ts';
import{ROBINHOOD_CHAIN_MAINNET}from'../lib/chain/robinhood-mainnet.ts';import{ROBINHOOD_USDG}from'../lib/chain/robinhood-mainnet-payments.ts';
const a=c=>'0x'+c.repeat(40),WETH=ROBINHOOD_CHAIN_MAINNET.wethAddress,DEX='0x1f7d7550b1b028f7571e69a784071f0205fd2efa',token=a('3'),pool=a('4'),conversion=a('5'),word=n=>BigInt(n).toString(16).padStart(64,'0'),enc=a=>'0x'+a.map(word).join(''),sel=s=>'0x'+Buffer.from(keccak_256(new TextEncoder().encode(s))).subarray(0,4).toString('hex');
const market={networkId:'robinhood:mainnet',continuous:true,quote:WETH,tokenAddress:token,pool,locker:a('6'),block:'0x1'};
function fixture(options={}){let chainReads=0;const calls=[];return{calls,rpc:async(method,params)=>{
 calls.push({method,params});assert.ok(['eth_chainId','eth_getBlockByNumber','eth_call'].includes(method),'display reader must never read accounts, allowances or construct/send transactions');
 if(method==='eth_chainId')return options.wrongChain||options.flipChain&&++chainReads>1?'0x1':'0x1237';
 if(method==='eth_getBlockByNumber')return options.badBlock?null:{number:'0x100',hash:'0x'+'ab'.repeat(32)};
 const{to,data}=params[0];assert.equal(params[1],'0x100');const s=data.slice(0,10);
 if(s===sel('factory()'))return enc([BigInt(options.wrongFactory?token:DEX)]);
 if(s===sel('WETH9()'))return enc([BigInt(WETH)]);
 if(s===sel('getPool(address,address,uint24)'))return enc([BigInt(data.includes(ROBINHOOD_USDG.slice(2))?conversion:options.wrongPool?conversion:pool)]);
 if(s===sel('decimals()'))return enc([options.decimals??6]);
 if(s===sel('token0()'))return enc([BigInt([ROBINHOOD_USDG,WETH].sort()[0])]);if(s===sel('token1()'))return enc([BigInt([ROBINHOOD_USDG,WETH].sort()[1])]);
 if(s===sel('fee()'))return enc([100]);if(s===sel('liquidity()'))return enc([options.empty?0:10]);
 if(s==='0xc6a5026a')return enc([options.output??123456789000000000000n,1,0,100000]);
 if(s===sel('quoteExactInput(bytes,uint256)'))return enc([options.output??123456789000000000000n,options.badQuote?0:128,224,100000,2,1,2,2,1,2]);
 assert.fail('Unexpected read '+s);
}};}
for(const asset of ['USDG','ETH'])for(const side of ['buy','sell'])test(`RH ${asset} ${side} estimate uses fresh exact block and no financial plan`,async()=>{
 const f=fixture(),q=await readMainnetPaymentEstimate(f.rpc,market,side,'1',asset);assert.equal(q.output,123456789000000000000n);assert.equal(q.outputDecimals,side==='sell'&&asset==='USDG'?6:18);assert.equal(q.block,'0x100');assert.equal(q.estimated,true);assert.equal(q.executionEnabled,false);assert.ok(q.expiresAt>Date.now());assert.equal(q.transaction,undefined);assert.equal(q.approval,undefined);assert.ok(f.calls.length<=16);
});
test('RH estimates reject wrong chain, pool, USDG precision, liquidity, malformed quote and zero output',async()=>{
 for(const opts of [{wrongChain:true},{flipChain:true},{badBlock:true},{wrongFactory:true},{wrongPool:true},{decimals:18},{empty:true},{badQuote:true},{output:0n}])await assert.rejects(()=>readMainnetPaymentEstimate(fixture(opts).rpc,market,'buy','1','USDG'));
});
test('invalid or aborted RH estimate inputs never reach chain',async()=>{
 for(const amount of ['0','-1','NaN','1e6','1.0000001']){const f=fixture();await assert.rejects(()=>readMainnetPaymentEstimate(f.rpc,market,'buy',amount,'USDG'));assert.equal(f.calls.length,0);}
 const f=fixture(),c=new AbortController();c.abort();await assert.rejects(()=>readMainnetPaymentEstimate(f.rpc,market,'buy','1','USDG',c.signal));assert.equal(f.calls.length,0);
});
