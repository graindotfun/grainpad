import {contentHash,metadataHashFromUri} from './metadata-publication.mjs';
import {validateImage} from './image-validation.mjs';

export const IMAGE_ARCHIVE_LIMIT=2_750_000;
export const imageArchiveKey=(network,token)=>{
 if(!['mainnet-beta','robinhood:mainnet'].includes(network)||!(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token)||/^0x[0-9a-f]{40}$/.test(token)))throw Error('Invalid image archive identity.');
 return `launch-image-archives/v1/${network}/${token}`;
};
/** Local object reads only. Never dereference creator-supplied URLs or redirects. */
export async function boundedArchiveRead(store,key,max){
 const object=await store.get(key);if(!object)return null;
 if(!Number.isSafeInteger(object.size)||object.size<1||object.size>max)throw Error('Image archive object exceeds its size limit.');
 const bytes=new Uint8Array(await object.arrayBuffer());if(bytes.length!==object.size||bytes.length>max)throw Error('Image archive object length changed.');
 return bytes;
}
export function imageDigest(document){return metadataHashFromUri(document.image,'https://grainpad.fun');}
/** The caller independently verifies the metadata's launch/Monero commitment first. */
/** @param {any} store @param {any} document @param {Uint8Array|null} [archived] */
export async function verifiedImageBytes(store,document,archived=null){
 const hash=imageDigest(document);
 const bytes=archived??await boundedArchiveRead(store,'assets/'+hash,2_000_000);
 if(!bytes)throw Error('Original image bytes are not available.');
 if(!bytes.length||bytes.length>2_000_000||await contentHash(bytes)!==hash)throw Error('Original image fingerprint does not match.');
 let image=null;
 for(const type of ['image/png','image/jpeg','image/webp']){try{image=validateImage(bytes,type);break;}catch{ /* Try the other reviewed raster encodings. */ }}
 if(!image)throw Error('Original image format cannot be verified.');
 return {bytes,sha256:hash,...image};
}
export function encodeImageArchive({network,token,metadataBytes,image}){
 return new TextEncoder().encode(JSON.stringify({schema:'grainpad.launch-image-archive.v1',network,token,metadataBase64:Buffer.from(metadataBytes).toString('base64'),imageBase64:Buffer.from(image.bytes).toString('base64')}));
}
export function decodeImageArchive(bytes,network,token){
 if(bytes.length>IMAGE_ARCHIVE_LIMIT)throw Error('Image archive is too large.');
 const archive=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(archive.schema!=='grainpad.launch-image-archive.v1'||archive.network!==network||archive.token!==token)throw Error('Image archive names a different launch.');
 const decode=(value,max)=>{if(typeof value!=='string'||!value.length||value.length>max||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw Error('Invalid image archive encoding.');return new Uint8Array(Buffer.from(value,'base64'));};
 return {metadataBytes:decode(archive.metadataBase64,24_000),imageBytes:decode(archive.imageBase64,2_666_668)};
}
/** First writer wins. A conflicting stored archive is never silently replaced. */
/** @param {any} store @param {string} key @param {Uint8Array} bytes @param {AbortSignal} [signal] */
export async function retainImageArchive(store,key,bytes,signal){
 signal?.throwIfAborted();
 if(bytes.length>IMAGE_ARCHIVE_LIMIT)throw Error('Image archive is too large.');
 const before=await boundedArchiveRead(store,key,IMAGE_ARCHIVE_LIMIT);
 signal?.throwIfAborted();
 if(!before)await store.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});
 const retained=before??await boundedArchiveRead(store,key,IMAGE_ARCHIVE_LIMIT);
 if(!retained||await contentHash(retained)!==await contentHash(bytes))throw Error('Existing image archive differs. No archive was overwritten.');
}
