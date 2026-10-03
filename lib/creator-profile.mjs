import {canonicalTokenWebsite} from './token-website.mjs';

/** Off-chain creator display. Never overwrites the indexed launch record. */
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {metadataLink,assertMetadataText} from './metadata-shared.ts';
import {validateImage} from './image-validation.mjs';

const FIELDS=['origin','mint','signer','description','website','twitter','telegram','bannerHash','expires'];
export function profileMessage(p){
 return ['Grainpad creator profile · off-chain update',`Origin: ${p.origin}`,`Token: ${p.mint}`,`Signer: ${p.signer}`,`Description: ${p.description}`,`Website: ${p.website}`,`X: ${p.twitter}`,`Telegram: ${p.telegram}`,`Banner: ${p.bannerHash}`,`Expires: ${p.expires}`,'This updates the Grainpad display only. It does not change on-chain metadata or authorize a transaction.'].join('\n');
}
export function validateProfilePayload(p,origin,mint,now=Date.now()){
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==FIELDS.length||FIELDS.some(key=>!Object.hasOwn(p,key)))throw Error('Profile update contains fields outside the signed schema.');
 const address=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
 if(p.origin!==origin||p.mint!==mint||!address.test(p.signer)||!address.test(mint))throw Error('Invalid profile identity.');
 if(!Number.isSafeInteger(p.expires)||p.expires<=now||p.expires>now+10*60*1000)throw Error('Profile signature expired. Review and sign again.');
 if(typeof p.description!=='string'||p.description.length>1000)throw Error('Description is too long.');
 assertMetadataText({name:'Token',symbol:'T',description:p.description});
 if(typeof p.website!=='string'||typeof p.twitter!=='string'||typeof p.telegram!=='string'||typeof p.bannerHash!=='string')throw Error('Invalid profile links.');
 const website=metadataLink(p.website,'website'),twitter=metadataLink(p.twitter,'twitter'),telegram=metadataLink(p.telegram,'telegram');
 if(p.website!==website||p.twitter!==twitter||p.telegram!==telegram)throw Error('Sign the normalized profile links.');
 if(p.bannerHash!==''&&!/^[a-f0-9]{64}$/.test(p.bannerHash))throw Error('Invalid banner hash.');
 return p;
}
export function verifyProfileSignature(payload,signature,origin,mint,now=Date.now()){
 const p=validateProfilePayload(payload,origin,mint,now);
 let valid=false;
 try{const key=bs58.decode(p.signer),sig=bs58.decode(signature);valid=key.length===32&&sig.length===64&&nacl.sign.detached.verify(new TextEncoder().encode(profileMessage(p)),sig,key);}catch{valid=false;}
 if(!valid)throw Error('The creator wallet must sign this exact profile update.');
 return p;
}
export async function publishCreatorProfile(db,storage,payload,signature,creator,imageBytes,origin,now=Date.now()){
 if(payload.signer!==creator)throw Error('Only the launch creator can update this profile.');
 const hash=payload.bannerHash;
 let banner='';
 if(hash){
  if(!(imageBytes instanceof Uint8Array)||imageBytes.length<20)throw Error('Attach the banner image that matches the signed hash.');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',imageBytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==hash)throw Error('Banner bytes do not match the signed hash.');
  const claimed=imageBytes[0]===0x89?'image/png':imageBytes[0]===0xff?'image/jpeg':String.fromCharCode(...imageBytes.subarray(0,4))==='RIFF'?'image/webp':'';
  if(!claimed)throw Error('Unsupported banner.');
  const {type}=validateImage(imageBytes,claimed);
  banner=`${origin}/api/assets/${hash}`;
  if(storage&&!(await storage.head(`assets/${hash}`)))await storage.put(`assets/${hash}`,imageBytes,{httpMetadata:{contentType:type,cacheControl:'public, max-age=31536000, immutable'}});
 }
 const stored=JSON.stringify({signed:payload,banner,signer:payload.signer,updatedAt:now});
 await db.batch([
  db.prepare(`INSERT INTO creator_profile_revision(id,mint,signer,updated_at,signature,payload) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(signature,payload.mint,payload.signer,now,signature,stored),
  db.prepare(`INSERT INTO creator_profile(mint,signer,updated_at,signature,payload) VALUES(?,?,?,?,?) ON CONFLICT(mint) DO UPDATE SET signer=excluded.signer,updated_at=excluded.updated_at,signature=excluded.signature,payload=excluded.payload`).bind(payload.mint,payload.signer,now,signature,stored),
 ]);
 return JSON.parse(stored);
}
export async function readCreatorProfile(db,mint){
 const current=await db.prepare('SELECT payload FROM creator_profile WHERE mint=?').bind(mint).first();
 const revisions=await db.prepare('SELECT signer,updated_at,signature FROM creator_profile_revision WHERE mint=? ORDER BY updated_at,id').bind(mint).all();
 return {current:current?JSON.parse(current.payload):null,revisions:revisions.results||[]};
}
export function profileView(launch,stored){
 const signed=stored?.signed||null;
 return {
  launch:{name:launch.name,symbol:launch.symbol,image:launch.image,description:launch.description||'',website:canonicalTokenWebsite(launch.mint),twitter:launch.twitter||'',telegram:launch.telegram||'',creator:launch.creator,createdAt:launch.createdAt},
  update:signed?{description:signed.description,website:signed.website,twitter:signed.twitter,telegram:signed.telegram,banner:stored.banner||'',signer:stored.signer,updatedAt:stored.updatedAt}:null,
  revisions:stored?.revisions||[],
  notice:'LAUNCH IDENTITY is the Grainpad record sealed from the confirmed launch. PROJECT PROFILE is a later signed display edit and does not change launch identity. This does not prove on-chain metadata is immutable. Third parties may show different profile data.',
 };
}
