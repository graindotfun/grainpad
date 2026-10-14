import {describeRobinhoodReceipt,fetchRobinhoodReceipt,type RobinhoodLaunchRecord} from './robinhood-registration.ts';
import {LAUNCH_CREATED_TOPIC} from './robinhood-create.ts';
import {canonicalManifest} from '../monero-evm-record.mjs';

export async function boundedSourceFetch(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1]){
 const response=await fetch(input,{...init,redirect:'manual',signal:AbortSignal.timeout(8000)});
 if(response.status>=300&&response.status<400)throw Error('Source redirect refused.');
 if(!response.ok)return response;
 const reader=response.body?.getReader();if(!reader)throw Error('Empty source response.');const chunks:Uint8Array[]=[];let count=0;
 try{for(;;){const part=await reader.read();if(part.done)break;count+=part.value.length;if(count>262144)throw Error('Source response exceeds bound.');chunks.push(part.value);}}
 catch(e){await reader.cancel();throw e;}
 const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new Response(bytes,{status:response.status});
}
/** Always re-read the source. Stored registration is an identity constraint, not chain evidence. */
export async function readRobinhoodProvenance(record:RobinhoodLaunchRecord,read=(hash:string)=>fetchRobinhoodReceipt(hash,boundedSourceFetch)){
 const receipt=await read(record.transactionHash) as {blockNumber:string;blockHash:string;logs:Array<{address:string;topics:string[];data:string;logIndex:string;removed?:boolean}>};
 const current=describeRobinhoodReceipt(receipt,record.factory,record.transactionHash);
 for(const key of ['networkId','chainId','factory','tokenAddress','creator','launchId','transactionHash','name','symbol'] as const)if(current[key]!==record[key])throw Error('Canonical source identity changed.');
 const logs=receipt.logs.filter(l=>l.address.toLowerCase()===record.factory&&l.topics[0]?.toLowerCase()===LAUNCH_CREATED_TOPIC);
 if(logs.length!==1||logs[0].removed===true||!/^0x[0-9a-f]+$/i.test(logs[0].logIndex)||!/^0x[0-9a-f]+$/i.test(receipt.blockNumber)||!/^0x[0-9a-f]{64}$/i.test(receipt.blockHash))throw Error('Canonical source log unavailable.');
 return JSON.parse(canonicalManifest({schema:'grainpad.evm-launch.v1',networkId:record.networkId,chainId:record.chainId,factory:record.factory,tokenAddress:record.tokenAddress,creator:record.creator,launchId:record.launchId,transactionHash:record.transactionHash,blockNumber:BigInt(receipt.blockNumber).toString(),blockHash:receipt.blockHash.toLowerCase(),logIndex:BigInt(logs[0].logIndex).toString(),eventTopic:LAUNCH_CREATED_TOPIC,eventData:logs[0].data.toLowerCase(),name:record.name,symbol:record.symbol}));
}
