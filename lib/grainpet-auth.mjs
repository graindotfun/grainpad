import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {secp256k1} from '@noble/curves/secp256k1';
import {keccak_256} from '@noble/hashes/sha3';
/** grainpet identity and sign-in. One short message signed once per session: no transaction, no fee.
 *  Identity: <wallet-family>:<network-id>:<normalized-owner>. Solana mainnet and Robinhood mainnet are different grains.
 *  Nothing here keeps a server-side session table: the challenge and the session are HMAC-signed, domain-separated values derived from RPC_SESSION_SECRET. */
export const GRAINPET_COOKIE='__Host-grainpet';
export const CHALLENGE_TTL_MS=5*60_000,SESSION_TTL_MS=30*24*60*60_000;
const enc=new TextEncoder(),dec=new TextDecoder();
const NETWORKS={solana:'solana:mainnet-beta',evm:'robinhood:mainnet'};
export function canonicalIdentity({family,networkId,owner}){
 if(typeof family!=='string'||NETWORKS[family]!==networkId)throw Error('This wallet network is not supported by grainpet yet.');
 if(typeof owner!=='string')throw Error('Wallet address required.');
 if(family==='solana'){
  let raw;try{raw=bs58.decode(owner);}catch{throw Error('Invalid Solana address.');}
  if(raw.length!==32||bs58.encode(raw)!==owner)throw Error('Invalid Solana address.');
  return `solana:${networkId}:${owner}`;
 }
 if(!/^0x[0-9a-fA-F]{40}$/.test(owner))throw Error('Invalid EVM address.');
 return `evm:${networkId}:${owner.toLowerCase()}`;
}
export function parseIdentity(identity){
 if(typeof identity!=='string'||identity.length>160)throw Error('Invalid grainpet identity.');
 const m=/^(solana|evm):([a-z:-]+):([A-Za-z0-9]+)$/.exec(identity);if(!m)throw Error('Invalid grainpet identity.');
 const parsed={family:m[1],networkId:m[2],owner:m[3]};if(canonicalIdentity(parsed)!==identity)throw Error('Invalid grainpet identity.');
 return parsed;
}
const b64u=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64u=text=>{if(typeof text!=='string'||!/^[A-Za-z0-9_-]*$/.test(text))throw Error('Malformed value.');const s=text.replaceAll('-','+').replaceAll('_','/');return Uint8Array.from(atob(s+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));};
const b64=text=>{if(typeof text!=='string'||text.length>400||!/^[A-Za-z0-9+/]+=*$/.test(text))throw Error('Malformed signature.');return Uint8Array.from(atob(text),c=>c.charCodeAt(0));};
async function key(secret,label){
 if(typeof secret!=='string'||secret.length<32)throw Error('Sign-in is not configured.');
 const base=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const derived=await crypto.subtle.sign('HMAC',base,enc.encode(label));
 return crypto.subtle.importKey('raw',derived,{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function seal(secret,label,payload){
 const body=b64u(enc.encode(JSON.stringify(payload))),mac=await crypto.subtle.sign('HMAC',await key(secret,label),enc.encode(body));
 return `${body}.${b64u(new Uint8Array(mac))}`;
}
async function open(secret,label,token){
 if(typeof token!=='string'||token.length>1200)throw Error('Malformed value.');
 const [body,mac,extra]=token.split('.');if(!body||!mac||extra!==undefined)throw Error('Malformed value.');
 if(!await crypto.subtle.verify('HMAC',await key(secret,label),unb64u(mac),enc.encode(body)))throw Error('Invalid value.');
 return JSON.parse(dec.decode(unb64u(body)));
}
const iso=ms=>new Date(ms).toISOString();
export function challengeMessage({origin,identity,nonce,iat,exp}){
 return ['GRAINPET SIGN-IN V1','Sign in to save your grain. No transaction. No fee.',`Origin: ${origin}`,`Identity: ${identity}`,`Nonce: ${nonce}`,`Issued: ${iso(iat)}`,`Expires: ${iso(exp)}`].join('\n');
}
export async function issueChallenge(secret,{origin,identity,now=Date.now()}){
 parseIdentity(identity);
 const nonce=b64u(crypto.getRandomValues(new Uint8Array(16))),payload={v:1,o:origin,id:identity,n:nonce,iat:now,exp:now+CHALLENGE_TTL_MS};
 return {message:challengeMessage({origin,identity,nonce,iat:now,exp:payload.exp}),token:await seal(secret,'grainpet/challenge/v1',payload),expiresAt:payload.exp};
}
/** @returns {{identity:string,nonce:string,message:string}} after the signature has been verified against the identity's own key. */
export async function verifyChallenge(secret,{origin,token,signature,now=Date.now()}){
 let c;try{c=await open(secret,'grainpet/challenge/v1',token);}catch{throw Error('Sign-in request is invalid. Start again.');}
 if(!c||c.v!==1||c.o!==origin||typeof c.n!=='string'||!Number.isSafeInteger(c.iat)||!Number.isSafeInteger(c.exp)||c.exp<=now||c.iat>now+60_000||c.exp-c.iat!==CHALLENGE_TTL_MS)throw Error('Sign-in request expired. Start again.');
 const identity=c.id,id=parseIdentity(identity),message=challengeMessage({origin:c.o,identity,nonce:c.n,iat:c.iat,exp:c.exp}),bytes=enc.encode(message);
 let ok=false;
 if(id.family==='solana'){
  const sig=b64(signature);ok=sig.length===64&&nacl.sign.detached.verify(bytes,sig,bs58.decode(id.owner));
 }else{
  ok=typeof signature==='string'&&/^0x[0-9a-fA-F]{130}$/.test(signature)&&recoverPersonalSign(bytes,signature)===id.owner;
 }
 if(!ok)throw Error('That signature does not match the wallet.');
 return {identity,nonce:c.n,message};
}
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const fromHex=text=>Uint8Array.from(text.match(/../g)||[],h=>parseInt(h,16));
/** EIP-191 personal_sign. Contract wallets (EIP-1271) are not supported in this version. */
export function recoverPersonalSign(messageBytes,signature){
 const raw=fromHex(signature.slice(2));let v=raw[64];if(v>=27)v-=27;if(v!==0&&v!==1)return null;
 const prefix=enc.encode(`\x19Ethereum Signed Message:\n${messageBytes.length}`),all=new Uint8Array(prefix.length+messageBytes.length);all.set(prefix);all.set(messageBytes,prefix.length);
 try{
  const pub=secp256k1.Signature.fromCompact(raw.slice(0,64)).addRecoveryBit(v).recoverPublicKey(keccak_256(all)).toRawBytes(false);
  return '0x'+hex(keccak_256(pub.slice(1)).slice(-20));
 }catch{return null;}
}
export async function issueSession(secret,identity,now=Date.now()){
 parseIdentity(identity);
 const exp=now+SESSION_TTL_MS;
 return {token:await seal(secret,'grainpet/session/v1',{v:1,id:identity,iat:now,exp}),expiresAt:exp,maxAge:Math.floor(SESSION_TTL_MS/1000)};
}
/** @returns {string|null} the verified identity, or null for a missing, forged or expired cookie. */
export async function sessionIdentity(secret,cookieHeader,now=Date.now()){
 const raw=typeof cookieHeader==='string'?cookieHeader.split(/;\s*/).find(p=>p.startsWith(GRAINPET_COOKIE+'='))?.slice(GRAINPET_COOKIE.length+1):null;
 if(!raw)return null;
 try{const s=await open(secret,'grainpet/session/v1',raw);if(s?.v!==1||!Number.isSafeInteger(s.exp)||s.exp<=now)return null;parseIdentity(s.id);return s.id;}catch{return null;}
}
export const sessionCookie=(token,maxAge)=>`${GRAINPET_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
export const clearedSessionCookie=()=>`${GRAINPET_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
