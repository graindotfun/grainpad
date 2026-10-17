import {contentHash,metadataHashFromUri} from './metadata-publication.mjs';
import {keccakHex,registrationDigest} from './chain/evm-one-approval-launch.ts';
import {decodeRegistrationEventData,EVM_REGISTRATION_AUTHORIZED_TOPIC} from './monero-evm-record.mjs';

/** Verify the exact metadata bytes against an already verified launch/Monero identity. */
export async function verifyImageMetadataBinding(network:string,token:string,launch:{name:string;symbol:string;metadataHash?:string;uri?:string},proof:{manifest?:string},metadataBytes:Uint8Array){
 if(!['mainnet-beta','robinhood:mainnet'].includes(network))throw Error('Unsupported image proof network.');
 if(metadataBytes.length>16_384)throw Error('Launch metadata exceeds its limit.');
 const document=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(metadataBytes));
 let metadataHash:string;
 if(network==='mainnet-beta'){
  metadataHash=await contentHash(metadataBytes);
  if(metadataHash!==launch.metadataHash||metadataHashFromUri(launch.uri,'https://grainpad.fun')!==metadataHash||document.grainpad?.mint!==token)throw Error('Metadata does not match this launch’s Monero commitment.');
 }else{
  const manifest=JSON.parse(proof.manifest??'null');metadataHash=keccakHex(metadataBytes);
  if(manifest.eventTopic!==EVM_REGISTRATION_AUTHORIZED_TOPIC)throw Error('This Monero record does not bind launch metadata.');
  const event=decodeRegistrationEventData(manifest.eventData);
  if(registrationDigest({chainId:4663,factory:manifest.factory,creator:manifest.creator,launchId:manifest.launchId,name:manifest.name,symbol:manifest.symbol,metadataHash,expiresAt:BigInt(event.expiresAt),sequence:event.sequence})!==event.registrationDigest.toLowerCase())throw Error('Metadata does not match this launch’s Monero commitment.');
  if(document.schema!=='grainpad.token-metadata.v1'||document.chain?.networkId!==network||document.chain.chainId!==4663||document.chain.factory!==manifest.factory||document.chain.launchId!==manifest.launchId)throw Error('Image metadata belongs to a different launch.');
 }
 if(document.name!==launch.name||document.symbol!==launch.symbol)throw Error('Image metadata identity changed.');
 return {document,metadataHash};
}
