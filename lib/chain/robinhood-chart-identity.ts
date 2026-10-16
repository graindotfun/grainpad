/** Public display identity only. Does not establish fee custody or authorize a wallet transaction. */
import {address,bytes32,assertRobinhoodChain,uintWord,type Rpc} from './robinhood-market.ts';
import {mainnetFactoryKind} from './robinhood-mainnet-factories.ts';
import {ROBINHOOD_CHAIN_MAINNET} from './robinhood-mainnet.ts';
import type {MainnetLaunchRecord} from './robinhood-mainnet-registration.ts';
import {keccakHex} from './evm-one-approval-launch.ts';
export type RobinhoodHistoryMarket={networkId:'robinhood:mainnet';factory:string;tokenAddress:string;launchId:string;curve:string;quote:string;pool:string|null;block:string;continuous:boolean};
const selector=(s:string)=>keccakHex(new TextEncoder().encode(s)).slice(0,10),addr=(n:bigint)=>address('0x'+n.toString(16).padStart(40,'0'));
export async function readRobinhoodChartIdentity(rpc:Rpc,record:MainnetLaunchRecord){
 const kind=mainnetFactoryKind(record.factory);if(!kind)throw Error('Unreviewed chart factory.');await assertRobinhoodChain(rpc,'robinhood:mainnet');
 const finalized=await rpc('eth_getBlockByNumber',['finalized',false]) as {number?:string;hash?:string};bytes32(finalized?.hash);if(typeof finalized.number!=='string'||!/^0x[0-9a-f]+$/i.test(finalized.number))throw Error('Finalized chart block unavailable.');
 const block=finalized.number,factory=address(record.factory),token=address(record.tokenAddress),launchId=bytes32(record.launchId),quote=ROBINHOOD_CHAIN_MAINNET.wethAddress;
 const read=async(to:string,signature:string,args='',count=1)=>{const raw=await rpc('eth_call',[{to:address(to),data:selector(signature)+args},block]);if(typeof raw!=='string'||!new RegExp('^0x[0-9a-f]{'+count*64+'}$','i').test(raw))throw Error('Chart state unavailable.');return Array.from({length:count},(_,i)=>BigInt('0x'+raw.slice(2+i*64,66+i*64)));};
 const one=async(to:string,s:string,args='')=>(await read(to,s,args))[0];
 if(addr(await one(factory,'tokenOf(bytes32)',launchId.slice(2)))!==token)throw Error('Chart token is not registered at this factory.');
 const supply=await one(token,'totalSupply()');if(supply!==1_000_000_000n*10n**18n)throw Error('Unreviewed chart supply.');
 const continuous=kind==='v3'||kind==='v3-metadata';let curve:string,pool:string|null=null,graduated=false,realQuote=0n,inventory=0n,priceQuote:number;
 if(continuous){pool=addr(await one(factory,'poolOf(bytes32)',launchId.slice(2)));curve=pool;}
 else{
  curve=addr(await one(factory,'curve()'));
  if(addr(await one(curve,'factory()'))!==factory||addr(await one(curve,'quote()'))!==quote)throw Error('Chart curve wiring differs.');
  const [storedToken,creator,raised,remaining,exists]=await read(curve,'launches(bytes32)',launchId.slice(2),5);
  if(exists!==1n||addr(storedToken)!==token||addr(creator)!==record.creator)throw Error('Chart curve identity differs.');realQuote=raised;inventory=remaining;
  {const done=await one(curve,'graduated(bytes32)',launchId.slice(2));if(done!==0n&&done!==1n)throw Error('Invalid chart lifecycle.');graduated=done===1n;if(graduated)pool=addr(await one(curve,'poolOf(bytes32)',launchId.slice(2)));}
 }
 if(pool){const [t0,t1]=await Promise.all([one(pool,'token0()'),one(pool,'token1()')]);if(!((t0===BigInt(token)&&t1===BigInt(quote))||(t0===BigInt(quote)&&t1===BigInt(token))))throw Error('Chart pool assets differ.');const slot=await read(pool,'slot0()','',7),sqrt=Number(slot[0]),ratio=(sqrt/2**96)**2;priceQuote=t0===BigInt(token)?ratio:1/ratio;realQuote=await one(quote,'balanceOf(address)',uintWord(BigInt(pool)));}
 else{const [vq,vt]=await Promise.all([one(curve,'virtualQuote()'),one(curve,'virtualToken()')]);priceQuote=Number(vq+realQuote)/Number(vt+inventory);}
 if(!Number.isFinite(priceQuote)||priceQuote<=0)throw Error('Chart price unavailable.');
 const market:RobinhoodHistoryMarket={networkId:'robinhood:mainnet',factory,tokenAddress:token,launchId,curve,quote,pool,block,continuous};
 return {market,blockHash:bytes32(finalized.hash),finalized:BigInt(block),graduated,realQuote,supply,priceQuote};
}
