/** Payment currencies for the existing RH Uniswap pool. Quote/build only; never requests a wallet or sends. */
import {address,assertRobinhoodChain,parseUnits18,uintWord,type Rpc,type Transaction} from './robinhood-market.ts';
import {ROBINHOOD_CHAIN_MAINNET} from './robinhood-mainnet.ts';
import {MAINNET_V3_ROUTER,MAINNET_V3_QUOTER,type MainnetMarket,type MainnetTradePlan,assertMainnetTradeFresh} from './robinhood-mainnet-market.ts';
import {keccakHex} from './evm-one-approval-launch.ts';
export const ROBINHOOD_USDG='0x5fc5360d0400a0fd4f2af552add042d716f1d168';
const DEX='0x1f7d7550b1b028f7571e69a784071f0205fd2efa',WETH=ROBINHOOD_CHAIN_MAINNET.wethAddress;
export const USDG_WETH_FEE=100n;
export type MainnetPaymentAsset='ETH'|'USDG';
export type MainnetPaymentPlan=MainnetTradePlan & {paymentAsset:MainnetPaymentAsset;inputDecimals:6|18;outputDecimals:6|18;route:string[];estimatedGasReserve:bigint|null};
const selector=(signature:string)=>keccakHex(new TextEncoder().encode(signature)).slice(0,10);
const aw=(a:string)=>uintWord(BigInt(address(a)));
function words(value:unknown,count:number):bigint[]{
 if(typeof value!=='string'||!new RegExp('^0x[0-9a-f]{'+64*count+'}$','i').test(value))throw Error('Invalid payment route response.');
 return Array.from({length:count},(_,i)=>BigInt('0x'+value.slice(2+i*64,66+i*64)));
}
function quantity(value:unknown){if(typeof value!=='string'||!/^0x[0-9a-f]+$/i.test(value))throw Error('Wallet fee information unavailable.');return BigInt(value);}
const bytes=(raw:string)=>uintWord(BigInt(raw.length/2))+raw.padEnd(Math.ceil(raw.length/64)*64,'0');
function multicall(expiresAt:number,calls:string[]){
 let offset=32*calls.length;const encoded=calls.map(call=>bytes(call.slice(2))),offsets=encoded.map(call=>{const start=offset;offset+=call.length/2;return uintWord(BigInt(start));});
 return '0x5ae401dc'+uintWord(BigInt(Math.floor(expiresAt/1000)))+uintWord(64n)+uintWord(BigInt(calls.length))+offsets.join('')+encoded.join('');
}
export function mainnetPaymentDecimals(asset:MainnetPaymentAsset):6|18{if(asset==='ETH')return 18;if(asset==='USDG')return 6;throw Error('Choose ETH or USDG.');}
export function parseMainnetPaymentAmount(value:string,asset:MainnetPaymentAsset,side:'buy'|'sell'){
 const precision=mainnetPaymentDecimals(asset),decimals=side==='buy'?precision:18;
 if(side!=='buy'&&side!=='sell')throw Error('Unknown trade side.');
 if(decimals===18)return parseUnits18(value);
 if(typeof value!=='string'||!/^\d+(?:\.\d{1,6})?$/.test(value)||value.length>90)throw Error('Enter USDG with up to 6 decimal places.');
 const [whole,fraction='']=value.split('.'),amount=BigInt(whole)*1_000_000n+BigInt(fraction.padEnd(6,'0'));
 if(amount<=0n||amount>=1n<<256n)throw Error('Amount is outside uint256.');return amount;
}
/** ETH uses the router's existing wrapping/unwrap methods. USDG uses one verified two-hop exact-input route. */
export async function prepareMainnetPaymentTrade(rpc:Rpc,market:MainnetMarket,owner:string,side:'buy'|'sell',amount:bigint,slippageBps:number,asset:MainnetPaymentAsset,now=Date.now()):Promise<MainnetPaymentPlan>{
 const paymentDecimals=mainnetPaymentDecimals(asset),account=address(owner);
 if(side!=='buy'&&side!=='sell'||amount<=0n||amount>=1n<<256n||!Number.isInteger(slippageBps)||slippageBps<0||slippageBps>500||!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(now+60000))throw Error('Invalid payment amount or slippage.');
 if(market.networkId!=='robinhood:mainnet'||market.quote!==WETH||!market.pool||!market.locker||!market.continuous&&!market.graduated)throw Error('ETH and USDG routing requires a verified live Uniswap pool.');
 await assertRobinhoodChain(rpc,'robinhood:mainnet');
 const call=async(to:string,signature:string,args='',count=1)=>words(await rpc('eth_call',[{to:address(to),data:selector(signature)+args},market.block]),count);
 const readAddress=async(to:string,signature:string,args='')=>{const [n]=await call(to,signature,args);if(n>=1n<<160n)throw Error('Invalid route address.');return address('0x'+n.toString(16).padStart(40,'0'));};
 for(const contract of [MAINNET_V3_ROUTER,MAINNET_V3_QUOTER]){
  if(await readAddress(contract,'factory()')!==DEX||await readAddress(contract,'WETH9()')!==WETH)throw Error('Unreviewed payment router wiring.');
 }
 if(await readAddress(DEX,'getPool(address,address,uint24)',aw(WETH)+aw(market.tokenAddress)+uintWord(10000n))!==market.pool)throw Error('Token pool identity changed.');
 const tokenIn=side==='buy'?(asset==='USDG'?ROBINHOOD_USDG:WETH):market.tokenAddress,tokenOut=side==='buy'?market.tokenAddress:(asset==='USDG'?ROBINHOOD_USDG:WETH);
 let output:bigint;let path='';
 if(asset==='USDG'){
  if((await call(ROBINHOOD_USDG,'decimals()'))[0]!==6n)throw Error('USDG precision changed.');
  const pool=await readAddress(DEX,'getPool(address,address,uint24)',aw(ROBINHOOD_USDG)+aw(WETH)+uintWord(USDG_WETH_FEE));
  if(BigInt(pool)===0n)throw Error('USDG conversion liquidity unavailable. Choose ETH.');
  const [token0,token1]=[ROBINHOOD_USDG,WETH].sort();
  if(await readAddress(pool,'token0()')!==token0||await readAddress(pool,'token1()')!==token1||await readAddress(pool,'factory()')!==DEX||(await call(pool,'fee()'))[0]!==USDG_WETH_FEE||(await call(pool,'liquidity()'))[0]===0n)throw Error('USDG conversion pool is unavailable or changed.');
  path=side==='buy'?ROBINHOOD_USDG.slice(2)+USDG_WETH_FEE.toString(16).padStart(6,'0')+WETH.slice(2)+(10000).toString(16).padStart(6,'0')+market.tokenAddress.slice(2):market.tokenAddress.slice(2)+(10000).toString(16).padStart(6,'0')+WETH.slice(2)+USDG_WETH_FEE.toString(16).padStart(6,'0')+ROBINHOOD_USDG.slice(2);
  const value=await call(MAINNET_V3_QUOTER,'quoteExactInput(bytes,uint256)',uintWord(64n)+uintWord(amount)+bytes(path),10);
  if(value[1]!==128n||value[2]!==224n||value[4]!==2n||value[7]!==2n||value[5]<=0n||value[6]<=0n||value[5]>=1n<<160n||value[6]>=1n<<160n||value[8]>=1n<<32n||value[9]>=1n<<32n)throw Error('USDG route quote is malformed.');
  output=value[0];
 }else{
  const value=await call(MAINNET_V3_QUOTER,'quoteExactInputSingle((address,address,uint256,uint24,uint160))',aw(tokenIn)+aw(tokenOut)+uintWord(amount)+uintWord(10000n)+uintWord(0n),4);output=value[0];
 }
 const minimum=output*BigInt(10000-slippageBps)/10000n;if(minimum<=0n)throw Error('Output is too small.');
 const tx=(to:string,data:string,value=0n):Transaction=>({from:account,to:address(to),data,value:'0x'+value.toString(16),chainId:'0x1237'});
 const expiresAt=now+60000,recipient=asset==='ETH'&&side==='sell'?MAINNET_V3_ROUTER:account;
 const inner=asset==='USDG'?selector('exactInput((bytes,address,uint256,uint256))')+uintWord(32n)+uintWord(128n)+aw(recipient)+uintWord(amount)+uintWord(minimum)+bytes(path):'0x04e45aaf'+aw(tokenIn)+aw(tokenOut)+uintWord(10000n)+aw(recipient)+uintWord(amount)+uintWord(minimum)+uintWord(0n);
 const calls=[inner];if(asset==='ETH')calls.push(side==='buy'?selector('refundETH()'):selector('unwrapWETH9(uint256,address)')+uintWord(minimum)+aw(account));
 const transaction=tx(MAINNET_V3_ROUTER,multicall(expiresAt,calls),asset==='ETH'&&side==='buy'?amount:0n);
 let approval:Transaction|null=null,estimatedGasReserve:bigint|null=null;
 if(asset==='ETH'&&side==='buy'){
  const balance=quantity(await rpc('eth_getBalance',[account,'latest']));if(balance<amount)throw Error('Insufficient ETH balance.');
  const gas=quantity(await rpc('eth_estimateGas',[transaction])),gasPrice=quantity(await rpc('eth_gasPrice',[]));
  if(gas<=0n||gasPrice<=0n)throw Error('Network fee estimate unavailable.');
  estimatedGasReserve=(gas*gasPrice*120n+99n)/100n;
  if(balance<amount+estimatedGasReserve)throw Error('Keep enough ETH for network gas. Reduce the amount.');
 }else{
  if((await call(tokenIn,'balanceOf(address)',aw(account)))[0]<amount)throw Error('Insufficient '+(side==='buy'?'USDG':'token')+' balance.');
  const allowance=(await call(tokenIn,'allowance(address,address)',aw(account)+aw(MAINNET_V3_ROUTER)))[0];
  if(allowance<amount)approval=tx(tokenIn,'0x095ea7b3'+aw(MAINNET_V3_ROUTER)+uintWord(amount));
 }
 await assertRobinhoodChain(rpc,'robinhood:mainnet');
 return {market,side,amount,output,minimum,fees:{platform:0n,creator:0n,trade:0n},approval,transaction,expiresAt,venue:'uniswap-v3',paymentAsset:asset,inputDecimals:side==='buy'?paymentDecimals:18,outputDecimals:side==='sell'?paymentDecimals:18,route:asset==='USDG'?[tokenIn,WETH,tokenOut]:[tokenIn,tokenOut],estimatedGasReserve};
}
export function assertMainnetPaymentFresh(plan:MainnetPaymentPlan,now=Date.now()){
 assertMainnetTradeFresh(plan,now);mainnetPaymentDecimals(plan.paymentAsset);
 if(plan.transaction.to!==MAINNET_V3_ROUTER||plan.transaction.chainId!=='0x1237'||BigInt(plan.transaction.value)!==(plan.paymentAsset==='ETH'&&plan.side==='buy'?plan.amount:0n)||plan.paymentAsset==='ETH'&&plan.side==='buy'&&plan.approval)throw Error('Payment review changed. Review a fresh quote.');
}
