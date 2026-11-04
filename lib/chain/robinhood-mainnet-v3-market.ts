import {address,bytes32,assertRobinhoodChain,uintWord,type Rpc,type LaunchIdentity} from './robinhood-market.ts';
import {keccakHex} from './evm-one-approval-launch.ts';
import {ROBINHOOD_CHAIN_MAINNET} from './robinhood-mainnet.ts';
import type {MainnetMarket} from './robinhood-mainnet-market.ts';
const selector=(s:string)=>keccakHex(new TextEncoder().encode(s)).slice(0,10);
const addr=(n:bigint)=>address('0x'+n.toString(16).padStart(40,'0'));
const aw=(s:string)=>uintWord(BigInt(address(s)));
const NPM='0x73991a25c818bf1f1128deaab1492d45638de0d3',DEX='0x1f7d7550b1b028f7571e69a784071f0205fd2efa',PLATFORM='0xf405420b031f1a6fbffd0b2f90cc9ed84818dc9a';
export async function readContinuousMainnetMarket(rpc:Rpc,identity:LaunchIdentity):Promise<MainnetMarket>{
 await assertRobinhoodChain(rpc,'robinhood:mainnet');
 const factory=address(identity.factory),token=address(identity.tokenAddress),id=bytes32(identity.launchId),quote=ROBINHOOD_CHAIN_MAINNET.wethAddress;
 const block=await rpc('eth_blockNumber',[]);if(typeof block!=='string'||!/^0x[0-9a-f]+$/i.test(block))throw new Error('Missing mainnet block.');
 const read=async(to:string,signature:string,args='',count=1)=>{
  const value=await rpc('eth_call',[{to:address(to),data:selector(signature)+args},block]);
  if(typeof value!=='string'||!new RegExp('^0x[0-9a-f]{'+count*64+'}$','i').test(value))throw new Error('Invalid continuous-market response.');
  return Array.from({length:count},(_,i)=>BigInt('0x'+value.slice(2+i*64,66+i*64)));
 };
 const one=async(to:string,s:string,args='')=>(await read(to,s,args))[0];
 // Each group contains independent reads at the same block, bounded to at most seven concurrent requests.
 const [registered,creatorValue,lockerValue,poolValue,position]=await Promise.all(['tokenOf(bytes32)','creatorOf(bytes32)','lockerOf(bytes32)','poolOf(bytes32)','positionIdOf(bytes32)'].map(s=>one(factory,s,id.slice(2))));
 if(addr(registered)!==token)throw new Error('Token is not registered at this factory.');
 const creator=addr(creatorValue),locker=addr(lockerValue),pool=addr(poolValue);
 if(position===0n||BigInt(locker)===0n||BigInt(pool)===0n)throw new Error('Missing continuous liquidity.');
 const first=token<quote,t0=first?token:quote,t1=first?quote:token;
 const [factoryWeth,factoryNpm,factoryDex,factoryPlatform,factoryFee]=await Promise.all(['weth()','npm()','dex()','platform()','POOL_FEE()'].map(s=>one(factory,s)));
 if(addr(factoryWeth)!==quote||addr(factoryNpm)!==NPM||addr(factoryDex)!==DEX||addr(factoryPlatform)!==PLATFORM||factoryFee!==10000n)throw new Error('Unreviewed continuous factory wiring.');
 const [dexPool,pool0,pool1,poolFee]=await Promise.all([one(DEX,'getPool(address,address,uint24)',aw(t0)+aw(t1)+uintWord(10000n)),one(pool,'token0()'),one(pool,'token1()'),one(pool,'fee()')]);
 if(addr(dexPool)!==pool||addr(pool0)!==t0||addr(pool1)!==t1||poolFee!==10000n)throw new Error('Unverified continuous pool.');
 const lockerChecks=[['launcher()',factory],['platform()',PLATFORM],['creator()',creator],['token()',token],['weth()',quote],['pool()',pool],['npm()',NPM]] as const;
 const lockerValues=await Promise.all(lockerChecks.map(([s])=>one(locker,s)));
 if(lockerValues.some((value,i)=>addr(value)!==lockerChecks[i][1]))throw new Error('Unverified continuous locker.');
 const [registeredLocker,lockedPosition,positionOwner,pos,supply,tokenSupply]=await Promise.all([one(locker,'registered()'),one(locker,'tokenId()'),one(NPM,'ownerOf(uint256)',uintWord(position)),read(NPM,'positions(uint256)',uintWord(position),12),one(factory,'totalSupply()'),one(token,'totalSupply()')]);
 if(registeredLocker!==1n||lockedPosition!==position||addr(positionOwner)!==locker)throw new Error('Liquidity custody mismatch.');
 const lower=first?-207200n:-887200n,upper=first?887200n:207200n;
 if(pos[1]!==0n||addr(pos[2])!==t0||addr(pos[3])!==t1||pos[4]!==10000n||BigInt.asIntN(24,pos[5])!==lower||BigInt.asIntN(24,pos[6])!==upper||pos[7]===0n)throw new Error('Unverified continuous position.');
 if(supply!==1_000_000_000n*10n**18n||tokenSupply!==supply)throw new Error('Continuous supply mismatch.');
 const [realQuote,inventory,lockedTokens]=await Promise.all([one(quote,'balanceOf(address)',aw(pool)),one(token,'balanceOf(address)',aw(pool)),one(token,'balanceOf(address)',aw(locker))]);
 return {networkId:'robinhood:mainnet',factory,tokenAddress:token,launchId:id,curve:pool,vault:locker,quote,creator,platform:PLATFORM,supply,block,realQuote,inventory,platformFeeBps:35n,creatorFeeBps:65n,tradeFeeBps:0n,graduated:false,graduationPending:false,continuous:true,locker,pool,maxBuy:0n,lockedTokens};
}
