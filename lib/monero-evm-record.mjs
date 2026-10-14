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
 const b=Buffer.from(record);
 if(b.length===EVM_RECORD_V2_BYTES&&b.subarray(0,4).toString()==='GRNE'&&b.readUInt16LE(4)===2)return verifyEvmRecordV2(b,manifest);if(b.length!==EVM_RECORD_BYTES||b.subarray(0,4).toString()!=='GRNE'||b.readUInt16LE(4)!==1)throw Error('Unsupported GRNE record.');
 const f={chainId:b.readUInt32LE(6),factory:'0x'+b.subarray(10,30).toString('hex'),manifestHash:'0x'+b.subarray(30,62).toString('hex'),creator:'0x'+b.subarray(62,82).toString('hex'),nonce:'0x'+b.subarray(82,98).toString('hex'),expiresAt:b.readBigUInt64LE(98).toString(),signature:'0x'+b.subarray(106).toString('hex')};
 const s=secp256k1.Signature.fromCompact(b.subarray(106,170));if(s.hasHighS()||![27,28].includes(b[170]))throw Error('Noncanonical EVM signature.');
 const publicKey=s.addRecoveryBit(b[170]-27).recoverPublicKey(authorizationDigest(f)).toRawBytes(false);
 const recovered='0x'+h(publicKey.subarray(1)).subarray(12).toString('hex');if(recovered!==f.creator)throw Error('Creator authorization signature mismatch.');
 if(manifest){const m=JSON.parse(canonicalManifest(manifest));if(manifestHash(m)!==f.manifestHash||m.creator!==f.creator||m.factory!==f.factory||m.chainId!==f.chainId)throw Error('Manifest differs from authorized record.');}
 return f;
}
/* ---------------------------------------------------------------------------------------------------------------
 * GRNE v2. Authorization is the creator's own finalized factory transaction (event MoneroRegistrationAuthorized),
 * not a separate signature. The canonical manifest of a v2 launch names that event: eventTopic is the event topic and
 * eventData is its 96-byte data (digest, expiresAt, sequence), so every re-read of the source re-verifies it.
 * The record alone proves nothing; it is accepted only together with a manifest re-derived from finalized chain data.
 * Layout (158 bytes): "GRNE" | u16 version=2 | u32 chainId | factory(20) | manifestHash(32) | creator(20)
 *                     | transactionHash(32) | registrationDigest(32) | u64 expiresAt | u32 sequence
 * v1 (171 bytes, signature) is unchanged and remains valid.
 * ------------------------------------------------------------------------------------------------------------- */
export const EVM_RECORD_V2_BYTES=158;
export const EVM_REGISTRATION_AUTHORIZED_TOPIC='0x'+Buffer.from(keccak_256(Buffer.from('MoneroRegistrationAuthorized(bytes32,address,bytes32,uint64,uint32)'))).toString('hex');
export const EVM_MAX_REGISTRATION_SEQUENCE=16;
/** Decode the exact 96-byte event data. Rejects anything but three canonical words. */
export function decodeRegistrationEventData(eventData){
 const d=bytes(hex(eventData,96));
 const expires=BigInt('0x'+d.subarray(32,64).toString('hex')),sequence=BigInt('0x'+d.subarray(64,96).toString('hex'));
 if(expires<=0n||expires>0xffffffffffffffffn)throw Error('Invalid registration expiry.');
 if(sequence>BigInt(EVM_MAX_REGISTRATION_SEQUENCE))throw Error('Invalid registration sequence.');
 const digest='0x'+d.subarray(0,32).toString('hex');if(/^0x0{64}$/.test(digest))throw Error('Empty registration digest.');
 return {registrationDigest:digest,expiresAt:expires.toString(),sequence:Number(sequence)};
}
export function encodeEvmRecordV2(f){
 authorizationChain(f.chainId);
 const expires=BigInt(f.expiresAt);if(expires<=0n||expires>0xffffffffffffffffn)throw Error('Invalid expiry.');
 if(!Number.isInteger(f.sequence)||f.sequence<0||f.sequence>EVM_MAX_REGISTRATION_SEQUENCE)throw Error('Invalid registration sequence.');
 const b=Buffer.alloc(EVM_RECORD_V2_BYTES);
 b.write('GRNE');b.writeUInt16LE(2,4);b.writeUInt32LE(f.chainId,6);bytes(evmAddress(f.factory)).copy(b,10);bytes(hex(f.manifestHash,32)).copy(b,30);bytes(evmAddress(f.creator)).copy(b,62);
 bytes(hex(f.transactionHash,32)).copy(b,82);bytes(hex(f.registrationDigest,32)).copy(b,114);b.writeBigUInt64LE(expires,146);b.writeUInt32LE(f.sequence,154);
 return b;
}
function authorizationChain(chainId){if(!Number.isSafeInteger(chainId)||chainId<1||chainId>0xffffffff)throw Error('Unsupported authorization chain.');}
function decodeEvmRecordV2(record){
 const b=Buffer.from(record);
 if(b.length!==EVM_RECORD_V2_BYTES||b.subarray(0,4).toString()!=='GRNE'||b.readUInt16LE(4)!==2)throw Error('Unsupported GRNE record.');
 return {version:2,chainId:b.readUInt32LE(6),factory:'0x'+b.subarray(10,30).toString('hex'),manifestHash:'0x'+b.subarray(30,62).toString('hex'),creator:'0x'+b.subarray(62,82).toString('hex'),
  transactionHash:'0x'+b.subarray(82,114).toString('hex'),registrationDigest:'0x'+b.subarray(114,146).toString('hex'),expiresAt:b.readBigUInt64LE(146).toString(),sequence:b.readUInt32LE(154)};
}
function verifyEvmRecordV2(record,manifest){
 const f=decodeEvmRecordV2(record);authorizationChain(f.chainId);
 if(/^0x0{64}$/.test(f.registrationDigest)||BigInt(f.expiresAt)===0n||f.sequence>EVM_MAX_REGISTRATION_SEQUENCE)throw Error('Invalid GRNE v2 record.');
 if(manifest){
  const m=JSON.parse(canonicalManifest(manifest)),event=decodeRegistrationEventData(m.eventData);
  if(m.eventTopic!==EVM_REGISTRATION_AUTHORIZED_TOPIC)throw Error('Manifest is not a v2 registration authorization.');
  const same=(a,b)=>{if(String(a).toLowerCase()!==String(b).toLowerCase())throw Error('Manifest differs from authorized record.');};
  same(manifestHash(m),f.manifestHash);same(m.creator,f.creator);same(m.factory,f.factory);same(m.transactionHash,f.transactionHash);
  if(m.chainId!==f.chainId)throw Error('Manifest differs from authorized record.');
  same(event.registrationDigest,f.registrationDigest);if(event.expiresAt!==f.expiresAt||event.sequence!==f.sequence)throw Error('Manifest differs from authorized record.');
 }
 return f;
}
/** Deterministic: anyone with the finalized source can recompute these exact bytes. Throws for a v1 manifest. */
export function recordFromV2Manifest(manifest){
 const m=JSON.parse(canonicalManifest(manifest));
 if(m.eventTopic!==EVM_REGISTRATION_AUTHORIZED_TOPIC)throw Error('Manifest is not a v2 registration authorization.');
 const event=decodeRegistrationEventData(m.eventData);
 const record=encodeEvmRecordV2({chainId:m.chainId,factory:m.factory,manifestHash:manifestHash(m),creator:m.creator,transactionHash:m.transactionHash,...event});
 verifyEvmRecordV2(record,m);return record;
}
export const isV2Manifest=m=>{try{return JSON.parse(canonicalManifest(m)).eventTopic===EVM_REGISTRATION_AUTHORIZED_TOPIC;}catch{return false;}};

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
