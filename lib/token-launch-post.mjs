import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {canonicalLaunchTweet} from './launch-post-link.mjs';
const FIELDS=['version','origin','mint','creator','url','baseRevision','nonce','expires'];
const ADDRESS=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function launchPostMessage(p){
 return ['Grainpad launch post · creator update',`Version: ${p.version}`,`Origin: ${p.origin}`,`Token: ${p.mint}`,`Creator: ${p.creator}`,`Launch post: ${p.url||'(remove link)'}`,`Current revision: ${p.baseRevision}`,`Nonce: ${p.nonce}`,`Expires: ${p.expires}`,'This updates the launch post link on Grainpad. It does not change token metadata or authorize a transaction.'].join('\n');
}
export function verifyLaunchPost(payload,signature,{origin,mint,creator,now=Date.now()}){
 const p=payload;
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==FIELDS.length||FIELDS.some(k=>!Object.hasOwn(p,k)))throw Error('Launch post update contains fields outside the signed schema.');
 if(p.version!==1||p.origin!==origin||p.mint!==mint||p.creator!==creator||!ADDRESS.test(mint)||!ADDRESS.test(creator))throw Error('Only the registered launch creator can update this post.');
 if(!Number.isSafeInteger(p.baseRevision)||p.baseRevision<0||p.baseRevision>=Number.MAX_SAFE_INTEGER||!Number.isSafeInteger(p.expires)||p.expires<=now||p.expires>now+600000||!/^[-a-f0-9]{36}$/.test(p.nonce)||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(p.nonce))throw Error('Launch post review expired or is invalid. Refresh and sign again.');
 if(typeof p.url!=='string'||canonicalLaunchTweet(p.url)!==p.url)throw Error('Sign the canonical launch post URL.');
 let valid=false;try{const key=bs58.decode(creator),sig=bs58.decode(signature);valid=key.length===32&&sig.length===64&&nacl.sign.detached.verify(new TextEncoder().encode(launchPostMessage(p)),sig,key);}catch{valid=false;}
 if(!valid)throw Error('The creator wallet must sign this exact launch post update.');
 return p;
}
export async function readLaunchPost(db,project){
 const row=await db.prepare('SELECT * FROM token_launch_post WHERE mint=?').bind(project.mint).first();
 if(row&&row.creator!==project.creator)throw Error('Launch post identity mismatch.');
 let initial='';try{initial=canonicalLaunchTweet(project.launchTweet);}catch{/* Invalid historical optional links are never rendered. */}
 return {mint:project.mint,creator:project.creator,url:row?canonicalLaunchTweet(row.url):initial,revision:row?.revision??0,updatedAt:row?.updated_at??null,source:row?'creator-update':initial?'launch-metadata':'none'};
}
export async function updateLaunchPost(db,project,payload,signature,origin,now=Date.now()){
 const p=verifyLaunchPost(payload,signature,{origin,mint:project.mint,creator:project.creator,now}),encoded=JSON.stringify(Object.fromEntries(FIELDS.map(k=>[k,p[k]])));
 const prior=await db.prepare('SELECT payload FROM token_launch_post_revision WHERE signature=?').bind(signature).first();
 if(prior){if(prior.payload!==encoded)throw Error('This launch post signature was already used.');return readLaunchPost(db,project);}
 const current=await readLaunchPost(db,project);if(current.revision!==p.baseRevision)throw Error('The launch post changed. Refresh and sign again.');
 const revision=p.baseRevision+1;
 try{await db.batch([
  db.prepare(`INSERT INTO token_launch_post(mint,creator,url,revision,updated_at,signature,payload)
   SELECT ?,?,?,?,?,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM token_launch_post WHERE mint=? AND revision=?)
   ON CONFLICT(mint) DO UPDATE SET url=excluded.url,revision=excluded.revision,updated_at=excluded.updated_at,signature=excluded.signature,payload=excluded.payload
   WHERE token_launch_post.creator=excluded.creator AND token_launch_post.revision=?`).bind(p.mint,p.creator,p.url,revision,now,signature,encoded,p.baseRevision,p.mint,p.baseRevision,p.baseRevision),
  // A stale/concurrent update makes this required mint NULL and rolls back the batch.
  db.prepare(`INSERT INTO token_launch_post_revision(signature,mint,creator,url,revision,nonce,updated_at,payload)
   VALUES(?,(SELECT mint FROM token_launch_post WHERE mint=? AND creator=? AND signature=? AND revision=?),?,?,?,?,?,?)`).bind(signature,p.mint,p.creator,signature,revision,p.creator,p.url,revision,p.nonce,now,encoded),
 ]);}catch(error){if(/constraint/i.test(String(error)))throw Error('The launch post changed or this update was already used. Refresh and sign again.');throw error;}
 return readLaunchPost(db,project);
}
