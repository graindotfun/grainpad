import {readMainnetDraft,saveMainnetDraft} from './robinhood-mainnet-draft.ts';
import {pickerNetwork,type PickerNetworkId} from './launch-network-picker.ts';
export type LaunchIdentityDraft={name:string;symbol:string;description:string;picture:string;pictureName:string;twitter:string;telegram:string;website?:string};
const tokenPattern=/^[a-f0-9-]{36}$/;
export function boundedLaunchIdentity(value:unknown):LaunchIdentityDraft {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid launch draft.');
 const v=value as Record<string,unknown>,out:Record<string,string>={};
 for(const [key,max] of Object.entries({name:128,symbol:40,description:1000,picture:2_800_000,pictureName:300,twitter:300,telegram:300,website:300})){
  if(v[key]!==undefined&&(typeof v[key]!=='string'||v[key].length>max))throw Error('Invalid '+key+' in launch draft.');out[key]=typeof v[key]==='string'?v[key]:'';
 }
 // Data URLs and immutable same-origin artwork only. Never carry wallet identities or signatures.
 if(out.picture&&!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(out.picture)&&!/^\/api\/assets\/[a-f0-9]{64}$/.test(out.picture))throw Error('Unsupported draft artwork.');
 return out as LaunchIdentityDraft;
}
/** Decode and inspect artwork before it can enter another chain's funded flow. */
export async function validateLaunchDraftArtwork(picture:string):Promise<void> {
 if(!picture||/^\/api\/assets\/[a-f0-9]{64}$/.test(picture))return;
 const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(picture);
 if(!match||match[2].length>2_666_668)throw Error('Choose a PNG, JPG or WebP below 2 MB.');
 let decoded:string;try{decoded=atob(match[2]);}catch{throw Error('Artwork could not be decoded. Choose it again.');}
 if(decoded.length>2_000_000)throw Error('Artwork is too large.');
 const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));const {validateImage}=await import('../image-validation.mjs');validateImage(bytes,match[1]);
}
export async function saveLaunchHandoff(from:PickerNetworkId,to:PickerNetworkId,identity:unknown):Promise<string> {
 if(!pickerNetwork(from)||!pickerNetwork(to))throw Error('Unknown launch network.');
 const draft=boundedLaunchIdentity(identity);
 if(draft.picture.startsWith('/api/assets/')){
  const response=await fetch(draft.picture,{credentials:'same-origin'});if(!response.ok)throw Error('Your saved artwork is unavailable. Choose it again before changing network.');
  const blob=await response.blob();if(blob.size>2_000_000)throw Error('Artwork is too large.');const bytes=new Uint8Array(await blob.arrayBuffer());const {validateImage}=await import('../image-validation.mjs');validateImage(bytes,blob.type);
  const h=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(draft.picture!=='/api/assets/'+h)throw Error('Saved artwork changed.');
  draft.picture=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Artwork could not be copied.'));reader.readAsDataURL(blob);});
 }
 await validateLaunchDraftArtwork(draft.picture);
 const token=crypto.randomUUID();await saveMainnetDraft('grainpad:network-handoff:'+token,{schema:1,from,to,identity:draft});return token;
}
export async function readLaunchHandoff(token:unknown,target:PickerNetworkId):Promise<LaunchIdentityDraft|null> {
 if(typeof token!=='string'||!tokenPattern.test(token))return null;
 const record=await readMainnetDraft('grainpad:network-handoff:'+token);
 if(!record||record.schema!==1||record.to!==target||typeof record.from!=='string'||!pickerNetwork(record.from))return null;
 const identity=boundedLaunchIdentity(record.identity);await validateLaunchDraftArtwork(identity.picture);return identity;
}
