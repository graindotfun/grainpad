import {contentHash} from './metadata-publication.mjs';
import {TOKEN_WEBSITE_ORIGIN} from './token-website.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const headerFields=['sha256','smallSha256','type','mint','metadataHash','imageHash','signature'];
const sealedHeader=header=>header==null?null:{...Object.fromEntries(headerFields.map(key=>[key,header[key]])),...(header.authorization!==undefined?{authorization:header.authorization}:{})};
async function bytes(object){
 if(typeof object.arrayBuffer==='function')return new Uint8Array(await object.arrayBuffer());
 if(object.body instanceof Uint8Array)return object.body;
 if(typeof object.text==='function')return new TextEncoder().encode(await object.text());
 throw Error('Stored metadata upload cannot be independently read.');
}
async function asset(storage,hash){
 const object=await storage.get(`assets/${hash}`);
 if(!object)throw Error('Stored metadata upload is incomplete; its assets must be recovered before retry.');
 if(await contentHash(await bytes(object))!==hash)throw Error('Stored metadata upload asset integrity check failed.');
}
/** Called only after fresh creator authorization and all upload/header/intent
 * checks. A completed content match performs no write or quota admission.
 * Incomplete persistence gets no retry exemption; no replica claim is cached. */
export async function completedMetadataRetry(storage,{owner,mint,publication,header,identityIntent}){
 if(publication.profile!=='http-mirror-v1')return null;
 const stored=await storage.get(`owners/${publication.metadataHash}/${owner}`);
 if(!stored)return null;
 let claim;try{claim=typeof stored.json==='function'?await stored.json():JSON.parse(new TextDecoder().decode(await bytes(stored)));}catch{throw Error('Stored metadata upload claim integrity check failed.');}
 if(!claim||claim.mint!==mint||claim.uri!==publication.uri||claim.profile!==publication.profile||claim.imageHash!==publication.imageHash||!same(claim.metadata,publication.metadata))throw Error('Stored metadata upload claim differs from its content-addressed publication.');
 await asset(storage,publication.metadataHash);await asset(storage,publication.imageHash);
 const expected=sealedHeader(header),saved=sealedHeader(claim.header);
 if((claim.header!=null&&Object.keys(claim.header).sort().join()!==[...headerFields,...(claim.header.authorization!==undefined?['authorization']:[])].sort().join())||!same(saved,expected)||!same(claim.identityIntent??null,identityIntent??null))return null;
 if(header){await asset(storage,header.sha256);await asset(storage,header.smallSha256);}
 return {uri:publication.uri,metadataHash:publication.metadataHash,image:`${TOKEN_WEBSITE_ORIGIN}/api/assets/${publication.imageHash}`};
}
