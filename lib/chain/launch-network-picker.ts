/** Display/navigation catalog only. Does not register adapters or authorize execution. */
import {ROBINHOOD_CHAIN_MAINNET,ROBINHOOD_MAINNET_FACTORY_ADDRESS} from './robinhood-mainnet.ts';
import {ROBINHOOD_CHAIN_TESTNET} from './robinhood-testnet.ts';
import {ROBINHOOD_FACTORY_ADDRESS} from './robinhood-factory.ts';
export type PickerNetworkId='solana:mainnet-beta'|'solana:devnet'|'robinhood:mainnet'|'robinhood:testnet';
export type PickerNetwork={readonly id:PickerNetworkId;readonly label:string;readonly environment:'mainnet'|'testnet';readonly family:'solana'|'evm';readonly route:string;readonly logoMain:string;readonly logoHover:string;readonly available:boolean;readonly recoveryOnly:boolean;readonly quoteLabel:string;readonly walletLabel:string;readonly dexLabel:string};
const logo=(family:'sol'|'robinhood',state:'main'|'hover')=>`/brand/networks/${family}-${state}.svg`;
/** available means a form entry, never that on-chain policy or admission already passed. */
export const PICKER_NETWORKS:readonly PickerNetwork[]=Object.freeze([
 Object.freeze({id:'solana:mainnet-beta',label:'Solana',environment:'mainnet',family:'solana',route:'/launch/solana/mainnet',logoMain:logo('sol','main'),logoHover:logo('sol','hover'),available:true,recoveryOnly:false,quoteLabel:'SOL / wXMR',walletLabel:'Solana browser wallet',dexLabel:'Raydium · current launch-policy checks required'} as const),
 Object.freeze({id:'robinhood:mainnet',label:'Robinhood Chain',environment:'mainnet',family:'evm',route:'/launch/robinhood/mainnet',logoMain:logo('robinhood','main'),logoHover:logo('robinhood','hover'),available:ROBINHOOD_CHAIN_MAINNET.chainId===4663&&ROBINHOOD_MAINNET_FACTORY_ADDRESS!==null,recoveryOnly:false,quoteLabel:'WETH · ETH for gas',walletLabel:'EVM browser wallet',dexLabel:'Uniswap · automatic graduation, locked liquidity'} as const),
 Object.freeze({id:'robinhood:testnet',label:'Robinhood Chain',environment:'testnet',family:'evm',route:'/launch/robinhood/testnet',logoMain:logo('robinhood','main'),logoHover:logo('robinhood','hover'),available:ROBINHOOD_CHAIN_TESTNET.chainId===46630&&ROBINHOOD_FACTORY_ADDRESS!==null,recoveryOnly:false,quoteLabel:'Testnet WETH · test ETH for gas',walletLabel:'EVM browser wallet',dexLabel:'Testnet curve · no DEX graduation'} as const),
 Object.freeze({id:'solana:devnet',label:'Solana',environment:'testnet',family:'solana',route:'/launch/solana/devnet',logoMain:logo('sol','main'),logoHover:logo('sol','hover'),available:false,recoveryOnly:true,quoteLabel:'Test funds · previous receipts only',walletLabel:'Solana browser wallet',dexLabel:'New devnet launches remain closed'} as const),
]);
export function pickerNetwork(id:unknown):PickerNetwork|null{return PICKER_NETWORKS.find(n=>n.id===id)??null;}
export function pickerDefaults(savedId:unknown,queryId:unknown,showTestnets=false):PickerNetworkId{
 for(const id of [queryId,savedId]){const n=pickerNetwork(id);if(n?.available&&!n.recoveryOnly&&(n.environment==='mainnet'||showTestnets))return n.id;}
 return 'solana:mainnet-beta';
}
const evmHash=(v:unknown):v is string=>typeof v==='string'&&/^0x[0-9a-f]{64}$/i.test(v)&&!/^0x0{64}$/i.test(v);
const base58Alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Bytes(v:unknown,bytes:number):v is string {
 if(typeof v!=='string'||v.length<bytes||v.length>Math.ceil(bytes*1.366)||!/^[1-9A-HJ-NP-Za-km-z]+$/.test(v))return false;
 let value=0n;for(const c of v)value=value*58n+BigInt(base58Alphabet.indexOf(c));
 let length=0;while(value){length++;value>>=8n;}let zeros=0;while(v[zeros]==='1')zeros++;
 return length+zeros===bytes;
}
const solHash=(v:unknown):v is string=>base58Bytes(v,64);
const solAccount=(v:unknown):v is string=>base58Bytes(v,32);
export function pickerNetworkHref(id:PickerNetworkId,options:{name?:string;recover?:string;draft?:string}={}):string{
 const n=pickerNetwork(id);if(!n)throw Error('Unknown launch network.');const query=new URLSearchParams();
 if(options.name!==undefined){if(typeof options.name!=='string'||options.name.length>256||/[\u0000-\u001f\u007f]/.test(options.name))throw Error('Invalid launch name link.');if(options.name)query.set('name',options.name);}
 if(options.recover!==undefined){if(!(n.family==='evm'?evmHash(options.recover):solHash(options.recover)))throw Error('Recovery hash does not match the explicitly selected network family.');query.set('recover',n.family==='evm'?options.recover.toLowerCase():options.recover);}
 if(options.draft!==undefined){if(typeof options.draft!=='string'||!/^[A-Za-z0-9:_-]{1,180}$/.test(options.draft))throw Error('Invalid launch draft handoff.');query.set('draft',options.draft);}
 const suffix=query.toString();return n.route+(suffix?'?'+suffix:'');
}
/** Historic /launch/robinhood remains testnet forever; an address/hash never chooses a chain. */
export function pickerNetworkForRoute(path:unknown):PickerNetworkId|null{
 if(typeof path!=='string')return null;const clean=path.split(/[?#]/,1)[0].replace(/\/$/,'');
 if(clean==='/launch/robinhood')return 'robinhood:testnet';return PICKER_NETWORKS.find(n=>n.route===clean)?.id??null;
}
export type PendingPickerLaunch={readonly networkId:PickerNetworkId;readonly hash:string|null;readonly href:string;readonly status:'resume'|'uncertain';readonly sourceKey:string;readonly account?:string;readonly mint?:string;readonly launchId?:string};
function jsonRecord(value:unknown,max=32768):Record<string,unknown>|null{
 try{if(typeof value==='string'){if(value.length>max)return null;value=JSON.parse(value);}return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}catch{return null;}
}
const knownVersion=(r:Record<string,unknown>)=>r.version===undefined||r.version===1;
export function parseStoredSolanaPending(value:unknown):PendingPickerLaunch|null{
 const r=jsonRecord(value);if(!r||!knownVersion(r)||!['mainnet-beta','devnet'].includes(String(r.network))||!solAccount(r.mint)||!solAccount(r.owner)||typeof r.metadataHash!=='string'||! /^[a-f0-9]{64}$/i.test(r.metadataHash)||!solHash(r.signature)||r.lastValidBlockHeight!==undefined&&(!Number.isSafeInteger(r.lastValidBlockHeight)||Number(r.lastValidBlockHeight)<0))return null;
 const networkId:PickerNetworkId=r.network==='devnet'?'solana:devnet':'solana:mainnet-beta';
 return {networkId,hash:r.signature,href:pickerNetworkHref(networkId,{recover:r.signature}),status:'resume',sourceKey:'grainpad-pending',account:r.owner,mint:r.mint};
}
/** The key supplies chain identity; do not infer mainnet/testnet from identical EVM hash shapes. */
export function parseStoredRhPending(key:unknown,value:unknown):PendingPickerLaunch|null{
 if(typeof key!=='string'||!/^grainpad:(4663|46630):create:0x[0-9a-f]{40}$/i.test(key))return null;
 const networkId:PickerNetworkId=key.toLowerCase().startsWith('grainpad:46630:')?'robinhood:testnet':'robinhood:mainnet';
 const account=key.split(':').at(-1)!.toLowerCase();if(/^0x0{40}$/.test(account))return null;
 const r=jsonRecord(value,3_000_000);if(!r||!knownVersion(r))return null;
 if(r.id!==undefined&&(typeof r.id!=='string'||!/^0x[0-9a-f]{64}$/i.test(r.id)||networkId==='robinhood:mainnet'&&r.id.slice(0,42).toLowerCase()!==account))return null;
 if(r.hash!==undefined&&!evmHash(r.hash))return null;
 if(r.submissionRequested!==undefined&&typeof r.submissionRequested!=='boolean')return null;
 if(r.reservedHash!==undefined&&r.reservedHash!=='0x'+'0'.repeat(64))return null;
 if(evmHash(r.hash))return {networkId,hash:r.hash.toLowerCase(),href:pickerNetworkHref(networkId,{recover:r.hash}),status:'resume',sourceKey:key,account,...(typeof r.id==='string'?{launchId:r.id.toLowerCase()}:{})};
 if(r.submissionRequested===false)return null;
 // Existing IndexedDB {id,draft} or small reservedHash marker may survive a lost wallet reply.
 if(typeof r.id!=='string'||!Object.hasOwn(r,'draft')&&!Object.hasOwn(r,'reservedHash')&&r.submissionRequested!==true)return null;
 return {networkId,hash:null,href:pickerNetworkHref(networkId),status:'uncertain',sourceKey:key,account,launchId:r.id.toLowerCase()};
}
