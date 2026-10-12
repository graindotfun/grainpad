const encoder=new TextEncoder();
async function key(secret){if(typeof secret!=='string'||secret.length<32)throw Error('RPC session protection is not configured.');return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
function hex(bytes){return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');}
export async function issueRpcSession(secret,ip,now=Date.now()){
 const expires=now+600_000,payload=`${expires}.${crypto.randomUUID()}`;
 return `${payload}.${hex(await crypto.subtle.sign('HMAC',await key(secret),encoder.encode(payload+'|'+ip)))}`;
}
export async function verifyRpcSession(secret,ip,token,now=Date.now()){
 if(typeof token!=='string'||!/^\d{13}\.[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(token))throw Error('RPC session required.');
 const [expires,nonce,mac]=token.split('.');
 if(Number(expires)<=now||Number(expires)>now+600_000)throw Error('RPC session expired.');
 const signature=Uint8Array.from(mac.match(/../g),x=>parseInt(x,16));
 if(!await crypto.subtle.verify('HMAC',await key(secret),signature,encoder.encode(`${expires}.${nonce}|${ip}`)))throw Error('RPC session invalid.');
}
