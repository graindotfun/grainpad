'use client';
import {useEffect,useState} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {connectXMessage,identityMessage,normalizeUsername} from '@/lib/wallet-identity.mjs';
import {UserIdentity,type IdentityCard} from './user-identity';

const X_ERRORS:Record<string,string>={
 'x-unavailable':'X connection is not configured.',
 'x-denied':'X connection was cancelled.',
 'x-failed':'X did not confirm this account. You can try again.',
 'x-suspended':'This X account is suspended.',
 'x-taken':'That X account is already connected to a Grainpad wallet.',
 'x-replace':'Disconnect the current X account before connecting a different one.',
 'x-profile':'Claim a Grainpad username before connecting X.',
 'x-callback':'X connection expired. Start again.',
};
function base64(bytes:Uint8Array){let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);}
async function signed(signMessage:(bytes:Uint8Array)=>Promise<Uint8Array>,message:string){
 const bytes=await signMessage(new TextEncoder().encode(message));
 return (await import('bs58')).default.encode(bytes);
}

/** Optional identity. It never blocks trading or room participation. */
export function ClaimIdentity({wallet,signMessage}:{wallet:string;signMessage:(bytes:Uint8Array)=>Promise<Uint8Array>}){
 const [card,setCard]=useState<IdentityCard|null>(null),[ready,setReady]=useState(false),[open,setOpen]=useState(false);
 const [username,setUsername]=useState(''),[displayName,setDisplayName]=useState(''),[bio,setBio]=useState(''),[avatarHash,setAvatarHash]=useState(''),[file,setFile]=useState<File|null>(null);
 const [xOn,setXOn]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(()=>typeof window==='undefined'?'':X_ERRORS[new URLSearchParams(window.location.search).get('identity')||'']||''),[message,setMessage]=useState(()=>typeof window==='undefined'?'':new URLSearchParams(window.location.search).get('x')==='connected'?'X connected.':'');
 useEffect(()=>{const c=new AbortController();Promise.all([
  fetch(`/api/identity/resolve?wallets=${encodeURIComponent(wallet)}`,{signal:c.signal,cache:'no-store'}).then(r=>r.json()),
  fetch('/api/identity/x/status',{signal:c.signal,cache:'no-store'}).then(r=>r.json()),
 ]).then(async([resolved,status])=>{const cards=resolved as {identities?:Record<string,IdentityCard&{avatarHash?:string}>};const flags=status as {configured?:boolean};const next=cards.identities?.[wallet];if(next?.username){const full=await fetch(`/api/identity/u/${next.username}`,{signal:c.signal,cache:'no-store'}).then(r=>r.json()) as {profile?:{bio?:string}};setBio(typeof full.profile?.bio==='string'?full.profile.bio:'');}setCard(next||null);setUsername(next?.username||'');setDisplayName(next?.displayName||'');setAvatarHash(next?.avatarHash||'');setXOn(Boolean(flags.configured));setOpen(!next);setReady(true);}).catch(()=>setReady(true));
  return ()=>c.abort();},[wallet]);
 async function avatar(){
  if(!file)return {hash:avatarHash,base64:''};
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.length>2_000_000)throw Error('Upload a complete image below 2 MB.');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  return {hash,base64:base64(bytes)};
 }
 async function save(action:'claim'|'update'|'rename'|'disconnect-x'){
  setBusy('Review the identity message in your wallet');setError('');setMessage('');
  try{
   const name=action==='disconnect-x'?card?.username||'':normalizeUsername(username.trim().toLowerCase()).username;
   const nextAction=action==='disconnect-x'?'disconnect-x':!card?'claim':name===card.username?'update':'rename';
   const image=nextAction==='disconnect-x'?{hash:avatarHash,base64:''}:await avatar();
   const payload={origin:window.location.origin,wallet,action:nextAction,username:name,displayName:(nextAction==='disconnect-x'?card?.displayName:displayName.trim())||'',bio,avatarHash:image.hash,nonce:crypto.randomUUID(),expires:Date.now()+10*60*1000};
   const signature=await signed(signMessage,identityMessage(payload));
   const response=await fetch('/api/identity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature,...(image.base64?{avatarBase64:image.base64}:{})})});
   const result=await response.json() as {error?:string;profile?:IdentityCard&{bio?:string}};
   if(!response.ok)throw Error(result.error||'Identity update failed.');
   setCard(result.profile||null);setUsername(result.profile?.username||'');setDisplayName(result.profile?.displayName||'');setFile(null);setOpen(false);setMessage(nextAction==='disconnect-x'?'X disconnected.':nextAction==='claim'?'Identity claimed.':'Identity saved.');
  }catch(e){setError(e instanceof Error?e.message:'Identity update failed.');}finally{setBusy('');}
 }
 async function connectX(replace:boolean){
  setBusy('Review the X connection in your wallet');setError('');
  try{
   const payload={origin:window.location.origin,wallet,replace:replace?'yes':'no',nonce:crypto.randomUUID(),expires:Date.now()+10*60*1000};
   const signature=await signed(signMessage,connectXMessage(payload));
   const response=await fetch('/api/identity/x/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature})});
   const result=await response.json() as {error?:string;url?:string};
   if(!response.ok||!result.url)throw Error(result.error||'X connection is not configured.');
   window.location.assign(result.url);
  }catch(e){setError(e instanceof Error?e.message:'X connection failed.');setBusy('');}
 }
 if(!ready)return null;
 if(card&&!open)return <section className="identity-claim is-quiet"><UserIdentity wallet={wallet} identity={card}/><button type="button" className="product-text-button" onClick={()=>setOpen(true)}>Edit identity</button>{message&&<p className="small">{message}</p>}</section>;
 return <section className="identity-claim"><div><p className="eyebrow">OPTIONAL</p><h2>{card?'Your Grainpad identity':'Claim your Grainpad identity'}</h2><p className="small muted">A username is optional. Trading and rooms keep working with your wallet alone. Your username, display name, avatar, bio and a verified X account are public. The wallet address stays visible.</p></div>
  {card&&<UserIdentity wallet={wallet} identity={card}/>}
  <label>Username<Input value={username} maxLength={20} autoCapitalize="none" spellCheck={false} disabled={!!busy} onChange={e=>setUsername(e.target.value.toLowerCase())} placeholder="lowercase name"/></label>
  <label>Display name<Input value={displayName} maxLength={40} disabled={!!busy} onChange={e=>setDisplayName(e.target.value)}/></label>
  <label>Avatar<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!busy} onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
  <label>Bio<textarea className="identity-bio" maxLength={280} value={bio} disabled={!!busy} onChange={e=>setBio(e.target.value)} placeholder="Optional"/></label>
  <div className="product-actions"><Button type="button" disabled={!!busy} onClick={()=>void save(card?'update':'claim')}>{busy||(card?'Save identity':'Claim username')}</Button>
   {xOn&&card&&!card.xVerified&&<Button type="button" variant="outline" disabled={!!busy} onClick={()=>void connectX(false)}>Connect X</Button>}
   {xOn&&card?.xVerified&&<Button type="button" variant="outline" disabled={!!busy} onClick={()=>void save('disconnect-x')}>Disconnect X</Button>}
   {xOn&&card?.xVerified&&<Button type="button" variant="outline" disabled={!!busy} onClick={()=>void connectX(true)}>Reconnect X</Button>}
   {card&&<button type="button" className="product-text-button" disabled={!!busy} onClick={()=>setOpen(false)}>Close</button>}
  </div>
  {!xOn&&<p className="small muted">X connection is not configured. The rest of Grainpad still works.</p>}
  {error&&<p className="feedback error" role="alert">{error}</p>}{message&&<p className="small">{message}</p>}
 </section>;
}
