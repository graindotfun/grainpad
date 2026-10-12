import {validateImage} from './image-validation.mjs';
/** Bytes travel outside the signed record; the signed digest binds the exact file. */
export async function verifyRoomImage(image,base64){
 if(!image){if(base64!==undefined)throw Error('An image must be included in the signed record.');return null;}
 if(typeof base64!=='string'||base64.length>2_666_668||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))throw Error('Choose a complete PNG, JPEG or WebP below 2 MB.');
 const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
 validateImage(bytes,image.type);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==image.hash)throw Error('The image changed after signing. Review and sign again.');
 return bytes;
}
