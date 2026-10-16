/** Read-only display quote. No account, allowance, transaction construction or wallet authorization. */
import {address,assertRobinhoodChain,uintWord,type Rpc} from './robinhood-market.ts';
import {ROBINHOOD_CHAIN_MAINNET} from './robinhood-mainnet.ts';
import {MAINNET_V3_QUOTER,type MainnetMarket} from './robinhood-mainnet-market.ts';
import {ROBINHOOD_USDG,USDG_WETH_FEE,mainnetPaymentDecimals,parseMainnetPaymentAmount,type MainnetPaymentAsset} from './robinhood-mainnet-payments.ts';
import {keccakHex} from './evm-one-approval-launch.ts';
const DEX='0x1f7d7550b1b028f7571e69a784071f0205fd2efa',WETH=ROBINHOOD_CHAIN_MAINNET.wethAddress;
const selector=(s:string)=>keccakHex(new TextEncoder().encode(s)).slice(0,10),aw=(s:string)=>uintWord(BigInt(address(s)));
const bytes=(s:string)=>uintWord(BigInt(s.length/2))+s.padEnd(Math.ceil(s.length/64)*64,'0');
export async function readMainnetPaymentEstimate(rpc:Rpc,market:MainnetMarket,side:'buy'|'sell',text:string,asset:MainnetPaymentAsset,signal?:AbortSignal){
 const amount=parseMainnetPaymentAmount(text,asset,side),precision=mainnetPaymentDecimals(asset);
 if(market.networkId!=='robinhood:mainnet'||market.quote!==WETH||!market.pool||!market.locker||!market.continuous&&!market.graduated)throw Error('Estimate requires a verified live Uniswap pool.');
 const read:Rpc=async(method,params)=>{signal?.throwIfAborted();const result=await rpc(method,params);signal?.throwIfAborted();return result;};
 await assertRobinhoodChain(read,'robinhood:mainnet');
 const block=await read('eth_getBlockByNumber',['latest',false]) as {number?:unknown;hash?:unknown}|null;
 if(!block||typeof block.number!=='string'||!/^0x[0-9a-f]+$/i.test(block.number)||typeof block.hash!=='string'||!/^0x[0-9a-f]{64}$/i.test(block.hash))throw Error('Estimate block unavailable.');
 const call=async(to:string,signature:string,args='',count=1)=>{
  const raw=await read('eth_call',[{to:address(to),data:selector(signature)+args},block.number]);
  if(typeof raw!=='string'||!new RegExp('^0x[0-9a-f]{'+count*64+'}$','i').test(raw))throw Error('Malformed estimate response.');
  return Array.from({length:count},(_,i)=>BigInt('0x'+raw.slice(2+i*64,66+i*64)));
 };
 const readAddress=async(to:string,sig:string,args='')=>{const[n]=await call(to,sig,args);if(n>=1n<<160n)throw Error('Invalid estimate address.');return address('0x'+n.toString(16).padStart(40,'0'));};
 if(await readAddress(MAINNET_V3_QUOTER,'factory()')!==DEX||await readAddress(MAINNET_V3_QUOTER,'WETH9()')!==WETH)throw Error('Unreviewed estimate quoter.');
 if(await readAddress(DEX,'getPool(address,address,uint24)',aw(WETH)+aw(market.tokenAddress)+uintWord(10000n))!==market.pool)throw Error('Estimate pool changed.');
 let output:bigint;
 if(asset==='USDG'){
  if((await call(ROBINHOOD_USDG,'decimals()'))[0]!==6n)throw Error('USDG precision changed.');
  const pool=await readAddress(DEX,'getPool(address,address,uint24)',aw(ROBINHOOD_USDG)+aw(WETH)+uintWord(USDG_WETH_FEE));
  const[token0,token1]=[ROBINHOOD_USDG,WETH].sort();
  if(BigInt(pool)===0n||await readAddress(pool,'token0()')!==token0||await readAddress(pool,'token1()')!==token1||await readAddress(pool,'factory()')!==DEX||(await call(pool,'fee()'))[0]!==USDG_WETH_FEE||(await call(pool,'liquidity()'))[0]===0n)throw Error('USDG conversion liquidity unavailable.');
  const path=side==='buy'?ROBINHOOD_USDG.slice(2)+'000064'+WETH.slice(2)+'002710'+market.tokenAddress.slice(2):market.tokenAddress.slice(2)+'002710'+WETH.slice(2)+'000064'+ROBINHOOD_USDG.slice(2);
  const q=await call(MAINNET_V3_QUOTER,'quoteExactInput(bytes,uint256)',uintWord(64n)+uintWord(amount)+bytes(path),10);
  if(q[1]!==128n||q[2]!==224n||q[4]!==2n||q[7]!==2n||q[5]<=0n||q[6]<=0n||q[5]>=1n<<160n||q[6]>=1n<<160n||q[8]>=1n<<32n||q[9]>=1n<<32n)throw Error('Malformed USDG estimate.');output=q[0];
 }else{
  const tokenIn=side==='buy'?WETH:market.tokenAddress,tokenOut=side==='buy'?market.tokenAddress:WETH;
  [output]=await call(MAINNET_V3_QUOTER,'quoteExactInputSingle((address,address,uint256,uint24,uint160))',aw(tokenIn)+aw(tokenOut)+uintWord(amount)+uintWord(10000n)+uintWord(0n),4);
 }
 if(output<=0n)throw Error('Estimate output is too small.');
 await assertRobinhoodChain(read,'robinhood:mainnet');const quotedAt=Date.now();
 return {output,outputDecimals:side==='sell'?precision:18,expiresAt:quotedAt+15000,quotedAt,block:block.number,estimated:true,executionEnabled:false};
}
