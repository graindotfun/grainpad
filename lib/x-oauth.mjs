/** Official X OAuth 2.0 with PKCE. Tokens stay in this module and are never returned. */
import {validateImage} from './image-validation.mjs';

export const X_OAUTH_COOKIE='grainpad_x_state';
const HOSTS=new Set(['grainpad.fun','www.grainpad.fun']);
const encoder=new TextEncoder();

function base64url(bytes){
 let binary='';
 for(const byte of bytes)binary+=String.fromCharCode(byte);
 return btoa(binary).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export function xOauthConfig(env){
 const id=env?.X_CLIENT_ID,secret=env?.X_CLIENT_SECRET;
 if(!id&&!secret)return null;
 if(typeof id!=='string'||typeof secret!=='string'||!id||!secret)throw Error('X OAuth credentials are not configured together.');
 if(!/^[A-Za-z0-9_-]{10,128}$/.test(id)||secret.length<16||secret.length>256||/[\r\n\0]/.test(secret))throw Error('X OAuth credentials are not usable.');
 return {clientId:id,clientSecret:secret};
}
export function xRedirectUri(origin,configured){
 let url;
 try{url=new URL(origin);}catch{throw Error('X callback is not allowed for this origin.');}
 if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('X callback is not allowed for this origin.');
 const local=url.protocol==='http:'&&(url.hostname==='localhost'||url.hostname==='127.0.0.1');
 const prod=url.protocol==='https:'&&HOSTS.has(url.hostname)&&url.port==='';
 if(!local&&!prod)throw Error('X callback is not allowed for this origin.');
 const derived=`${url.origin}/api/identity/x/callback`;
 if(typeof configured==='string'&&configured!==''&&configured!==derived)throw Error('X callback is not allowed for this origin.');
 return derived;
}
export async function createPkce(){
 const verifier=base64url(crypto.getRandomValues(new Uint8Array(32)));
 const challenge=base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(verifier))));
 const state=base64url(crypto.getRandomValues(new Uint8Array(24)));
 return {verifier,challenge,state};
}
export function authorizationUrl({clientId,redirectUri,state,challenge}){
 const url=new URL('https://x.com/i/oauth2/authorize');
 url.searchParams.set('response_type','code');
 url.searchParams.set('client_id',clientId);
 url.searchParams.set('redirect_uri',redirectUri);
 url.searchParams.set('scope','users.read tweet.read');
 url.searchParams.set('state',state);
 url.searchParams.set('code_challenge',challenge);
 url.searchParams.set('code_challenge_method','S256');
 return url.toString();
}
export function safeXImage(value){
 if(typeof value!=='string'||value.length>400)return '';
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.hostname!=='pbs.twimg.com'||url.username||url.password||url.port)return '';
  return url.toString();
 }catch{return '';}
}
export function readCookie(header,name){
 if(typeof header!=='string')return '';
 for(const part of header.split(';')){
  const trimmed=part.trim(),eq=trimmed.indexOf('=');
  if(eq>0&&trimmed.slice(0,eq)===name)return trimmed.slice(eq+1);
 }
 return '';
}
export function oauthCookie(state,secure){return `${X_OAUTH_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=/api/identity/x; Max-Age=600${secure?'; Secure':''}`;}
export function clearOauthCookie(secure){return `${X_OAUTH_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/identity/x; Max-Age=0${secure?'; Secure':''}`;}
export async function consumeOauthState(db,state,cookieHeader,now=Date.now()){
 if(typeof state!=='string'||!/^[A-Za-z0-9_-]{20,128}$/.test(state)||readCookie(cookieHeader,X_OAUTH_COOKIE)!==state)throw Error('X connection expired. Start again.');
 const row=await db.prepare('DELETE FROM wallet_identity_oauth WHERE state=? AND expires_at>? RETURNING wallet,verifier,redirect_uri,replace').bind(state,now).first();
 if(!row?.verifier)throw Error('X connection expired. Start again.');
 return row;
}
export async function completeXAuthorization({config,code,verifier,redirectUri,fetchImpl=fetch}){
 if(!config||!/^[A-Za-z0-9._~-]{8,512}$/.test(code||'')||typeof verifier!=='string'||verifier.length<40)throw Error('X did not confirm this account.');
 let basic='';
 try{basic=btoa(`${config.clientId}:${config.clientSecret}`);}catch{throw Error('X OAuth credentials are not usable.');}
 const tokenResponse=await fetchImpl('https://api.x.com/2/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:`Basic ${basic}`},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirectUri,code_verifier:verifier,client_id:config.clientId})});
 const token=await tokenResponse.json().catch(()=>({}));
 const access=tokenResponse.ok&&typeof token.access_token==='string'?token.access_token:'';
 if(!access)throw Error('X did not confirm this account.');
 const userResponse=await fetchImpl('https://api.x.com/2/users/me?user.fields=id,name,username,profile_image_url',{headers:{Authorization:`Bearer ${access}`}});
 const user=await userResponse.json().catch(()=>({}));
 if(/suspend/i.test(JSON.stringify(user.errors||user.title||user.detail||'')))throw Error('This X account is suspended.');
 const data=user?.data;
 if(!userResponse.ok||!data||!/^\d{1,32}$/.test(String(data.id))||!/^[A-Za-z0-9_]{1,15}$/.test(data.username||''))throw Error('X did not confirm this account.');
 return {xUserId:String(data.id),xUsername:data.username,profileImageUrl:safeXImage(data.profile_image_url)};
}
export async function archiveXAvatar(url,fetchImpl=fetch){
 const safe=safeXImage(url);
 if(!safe)return null;
 const response=await fetchImpl(safe,{redirect:'manual'});
 if(!response?.ok||response.status>=300)return null;
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length<20||bytes.length>2_000_000)return null;
 const type=String(response.headers.get('content-type')||'').split(';')[0].trim();
 try{
  const image=validateImage(bytes,type);
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  return {hash,bytes,type:image.type};
 }catch{return null;}
}
