/** GRNE v1. Public EVM authorization, not an asset on Monero. */
import {createHash} from 'node:crypto';
import {keccak_256} from '@noble/hashes/sha3';
import {secp256k1} from '@noble/curves/secp256k1';
import {encodeNonce} from './monero-record.mjs';
export const EVM_RECORD_BYTES=171;
export const EVM_SOURCE_CHAINS=Object.freeze({'robinhood:testnet':46630,'robinhood:mainnet':4663,'ethereum:mainnet':1,'base:mainnet':8453,'bnb:mainnet':56});
export function evmSourceChainId(network){
 if(Object.hasOwn(EVM_SOURCE_CHAINS,network))return EVM_SOURCE_CHAINS[network];
 if(typeof network==='string'&&/^eip155:[1-9][0-9]{0,9}$/.test(network)){const id=Number(network.slice(7));if(id<=0xffffffff)return id;}
 throw Error('Unsupported source network.');
}
const h=x=>Buffer.from(keccak_256(x));
const word=n=>Buffer.from(BigInt(n).toString(16).padStart(64,'0'),'hex');
function hex(value,size){if(typeof value!=='string'||!new RegExp(`^0x[0-9a-fA-F]{${size*2}}$`).test(value))throw Error('Invalid fixed-length hex.');return value.toLowerCase();}
export const evmAddress=x=>{const a=hex(x,20);if(a==='0x'+'00'.repeat(20))throw Error('Zero address.');return a;};
const bytes=x=>Buffer.from(x.slice(2),'hex');
const addressWord=x=>Buffer.concat([Buffer.alloc(12),bytes(evmAddress(x))]);
function decimal(x){if(typeof x!=='string'||! /^(0|[1-9][0-9]{0,19})$/.test(x)||BigInt(x)>0xffffffffffffffffn)throw Error('Invalid decimal integer.');return x;}
function text(x,max){if(typeof x!=='string'||Buffer.byteLength(x)<1||Buffer.byteLength(x)>max||/[\x00-\x1f]/.test(x))throw Error('Invalid launch text.');return x;}
export function canonicalManifest(m){
 if(m?.schema!=='grainpad.evm-launch.v1'||m.chainId!==evmSourceChainId(m.networkId))throw Error('Unsupported source network.');
 const normalized={schema:m.schema,networkId:m.networkId,chainId:m.chainId,factory:evmAddress(m.factory),tokenAddress:evmAddress(m.tokenAddress),creator:evmAddress(m.creator),launchId:hex(m.launchId,32),transactionHash:hex(m.transactionHash,32),blockNumber:decimal(m.blockNumber),blockHash:hex(m.blockHash,32),logIndex:decimal(m.logIndex),eventTopic:hex(m.eventTopic,32),eventData:hex(m.eventData,Buffer.from(String(m.eventData).slice(2),'hex').length),name:text(m.name,32),symbol:text(m.symbol,10)};
 if(normalized.eventData.length>2050)throw Error('Oversized launch event.');
 const expected=Object.keys(normalized).sort();if(JSON.stringify(Object.keys(m).sort())!==JSON.stringify(expected))throw Error('Unexpected manifest fields.');
 return JSON.stringify(normalized);
}
export function manifestHash(m){return '0x'+createHash('sha256').update('grainpad.evm-launch.v1\0').update(canonicalManifest(m)).digest('hex');}
export function authorizationTypedData(f){
 if(!Number.isSafeInteger(f.chainId)||f.chainId<1||f.chainId>0xffffffff)throw Error('Unsupported authorization chain.');
 return {types:{EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}],LaunchAnchor:[{name:'manifestHash',type:'bytes32'},{name:'creator',type:'address'},{name:'nonce',type:'bytes16'},{name:'expiresAt',type:'uint64'}]},primaryType:'LaunchAnchor',domain:{name:'Grainpad Launch Provenance',version:'1',chainId:f.chainId,verifyingContract:evmAddress(f.factory)},message:{manifestHash:hex(f.manifestHash,32),creator:evmAddress(f.creator),nonce:hex(f.nonce,16),expiresAt:decimal(f.expiresAt)}};
}
export function authorizationDigest(f){
 const t=authorizationTypedData(f),d=t.domain,m=t.message;
 const domain=h(Buffer.concat([h(Buffer.from('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),h(Buffer.from(d.name)),h(Buffer.from(d.version)),word(d.chainId),addressWord(d.verifyingContract)]));
 const body=h(Buffer.concat([h(Buffer.from('LaunchAnchor(bytes32 manifestHash,address creator,bytes16 nonce,uint64 expiresAt)')),bytes(m.manifestHash),addressWord(m.creator),Buffer.concat([bytes(m.nonce),Buffer.alloc(16)]),word(m.expiresAt)]));
 return h(Buffer.concat([Buffer.from([0x19,0x01]),domain,body]));
}
export function verifyEvmRecord(record,manifest=null){
 const b=Buffer.from(record);if(b.length!==EVM_RECORD_BYTES||b.subarray(0,4).toString()!=='GRNE'||b.readUInt16LE(4)!==1)throw Error('Unsupported GRNE record.');
 const f={chainId:b.readUInt32LE(6),factory:'0x'+b.subarray(10,30).toString('hex'),manifestHash:'0x'+b.subarray(30,62).toString('hex'),creator:'0x'+b.subarray(62,82).toString('hex'),nonce:'0x'+b.subarray(82,98).toString('hex'),expiresAt:b.readBigUInt64LE(98).toString(),signature:'0x'+b.subarray(106).toString('hex')};
 const s=secp256k1.Signature.fromCompact(b.subarray(106,170));if(s.hasHighS()||![27,28].includes(b[170]))throw Error('Noncanonical EVM signature.');
 const publicKey=s.addRecoveryBit(b[170]-27).recoverPublicKey(authorizationDigest(f)).toRawBytes(false);
 const recovered='0x'+h(publicKey.subarray(1)).subarray(12).toString('hex');if(recovered!==f.creator)throw Error('Creator authorization signature mismatch.');
 if(manifest){const m=JSON.parse(canonicalManifest(manifest));if(manifestHash(m)!==f.manifestHash||m.creator!==f.creator||m.factory!==f.factory||m.chainId!==f.chainId)throw Error('Manifest differs from authorized record.');}
 return f;
}
export function encodeEvmRecord(f){
 authorizationTypedData(f);let sig=bytes(hex(f.signature,65));if([0,1].includes(sig[64])){sig=Buffer.from(sig);sig[64]+=27;}
 const b=Buffer.alloc(EVM_RECORD_BYTES);b.write('GRNE');b.writeUInt16LE(1,4);b.writeUInt32LE(f.chainId,6);bytes(f.factory).copy(b,10);bytes(f.manifestHash).copy(b,30);bytes(f.creator).copy(b,62);bytes(f.nonce).copy(b,82);b.writeBigUInt64LE(BigInt(f.expiresAt),98);sig.copy(b,106);verifyEvmRecord(b);return b;
}
export function requireCurrentAuthorization(record,now=Date.now()){const f=verifyEvmRecord(record);if(BigInt(f.expiresAt)*1000n<=BigInt(now))throw Error('Creator authorization expired before construction.');return f;}
export const encodeEvmExtra=record=>{verifyEvmRecord(record);return encodeNonce(record);};
/** Strict bounded framing; unknown tags or duplicate application records fail closed. */
export function decodeEvmExtra(extra){
 const b=Buffer.from(extra);if(b.length>1060)throw Error('Oversized extra.');const records=[];let i=0;
 function length(){if(i>=b.length)throw Error('Truncated length.');let n=b[i++];if(n<128)return n;if(i>=b.length||b[i]<1||b[i]>8)throw Error('Invalid length.');return (n&127)+128*b[i++];}
 while(i<b.length){const tag=b[i++];if(tag===0){while(b[i]===0&&i<b.length)i++;continue;}if(tag===1){if(i+32>b.length)throw Error('Truncated key.');i+=32;continue;}if(tag===4){const n=length();if(i+32*n>b.length)throw Error('Truncated keys.');i+=32*n;continue;}if(tag!==2)throw Error('Unknown extra tag.');const n=length();if(n>255||i+n>b.length)throw Error('Invalid nonce.');const body=b.subarray(i,i+n);i+=n;if(body[0]===127&&body.subarray(1,5).toString()==='GRNE'){if(records.length)throw Error('Duplicate GRNE.');verifyEvmRecord(body.subarray(1));records.push(body.subarray(1));}else if(body[0]===127&&body.subarray(1,5).toString()==='GRN1')throw Error('Mixed publication formats.');}
 return records;
}
export const EVM_PUBLICATION_CODEC=Object.freeze({verifyRecord:verifyEvmRecord,encodeExtraField:encodeEvmExtra,decodeExtraField:decodeEvmExtra});
