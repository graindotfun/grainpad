/** Optional Grainpad identity for a wallet. Not the per-mint creator_profile token overlay. */
import {OFFICIAL_PROFILE_WALLET} from './official-profile.mjs';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {validateImage} from './image-validation.mjs';
import {PLATFORM_SETTINGS} from './platform-settings.mjs';

const ADDRESS=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const INVISIBLE=/[\u061C\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/u;
const PROFILE_FIELDS=['origin','wallet','action','username','displayName','bio','avatarHash','baseUpdatedAt','nonce','expires'];
const CONNECT_FIELDS=['origin','wallet','replace','nonce','expires'];
const ACTIONS=['claim','update','rename','disconnect-x'];
const RESERVED=new Set(['grainpad','grain','grainxmr','admin','administrator','support','system','official','team','mod','moderator','help','security','root','null','undefined','wallet','creator','rooms','room','launch','token','twitter','staff','owner','api','www','about','docs','fees','treasury','rewards','markets','platform','lab','transparency','roadmap','u','me','you','everyone','here','channel','internal','oauth','callback','verified','crew','receipt','proof','identity','grainpadfun']);
/** Brand names reserved from everyone except the Grainpad admin wallet. Exact spelling only: look-alikes stay reserved. */
const BRAND_NAMES=new Set(['grainpad','grain','grainxmr','grainpadfun']);
// The owner transferred only the official public profile to this DEV wallet.
// This grants no platform-admin or transaction authority.
const SKELETON={'0':'o','1':'l','3':'e','4':'a','5':'s','7':'t',i:'l',l:'l'};
const encoder=new TextEncoder();

export function usernameSkeleton(name){
 const folded=name.toLowerCase().replace(/_/g,'').replace(/(.)\1+/g,'$1');
 return [...folded].map(ch=>SKELETON[ch]||ch).join('');
}
/** @param {unknown} input @param {{wallet?:string}} [options] The platform admin wallet may claim the exact brand names. */
export function normalizeUsername(input,options={}){
 if(typeof input!=='string')throw Error('Enter a username.');
 const trimmed=input.trim(),normalized=trimmed.normalize('NFKC');
 if(normalized!==trimmed||INVISIBLE.test(normalized)||/[\u0000-\u001F\u007F-\u009F]/.test(normalized))throw Error('Username contains characters that are not allowed.');
 if(!/^[a-z0-9_]{3,20}$/.test(normalized)||normalized.startsWith('_')||normalized.endsWith('_')||normalized.includes('__'))throw Error('Usernames are 3–20 characters: lowercase letters, numbers and single underscores.');
 const skeleton=usernameSkeleton(normalized);
 const brandOwner=BRAND_NAMES.has(normalized)&&(options.wallet===PLATFORM_SETTINGS.admin||(normalized==='grainpad'&&options.wallet===OFFICIAL_PROFILE_WALLET));
 if(!brandOwner&&(skeleton.length<3||RESERVED.has(normalized)||[...RESERVED].some(name=>usernameSkeleton(name)===skeleton)))throw Error('That username is reserved.');
 return {username:normalized,skeleton};
}
export function lookupUsername(input){
 if(typeof input!=='string')return null;
 const key=input.trim().toLowerCase();
 // A public lookup may name a brand username; whether it exists is decided by the database, not by this check.
 if(BRAND_NAMES.has(key))return key;
 try{return normalizeUsername(key).username;}catch{return null;}
}
function plain(value,label,{max,newlines,required}){
 if(typeof value!=='string')throw Error(`Invalid ${label}.`);
 const text=value.normalize('NFKC');
 if(text!==value||text.trim()!==text)throw Error(`${label} contains characters that are not allowed.`);
 if(INVISIBLE.test(text)||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(text)||/[<>]/.test(text)||/javascript:|data:/i.test(text))throw Error(`${label} contains characters that are not allowed.`);
 if(!newlines&&/[\r\n]/.test(text))throw Error(`${label} must be one line.`);
 if(newlines&&(text.includes('\r')||(text.match(/\n/g)||[]).length>6))throw Error(`${label} has too many lines.`);
 if(text.length>max||(required&&!text.length))throw Error(text.length>max?`${label} is too long.`:`Enter a ${label.toLowerCase()}.`);
 return text;
}
function exact(value,fields){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key)))throw Error('Identity update contains fields outside the signed schema.');
}
function window(expires,now){if(!Number.isSafeInteger(expires)||expires<=now||expires>now+10*60*1000)throw Error('Identity signature expired. Review and sign again.');}
export function identityMessage(p){
 return ['Grainpad identity · public profile',`Origin: ${p.origin}`,`Wallet: ${p.wallet}`,`Action: ${p.action}`,`Username: ${p.username}`,`Display name: ${p.displayName}`,`Bio: ${p.bio}`,`Avatar: ${p.avatarHash}`,`Base updated: ${p.baseUpdatedAt}`,`Nonce: ${p.nonce}`,`Expires: ${p.expires}`,'This publishes an optional public identity. It does not authorize a transaction.'].join('\n');
}
export function connectXMessage(p){
 return ['Grainpad identity · connect X',`Origin: ${p.origin}`,`Wallet: ${p.wallet}`,`Replace: ${p.replace}`,`Nonce: ${p.nonce}`,`Expires: ${p.expires}`,'This connects an optional X account. It does not authorize a transaction.'].join('\n');
}
function verify(message,signature,wallet){
 let valid=false;
 try{const key=bs58.decode(wallet),sig=bs58.decode(signature);valid=key.length===32&&sig.length===64&&nacl.sign.detached.verify(encoder.encode(message),sig,key);}catch{valid=false;}
 if(!valid)throw Error('The wallet must sign this exact identity update.');
}
export function canonicalPayload(p){return JSON.stringify(Object.fromEntries(Object.keys(p).sort().map(key=>[key,p[key]])));}
export function validateIdentityPayload(p,origin,now=Date.now()){
 exact(p,PROFILE_FIELDS);
 if(p.origin!==origin||!ADDRESS.test(p.wallet)||!ACTIONS.includes(p.action)||!UUID.test(p.nonce))throw Error('Invalid identity.');
 window(p.expires,now);
 const name=normalizeUsername(p.username,{wallet:p.wallet});
 if(!Number.isSafeInteger(p.baseUpdatedAt)||p.baseUpdatedAt<0||(p.action==='claim'&&p.baseUpdatedAt!==0))throw Error('Invalid identity.');
 if(p.username!==name.username)throw Error('Sign the normalized username.');
 plain(p.displayName,'Display name',{max:40,newlines:false,required:true});
 plain(p.bio,'Bio',{max:280,newlines:true,required:false});
 if(typeof p.avatarHash!=='string'||(p.avatarHash!==''&&!/^[a-f0-9]{64}$/.test(p.avatarHash)))throw Error('Invalid avatar.');
 return {...p,skeleton:name.skeleton};
}
export function validateConnectXPayload(p,origin,now=Date.now()){
 exact(p,CONNECT_FIELDS);
 if(p.origin!==origin||!ADDRESS.test(p.wallet)||(p.replace!=='yes'&&p.replace!=='no')||!UUID.test(p.nonce))throw Error('Invalid X connection.');
 window(p.expires,now);
 return p;
}
export function verifyIdentitySignature(payload,signature,origin,now=Date.now()){
 const p=validateIdentityPayload(payload,origin,now);
 verify(identityMessage(p),signature,p.wallet);
 return p;
}
export function verifyConnectXSignature(payload,signature,origin,now=Date.now()){
 const p=validateConnectXPayload(payload,origin,now);
 verify(connectXMessage(p),signature,p.wallet);
 return p;
}
/** Reject a wallet that was not the key which signed the payload. */
export function assertSignedWallet(body){
 if(!body||typeof body!=='object'||!body.payload||typeof body.payload!=='object')throw Error('Identity update is incomplete.');
 if(Object.hasOwn(body,'wallet')&&body.wallet!==body.payload.wallet)throw Error('Wallet does not match the signed proof.');
}
export function safeAvatarPath(value){return typeof value==='string'&&/^\/api\/assets\/[a-f0-9]{64}$/.test(value)?value:null;}
export function publicCard(row){
 if(!row)return null;
 const custom=row.avatar_hash||'',hash=custom||row.x_avatar_hash||'';
 return {wallet:row.wallet,username:row.username,displayName:row.display_name,avatar:hash?`/api/assets/${hash}`:null,avatarHash:custom,xVerified:Boolean(row.x_user_id&&row.x_verified_at),xUsername:row.x_username||null};
}
export function publicProfile(row){
 const card=publicCard(row);
 return {...card,bio:row.bio,xAccount:row.x_username||null,xUserId:row.x_user_id||null,xAvatar:row.x_avatar_hash?`/api/assets/${row.x_avatar_hash}`:null,xVerifiedAt:row.x_verified_at||null,createdAt:row.created_at,updatedAt:row.updated_at};
}
function constraint(error){
 const message=String(error?.message||error);
 if(!/constraint/i.test(message))throw error;
 if(/x_user_id/.test(message))throw Error('That X account is already connected to a Grainpad wallet.');
 if(/wallet_identity\.wallet/.test(message))throw Error('This wallet already has a Grainpad identity.');
 if(/wallet_identity_revision/.test(message))throw Error('The profile changed. Review and sign again.');
 throw Error('That username is taken.');
}
async function commit(db,statements){
 if(typeof db.batch!=='function')throw Error('Identity storage is unavailable.');
 try{await db.batch(statements);}catch(error){constraint(error);}
}
async function replay(db,signature,payload){
 const prior=await db.prepare('SELECT wallet,payload FROM wallet_identity_revision WHERE id=?').bind(signature).first();
 if(!prior)return null;
 if(prior.payload!==canonicalPayload(payload))throw Error('This signature was already used.');
 const row=await db.prepare('SELECT * FROM wallet_identity WHERE wallet=?').bind(prior.wallet).first();
 if(!row)throw Error('This signature was already used.');
 return publicProfile(row);
}
async function avatarBytes(hash,imageBytes){
 if(!hash)return null;
 if(!(imageBytes instanceof Uint8Array)||imageBytes.length<20)throw Error('Attach the avatar image that matches the signed hash.');
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',imageBytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==hash)throw Error('Avatar bytes do not match the signed hash.');
 const claimed=imageBytes[0]===0x89?'image/png':imageBytes[0]===0xff?'image/jpeg':String.fromCharCode(...imageBytes.subarray(0,4))==='RIFF'?'image/webp':'';
 if(!claimed)throw Error('Unsupported avatar.');
 return validateImage(imageBytes,claimed);
}
async function storeAvatar(storage,hash,imageBytes,type){
 if(!hash||!storage)return;
 if(!(await storage.head(`assets/${hash}`)))await storage.put(`assets/${hash}`,imageBytes,{httpMetadata:{contentType:type,cacheControl:'public, max-age=31536000, immutable'}});
}
export async function applyIdentity(db,storage,payload,signature,imageBytes,origin,now=Date.now()){
 const p=verifyIdentitySignature(payload,signature,origin,now),stored=canonicalPayload(p),seen=await replay(db,signature,p);
 if(seen)return seen;
 const current=await db.prepare('SELECT * FROM wallet_identity WHERE wallet=?').bind(p.wallet).first();
 const image=p.avatarHash&&p.avatarHash!==current?.avatar_hash?await avatarBytes(p.avatarHash,imageBytes):null;
 // A new write must move updated_at forward so a second signature of the same millisecond cannot match the stale base.
 const stamp=p.action==='claim'?now:Math.max(now,Number(p.baseUpdatedAt)+1);
 if(p.action==='claim'){
  if(current)throw Error('This wallet already has a Grainpad identity.');
  await commit(db,[
   db.prepare('INSERT INTO wallet_identity_name(username,skeleton,wallet,current,claimed_at) VALUES(?,?,?,1,?)').bind(p.username,p.skeleton,p.wallet,stamp),
   db.prepare(`INSERT INTO wallet_identity(wallet,username,display_name,avatar_hash,bio,x_user_id,x_username,x_avatar_hash,x_verified_at,created_at,updated_at,signature,payload) VALUES(?,?,?,?,?,'','','',NULL,?,?,?,?)`).bind(p.wallet,p.username,p.displayName,p.avatarHash,p.bio,stamp,stamp,signature,stored),
   db.prepare(`INSERT INTO wallet_identity_revision(id,wallet,action,created_at,payload) VALUES(?,(SELECT wallet FROM wallet_identity WHERE wallet=? AND username=? AND signature=? AND updated_at=?),'claim',?,?)`).bind(signature,p.wallet,p.username,signature,stamp,stamp,stored),
  ]);
 }else if(p.action==='update'||p.action==='disconnect-x'){
  if(!current||current.username!==p.username)throw Error('Sign the current username. Choose rename to change it.');
  if(Number(current.updated_at)!==p.baseUpdatedAt)throw Error('The profile changed. Review and sign again.');
  if(p.action==='disconnect-x'&&(current.display_name!==p.displayName||current.bio!==p.bio||current.avatar_hash!==p.avatarHash))throw Error('Sign the current profile to disconnect X.');
  const update=p.action==='disconnect-x'
   ?db.prepare(`UPDATE wallet_identity SET x_user_id='',x_username='',x_avatar_hash='',x_verified_at=NULL,updated_at=?,signature=?,payload=? WHERE wallet=? AND username=? AND display_name=? AND bio=? AND avatar_hash=? AND updated_at=?`).bind(stamp,signature,stored,p.wallet,p.username,p.displayName,p.bio,p.avatarHash,p.baseUpdatedAt)
   :db.prepare('UPDATE wallet_identity SET display_name=?,bio=?,avatar_hash=?,updated_at=?,signature=?,payload=? WHERE wallet=? AND username=? AND updated_at=?').bind(p.displayName,p.bio,p.avatarHash,stamp,signature,stored,p.wallet,p.username,p.baseUpdatedAt);
  const guard=p.action==='disconnect-x'
   ?` AND display_name=? AND bio=? AND avatar_hash=? AND x_user_id='' AND x_username='' AND x_avatar_hash='' AND x_verified_at IS NULL`
   :` AND display_name=? AND bio=? AND avatar_hash=?`;
  const revision=db.prepare(`INSERT INTO wallet_identity_revision(id,wallet,action,created_at,payload) VALUES(?,(SELECT wallet FROM wallet_identity WHERE wallet=? AND username=? AND signature=? AND updated_at=?${guard}),?,?,?)`);
  const matches=[signature,p.wallet,p.username,signature,stamp];
  if(p.action==='disconnect-x'||p.action==='update')matches.push(p.displayName,p.bio,p.avatarHash);
  await commit(db,[update,revision.bind(...matches,p.action,stamp,stored)]);
 }else{
  if(!current)throw Error('Claim a username before renaming it.');
  if(current.username===p.username)throw Error('Choose update when the username stays the same.');
  if(Number(current.updated_at)!==p.baseUpdatedAt)throw Error('The profile changed. Review and sign again.');
  await commit(db,[
   db.prepare('UPDATE wallet_identity SET username=?,display_name=?,bio=?,avatar_hash=?,updated_at=?,signature=?,payload=? WHERE wallet=? AND username=? AND updated_at=?').bind(p.username,p.displayName,p.bio,p.avatarHash,stamp,signature,stored,p.wallet,current.username,p.baseUpdatedAt),
   db.prepare('INSERT INTO wallet_identity_name(username,skeleton,wallet,current,claimed_at) VALUES(?,?,?,1,?)').bind(p.username,p.skeleton,p.wallet,stamp),
   db.prepare('UPDATE wallet_identity_name SET current=0 WHERE wallet=? AND username=? AND current=1').bind(p.wallet,current.username),
   db.prepare(`INSERT INTO wallet_identity_revision(id,wallet,action,created_at,payload) VALUES(?,(SELECT wallet FROM wallet_identity WHERE wallet=? AND username=? AND signature=? AND updated_at=? AND display_name=? AND bio=? AND avatar_hash=? AND EXISTS(SELECT 1 FROM wallet_identity_name retired WHERE retired.wallet=? AND retired.username=? AND retired.current=0) AND EXISTS(SELECT 1 FROM wallet_identity_name active WHERE active.wallet=? AND active.username=? AND active.current=1 AND active.skeleton=?)),'rename',?,?)`).bind(signature,p.wallet,p.username,signature,stamp,p.displayName,p.bio,p.avatarHash,p.wallet,current.username,p.wallet,p.username,p.skeleton,stamp,stored),
  ]);
 }
 if(image)await storeAvatar(storage,p.avatarHash,imageBytes,image.type);
 const row=await db.prepare('SELECT * FROM wallet_identity WHERE wallet=?').bind(p.wallet).first();
 if(!row||row.signature!==signature||Number(row.updated_at)!==stamp)throw Error('The profile changed. Review and sign again.');
 return publicProfile(row);
}
export async function linkXAccount(db,wallet,account,{replace,now,avatarHash=''}){
 if(!ADDRESS.test(wallet)||!/^\d{1,32}$/.test(account?.xUserId)||!/^[A-Za-z0-9_]{1,15}$/.test(account?.xUsername))throw Error('X returned an unusable account.');
 const row=await db.prepare('SELECT * FROM wallet_identity WHERE wallet=?').bind(wallet).first();
 if(!row)throw Error('Claim a Grainpad username before connecting X.');
 if(row.x_user_id&&row.x_user_id!==account.xUserId&&replace!=='yes')throw Error('Disconnect the current X account before connecting a different one.');
 try{
  const stamp=Math.max(now,Number(row.updated_at)+1);
 const saved=await db.prepare(`UPDATE wallet_identity SET x_user_id=?, x_username=?, x_avatar_hash=?, x_verified_at=?, updated_at=?
   WHERE wallet=? AND updated_at=? AND NOT EXISTS(SELECT 1 FROM wallet_identity other WHERE other.x_user_id=? AND other.wallet<>?) RETURNING username`).bind(account.xUserId,account.xUsername,avatarHash||'',stamp,stamp,wallet,row.updated_at,account.xUserId,wallet).first();
  if(!saved)throw Error('That X account is already connected to a Grainpad wallet.');
  return saved.username;
 }catch(error){constraint(error);}
}
export async function identityCards(db,wallets,{limit=40}={}){
 const unique=[...new Set((wallets||[]).filter(wallet=>ADDRESS.test(wallet)))].slice(0,limit);
 if(!unique.length)return {};
 const rows=await db.prepare(`SELECT wallet,username,display_name,avatar_hash,x_user_id,x_username,x_avatar_hash,x_verified_at FROM wallet_identity WHERE wallet IN (${unique.map(()=>'?').join(',')})`).bind(...unique).all();
 return Object.fromEntries((rows.results||[]).map(row=>[row.wallet,publicCard(row)]));
}
function launchSummary(row){
 try{
  const record=JSON.parse(row.record);
  if(!record||record.mint!==row.mint||typeof record.name!=='string'||typeof record.symbol!=='string')return null;
  const image=typeof record.image==='string'&&(record.image.startsWith('https://')||record.image.startsWith('/api/assets/'))?record.image:'';
  return {mint:row.mint,name:record.name.slice(0,80),symbol:record.symbol.slice(0,20),image,createdAt:row.created_at};
 }catch{return null;}
}
/** @param {{platform?: string|null, now?: number}} [options] */
export async function readPublicIdentity(db,username,options={}){
 const platform=options.platform??null,now=options.now??Date.now();
 const key=lookupUsername(username);
 if(!key)return null;
 const name=await db.prepare('SELECT wallet,current FROM wallet_identity_name WHERE username=?').bind(key).first();
 if(!name)return null;
 const row=await db.prepare('SELECT * FROM wallet_identity WHERE wallet=?').bind(name.wallet).first();
 if(!row)return null;
 if(!name.current||row.username!==key)return {redirect:row.username};
 const launches=await db.prepare(`SELECT mint,record,created_at FROM launch_index WHERE network='mainnet-beta' AND creator=?${platform?' AND platform_id=?':''} ORDER BY created_at DESC LIMIT 12`).bind(row.wallet,...(platform?[platform]:[])).all();
 const rooms=await db.prepare(`SELECT r.id,r.mint,r.kind,r.title,r.created_at,l.record FROM room_event r LEFT JOIN launch_index l ON l.mint=r.mint AND l.network='mainnet-beta' WHERE r.author=? ORDER BY r.created_at DESC LIMIT 20`).bind(row.wallet).all();
 const created=(launches.results||[]).map(launchSummary).filter(Boolean);
 const events=(rooms.results||[]).map(event=>{const token=launchSummary({mint:event.mint,record:event.record,created_at:event.created_at});return {id:event.id,mint:event.mint,kind:event.kind,title:String(event.title||'').slice(0,100),createdAt:Number(event.created_at),tokenName:token?.name||'',symbol:token?.symbol||'',image:token?.image||''};});
 const launchEvents=created.map(token=>({id:`launch:${token.mint}`,mint:token.mint,kind:'launch',title:token.name,createdAt:Date.parse(token.createdAt),tokenName:token.name,symbol:token.symbol,image:token.image}));
 const activity=[...events,...launchEvents].sort((a,b)=>b.createdAt-a.createdAt).slice(0,32);
 const uniqueRooms=[...new Map(events.map(event=>event.mint).map(mint=>[mint,events.find(event=>event.mint===mint)])).values()];
 return {profile:publicProfile(row),created,rooms:uniqueRooms,activity,generatedAt:now};
}
