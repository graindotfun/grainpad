import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak_256} from '@noble/hashes/sha3';
import {prepareMainnetPaymentTrade,parseMainnetPaymentAmount,assertMainnetPaymentFresh,ROBINHOOD_USDG} from '../lib/chain/robinhood-mainnet-payments.ts';
import {MAINNET_V3_ROUTER,MAINNET_V3_QUOTER} from '../lib/chain/robinhood-mainnet-market.ts';
import {ROBINHOOD_CHAIN_MAINNET} from '../lib/chain/robinhood-mainnet.ts';
const address=c=>'0x'+c.repeat(40),owner=address('1'),token=address('3'),pool=address('4'),conversion=address('5'),WETH=ROBINHOOD_CHAIN_MAINNET.wethAddress,DEX='0x1f7d7550b1b028f7571e69a784071f0205fd2efa';
const now=1900000000000,market={networkId:'robinhood:mainnet',continuous:true,graduated:false,quote:WETH,tokenAddress:token,pool,locker:address('6'),block:'0x100'};
const w=n=>BigInt(n).toString(16).padStart(64,'0'),encode=a=>'0x'+a.map(w).join(''),sel=s=>'0x'+Buffer.from(keccak_256(new TextEncoder().encode(s))).subarray(0,4).toString('hex');
function fixture(options={}){
 const calls=[];let chains=0;
 const rpc=async(method,params)=>{
  calls.push({method,params});assert.ok(['eth_chainId','eth_call','eth_getBalance','eth_estimateGas','eth_gasPrice'].includes(method),'no wallet/approval/send RPC');
  if(method==='eth_chainId')return options.wrongChain||options.flipChain&&++chains>1?'0x1':'0x1237';
  if(method==='eth_getBalance')return '0x'+(options.nativeBalance??10n**20n).toString(16);
  if(method==='eth_estimateGas')return '0x5208';if(method==='eth_gasPrice')return '0x3b9aca00';
  const {to,data}=params[0];assert.equal(params[1],market.block,'all route/price/asset reads use one market snapshot');const signature=data.slice(0,10);
  if(signature===sel('factory()'))return encode([BigInt(options.wrongFactory?token:DEX)]);
  if(signature===sel('WETH9()'))return encode([BigInt(options.wrongWeth?token:WETH)]);
  if(signature===sel('getPool(address,address,uint24)'))return encode([BigInt(data.includes(ROBINHOOD_USDG.slice(2))?(options.missingPool?address('0'):conversion):pool)]);
  if(signature===sel('decimals()'))return encode([options.decimals??6n]);
  if(signature===sel('token0()'))return encode([BigInt(options.wrongTokens?token:[ROBINHOOD_USDG,WETH].sort()[0])]);
  if(signature===sel('token1()'))return encode([BigInt([ROBINHOOD_USDG,WETH].sort()[1])]);
  if(signature===sel('fee()'))return encode([options.poolFee??100n]);
  if(signature===sel('liquidity()'))return encode([options.liquidity??100000000n]);
  if(signature==='0x70a08231')return encode([options.balance??10n**30n]);
  if(signature==='0xdd62ed3e')return encode([options.allowance??0n]);
  if(to===MAINNET_V3_QUOTER&&signature==='0xc6a5026a')return encode([options.output??2n*10n**18n,1n,0n,100000n]);
  if(to===MAINNET_V3_QUOTER&&signature===sel('quoteExactInput(bytes,uint256)'))return encode([options.output??2n*10n**18n,options.badOffsets?0n:128n,224n,100000n,2n,1n,2n,2n,1n,2n]);
  throw Error('Unexpected read '+signature);
 };
 return {rpc,calls};
}
const prepare=(f,side,amount,asset,patch={})=>prepareMainnetPaymentTrade(f.rpc,{...market,...patch},owner,side,amount,100,asset,now);
function multicall(tx){
 const raw=tx.data.slice(10),word=offset=>BigInt('0x'+raw.slice(offset*2,offset*2+64)),array=Number(word(32)),count=Number(word(array));
 assert.equal(tx.data.slice(0,10),'0x5ae401dc');assert.equal(array,64);
 return {deadline:word(0),calls:Array.from({length:count},(_,i)=>{const start=array+32+Number(word(array+32+i*32)),length=Number(word(start));return '0x'+raw.slice((start+32)*2,(start+32+length)*2);})};
}
const innerWord=(data,index)=>BigInt('0x'+data.slice(10+index*64,74+index*64));
test('USDG parsing keeps six-decimal exact amounts and rejects unsafe inputs',()=>{
 assert.equal(parseMainnetPaymentAmount('1.000001','USDG','buy'),1000001n);assert.equal(parseMainnetPaymentAmount('0.000001','USDG','buy'),1n);
 assert.equal(parseMainnetPaymentAmount('1.000000000000000001','ETH','buy'),10n**18n+1n);
 assert.equal(parseMainnetPaymentAmount('1.000000000000000001','USDG','sell'),10n**18n+1n,'sell inputs remain token units');
 for(const value of ['0','-1','1e6','1.0000001',' 1','NaN','1,000'])assert.throws(()=>parseMainnetPaymentAmount(value,'USDG','buy'));
 assert.throws(()=>parseMainnetPaymentAmount((1n<<256n).toString(),'USDG','buy'),/uint256/);
});
test('ETH buy carries exact native value, wraps inside the existing router, refunds dust and requires no token approval',async()=>{
 const f=fixture(),amount=10n**15n,p=await prepare(f,'buy',amount,'ETH');assert.equal(p.transaction.value,'0x'+amount.toString(16));assert.equal(p.approval,null);assert.equal(p.transaction.to,MAINNET_V3_ROUTER);assert.equal(p.transaction.chainId,'0x1237');
 const m=multicall(p.transaction);assert.equal(m.deadline,BigInt(Math.floor(p.expiresAt/1000)));assert.equal(m.calls.length,2);assert.equal(m.calls[0].slice(0,10),'0x04e45aaf');assert.equal(m.calls[1],sel('refundETH()'));
 assert.equal(innerWord(m.calls[0],0),BigInt(WETH));assert.equal(innerWord(m.calls[0],1),BigInt(token));assert.equal(innerWord(m.calls[0],3),BigInt(owner));assert.equal(innerWord(m.calls[0],4),amount);assert.equal(innerWord(m.calls[0],5),p.minimum);
 assert.equal(p.estimatedGasReserve,25200n*10n**9n);assert.ok(!f.calls.some(c=>c.method==='eth_call'&&c.params[0].data.startsWith('0xdd62ed3e')));
 assert.doesNotThrow(()=>assertMainnetPaymentFresh(p,p.expiresAt-1));assert.throws(()=>assertMainnetPaymentFresh(p,p.expiresAt),/expired/);
});
test('ETH sell approves only the token, routes output to router, then unwraps with the same minimum and correct recipient',async()=>{
 const p=await prepare(fixture(),'sell',123n,'ETH'),m=multicall(p.transaction);assert.equal(p.transaction.value,'0x0');assert.equal(p.approval.to,token);assert.equal(p.approval.data,'0x095ea7b3'+w(BigInt(MAINNET_V3_ROUTER))+w(123n));
 assert.equal(innerWord(m.calls[0],0),BigInt(token));assert.equal(innerWord(m.calls[0],1),BigInt(WETH));assert.equal(innerWord(m.calls[0],3),BigInt(MAINNET_V3_ROUTER));
 assert.equal(m.calls[1],sel('unwrapWETH9(uint256,address)')+w(p.minimum)+w(BigInt(owner)));assert.equal(p.outputDecimals,18);
});
test('USDG buy and sell use reversed two-hop paths, composite slippage and exact approval/input/output decimals',async()=>{
 for(const side of ['buy','sell']){
  const f=fixture({output:side==='buy'?2n*10n**18n:2_123_456n}),amount=side==='buy'?10_000_001n:10n**18n,p=await prepare(f,side,amount,'USDG'),m=multicall(p.transaction),inner=m.calls[0];
  const path=side==='buy'?ROBINHOOD_USDG.slice(2)+'000064'+WETH.slice(2)+'002710'+token.slice(2):token.slice(2)+'002710'+WETH.slice(2)+'000064'+ROBINHOOD_USDG.slice(2);
  assert.equal(m.calls.length,1);assert.equal(inner.slice(0,10),sel('exactInput((bytes,address,uint256,uint256))'));assert.equal(innerWord(inner,0),32n);assert.equal(innerWord(inner,1),128n);assert.equal(innerWord(inner,2),BigInt(owner));assert.equal(innerWord(inner,3),amount);assert.equal(innerWord(inner,4),p.minimum);assert.equal(innerWord(inner,5),66n);assert.equal(inner.slice(10+6*64,10+6*64+132),path);
  const quoted=f.calls.find(c=>c.method==='eth_call'&&c.params[0].data.startsWith(sel('quoteExactInput(bytes,uint256)'))).params[0].data;assert.equal(innerWord(quoted,0),64n);assert.equal(innerWord(quoted,1),amount);assert.equal(innerWord(quoted,2),66n);assert.equal(quoted.slice(10+3*64,10+3*64+132),path);
  assert.equal(p.minimum,p.output*9900n/10000n);assert.equal(p.transaction.value,'0x0');assert.equal(p.approval.to,side==='buy'?ROBINHOOD_USDG:token);assert.equal(p.approval.data,'0x095ea7b3'+w(BigInt(MAINNET_V3_ROUTER))+w(amount));assert.equal(p.inputDecimals,side==='buy'?6:18);assert.equal(p.outputDecimals,side==='sell'?6:18);
 }
});
test('existing sufficient allowance does not request another approval; no approval or send is executed by planning',async()=>{
 const f=fixture({allowance:10n**30n});assert.equal((await prepare(f,'buy',100n,'USDG')).approval,null);assert.equal((await prepare(f,'sell',100n,'ETH')).approval,null);
 assert.ok(f.calls.every(c=>!['eth_sendTransaction','eth_requestAccounts','wallet_switchEthereumChain'].includes(c.method)));
});
test('unsupported currencies, network/wiring/pool/precision/quote failures, balances and gas reserve all fail closed',async t=>{
 for(const options of [{wrongChain:true},{flipChain:true},{wrongFactory:true},{wrongWeth:true},{missingPool:true},{wrongTokens:true},{poolFee:500n},{liquidity:0n},{decimals:18n},{badOffsets:true},{balance:0n},{output:0n}])await t.test(JSON.stringify(options,(_,v)=>typeof v==='bigint'?String(v):v),async()=>{await assert.rejects(prepare(fixture(options),'buy',100n,'USDG'));});
 await assert.rejects(prepare(fixture(),'buy',100n,'USDC'),/Choose/);await assert.rejects(prepare(fixture(),'buy',100n,'ETH',{pool:token}),/identity/);await assert.rejects(prepare(fixture(),'buy',100n,'ETH',{continuous:false,graduated:false}),/live Uniswap/);
 await assert.rejects(prepare(fixture({nativeBalance:99n}),'buy',100n,'ETH'),/Insufficient ETH/);await assert.rejects(prepare(fixture({nativeBalance:100n}),'buy',100n,'ETH'),/gas/);
 const plan=await prepare(fixture(),'buy',100n,'ETH');assert.throws(()=>assertMainnetPaymentFresh({...plan,transaction:{...plan.transaction,value:'0x0'}},now),/changed/);
});
