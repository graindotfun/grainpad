/** Creator-signed off-chain display data. Never changes GRNE, contracts or transaction calldata. */
import {keccak_256} from '@noble/hashes/sha3';
import {secp256k1} from '@noble/curves/secp256k1';
import {assertMetadataText,metadataLink} from '../metadata-shared.ts';
import {address,bytes32} from './robinhood-market.ts';
import {ROBINHOOD_MAINNET_FACTORY_ADDRESS} from './robinhood-mainnet.ts';
import {assertRobinhoodMainnet,type MainnetWalletSession} from './robinhood-mainnet-wallet.ts';
import type {MainnetLaunchRecord} from './robinhood-mainnet-registration.ts';
export type MainnetDisplayMetadata={schema:'grainpad.rh-display.v1';description:string;imageHash:string|null;twitter:string;telegram:string;website:string};
export type MainnetDisplayAuthorization={metadata:MainnetDisplayMetadata;signature:string};
const encode=new TextEncoder(),keys=['schema','description','imageHash','twitter','telegram','website'];
const hash=(b:Uint8Array)=>keccak_256(b);
const hex=(b:Uint8Array)=>'0x'+Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');
const bytes=(s:string)=>Uint8Array.from(s.replace(/^0x/,'').match(/../g)??[],v=>parseInt(v,16));
const concat=(...parts:Uint8Array[])=>{const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return result;};
const word=(n:bigint)=>bytes(n.toString(16).padStart(64,'0'));
const addressWord=(a:string)=>concat(new Uint8Array(12),bytes(a));
export function canonicalMainnetDisplay(value:unknown):MainnetDisplayMetadata{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw Error('Exact display metadata fields are required.');
 const v=value as MainnetDisplayMetadata;
 if(v.schema!=='grainpad.rh-display.v1'||typeof v.description!=='string'||v.description.length>1000||!(v.imageHash===null||typeof v.imageHash==='string'&&/^[a-f0-9]{64}$/.test(v.imageHash)))throw Error('Invalid bounded display metadata.');
 for(const k of ['twitter','telegram','website'] as const)if(typeof v[k]!=='string')throw Error('Project links must be text.');
 const description=v.description.trim().replace(/\r\n/g,'\n');assertMetadataText({name:'display',symbol:'display',description});
 const website=metadataLink(v.website,'website');
 if(website){const u=new URL(website),host=u.hostname.replace(/\.$/,'');if(u.port||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.startsWith('[')||/^[0-9.]+$/.test(host))throw Error('Use a public HTTPS project website.');}
 return {schema:'grainpad.rh-display.v1',description,imageHash:v.imageHash,twitter:metadataLink(v.twitter,'twitter'),telegram:metadataLink(v.telegram,'telegram'),website};
}
export const canonicalMainnetDisplayJSON=(v:unknown)=>JSON.stringify(canonicalMainnetDisplay(v));
export const mainnetDisplayHash=(v:unknown)=>hex(hash(encode.encode('grainpad.rh-display.v1\0'+canonicalMainnetDisplayJSON(v))));
export const mainnetDisplayImage=(display:MainnetDisplayMetadata)=>display.imageHash?'/api/assets/'+display.imageHash:null;
/** Explicit projection keeps optional display data out of the exact GRNE manifest schema. */
export function mainnetCoreRecord(r:MainnetLaunchRecord):MainnetLaunchRecord{
 return {networkId:r.networkId,chainId:r.chainId,tokenAddress:r.tokenAddress,launchId:r.launchId,transactionHash:r.transactionHash,name:r.name,symbol:r.symbol,creator:r.creator,factory:r.factory};
}
export function assertMainnetDisplayText(name:string,symbol:string){assertMetadataText({name,symbol,description:''});assertMetadataText({name:symbol,symbol,description:''});}
function verifiedDisplaySource(record:MainnetLaunchRecord){
 const r=mainnetCoreRecord(record);
 if(r.networkId!=='robinhood:mainnet'||r.chainId!==4663||!ROBINHOOD_MAINNET_FACTORY_ADDRESS||address(r.factory)!==ROBINHOOD_MAINNET_FACTORY_ADDRESS.toLowerCase())throw Error('Display authorization requires the reviewed Robinhood mainnet source.');
 r.creator=address(r.creator);r.factory=address(r.factory);r.tokenAddress=address(r.tokenAddress);r.launchId=bytes32(r.launchId);r.transactionHash=bytes32(r.transactionHash);
 if(r.launchId.slice(0,42)!==r.creator||typeof r.name!=='string'||encode.encode(r.name).length<1||encode.encode(r.name).length>32||typeof r.symbol!=='string'||encode.encode(r.symbol).length<1||encode.encode(r.symbol).length>10)throw Error('Display authorization source identity is invalid.');
 assertMainnetDisplayText(r.name,r.symbol);return r;
}
export function mainnetDisplayTypedData(record:MainnetLaunchRecord,display:unknown){
 const r=verifiedDisplaySource(record);
 return {types:{EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}],LaunchDisplay:[{name:'token',type:'address'},{name:'creator',type:'address'},{name:'transactionHash',type:'bytes32'},{name:'launchId',type:'bytes32'},{name:'name',type:'string'},{name:'symbol',type:'string'},{name:'displayHash',type:'bytes32'}]},primaryType:'LaunchDisplay',domain:{name:'Grainpad Launch Display',version:'1',chainId:4663,verifyingContract:r.factory},message:{token:r.tokenAddress,creator:r.creator,transactionHash:r.transactionHash,launchId:r.launchId,name:r.name,symbol:r.symbol,displayHash:mainnetDisplayHash(display)}};
}
export function mainnetDisplayDigest(record:MainnetLaunchRecord,display:unknown):Uint8Array{
 const t=mainnetDisplayTypedData(record,display),d=t.domain,m=t.message;
 const domain=hash(concat(hash(encode.encode('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),hash(encode.encode(d.name)),hash(encode.encode(d.version)),word(4663n),addressWord(d.verifyingContract)));
 const body=hash(concat(hash(encode.encode('LaunchDisplay(address token,address creator,bytes32 transactionHash,bytes32 launchId,string name,string symbol,bytes32 displayHash)')),addressWord(m.token),addressWord(m.creator),bytes(m.transactionHash),bytes(m.launchId),hash(encode.encode(m.name)),hash(encode.encode(m.symbol)),bytes(m.displayHash)));
 return hash(concat(new Uint8Array([0x19,0x01]),domain,body));
}
export function verifyMainnetDisplay(record:MainnetLaunchRecord,display:unknown,signature:unknown):MainnetDisplayMetadata{
 const metadata=canonicalMainnetDisplay(display),r=verifiedDisplaySource(record);
 if(typeof signature!=='string'||!/^0x[0-9a-f]{130}$/i.test(signature))throw Error('A creator display signature is required.');
 try{const raw=bytes(signature),s=secp256k1.Signature.fromCompact(raw.slice(0,64)),v=raw[64];if(s.hasHighS()||![27,28].includes(v))throw Error('canonical');
 const key=s.addRecoveryBit(v-27).recoverPublicKey(mainnetDisplayDigest(r,metadata)).toRawBytes(false),recovered=hex(hash(key.slice(1)).slice(12));if(recovered!==r.creator)throw Error('creator');}
 catch{throw Error('Creator display signature did not verify.');}
 return metadata;
}
/** Called only by the creator's explicit Register action. Never connects, switches networks or pays. */
export async function signMainnetDisplay(session:MainnetWalletSession,record:MainnetLaunchRecord,display:unknown):Promise<string>{
 const r=verifiedDisplaySource(record),metadata=canonicalMainnetDisplay(display);
 if(session.networkId!=='robinhood:mainnet'||session.chainId!==4663||address(session.account)!==r.creator)throw Error('Connect the creator wallet to sign these launch details.');
 const current=async()=>{await assertRobinhoodMainnet(session.provider);const accounts=await session.provider.request({method:'eth_accounts'});if(!Array.isArray(accounts)||typeof accounts[0]!=='string'||address(accounts[0])!==r.creator)throw Error('Creator wallet changed.');};
 await current();const signature=await session.provider.request({method:'eth_signTypedData_v4',params:[session.account,JSON.stringify(mainnetDisplayTypedData(r,metadata))]});await current();
 verifyMainnetDisplay(r,metadata,signature);return signature as string;
}
