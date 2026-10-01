'use client';
import {useSharedWallet} from '@/components/use-shared-wallet';
import {useEffect,useRef,useState} from 'react';
import {WalletAvailability} from './wallet-availability';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {walletProviders,watchWalletIdentity,type Wallet} from '@/lib/wallet';
import {metadataLink} from '@/lib/metadata-shared';
import {profileMessage} from '@/lib/creator-profile.mjs';
type Launch={name:string;symbol:string;image:string;description:string;website:string;twitter:string;telegram:string;creator:string;createdAt:string};
type Update={description:string;website:string;twitter:string;telegram:string;banner:string;signer:string;updatedAt:number}|null;
type View={launch:Launch;update:Update;notice:string};
export function CreatorProfile({mint}:{mint:string}){
 const selected=useRef<Wallet|null>(null),cleanup=useRef<(()=>void)|null>(null),[choices,setChoices]=useState<ReturnType<typeof walletProviders>>([]);
 useEffect(()=>()=>cleanup.current?.(),[]);
 const [data,setData]=useState<View|null>(null),[error,setError]=useState(''),[owner,setOwner]=useState(''),[busy,setBusy]=useState(false);
 useSharedWallet(selected,setOwner,()=>{});
 const [description,setDescription]=useState(''),[website,setWebsite]=useState(''),[twitter,setTwitter]=useState(''),[telegram,setTelegram]=useState(''),[banner,setBanner]=useState('');
 useEffect(()=>{const c=new AbortController();fetch(`/api/profile/${mint}`,{signal:c.signal}).then(async r=>{if(!r.ok)throw Error('Creator profile is unavailable.');const body=await r.json() as View;setData(body);setDescription(body.update?.description??body.launch.description);setWebsite(body.update?.website??'');setTwitter(body.update?.twitter??body.launch.twitter);setTelegram(body.update?.telegram??body.launch.telegram);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[mint]);
 async function connect(wallet:Wallet){setError('');try{await wallet.connect();if(!wallet.publicKey)throw Error('Wallet did not provide an address.');cleanup.current?.();selected.current=wallet;setOwner(wallet.publicKey.toBase58());setChoices([]);cleanup.current=watchWalletIdentity(wallet,()=>{selected.current=null;setOwner('');setError('Wallet changed. Choose it again before signing.');});}catch(e){setError(e instanceof Error?e.message:'Connection failed.');}}
 async function save(){
  if(!owner){setError('Connect the creator wallet.');return;}
  setBusy(true);setError('');
  try{
   const wallet=selected.current;
   if(!wallet?.publicKey)throw Error('Connect the creator wallet again.');
   let bannerHash='',bannerBase64='';
   if(banner.startsWith('data:')){bannerBase64=banner.split(',')[1]||'';const bytes=Uint8Array.from(atob(bannerBase64),char=>char.charCodeAt(0));bannerHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
   // eslint-disable-next-line react-hooks/purity -- Expiry is created only in the async user signing handler.
   const payload={origin:location.origin,mint,signer:owner,description,website:metadataLink(website,'website'),twitter:metadataLink(twitter,'twitter'),telegram:metadataLink(telegram,'telegram'),bannerHash,expires:Date.now()+10*60*1000};
   const signed=await wallet.signMessage(new TextEncoder().encode(profileMessage(payload)));
   const signature=signed instanceof Uint8Array?signed:signed.signature;
   const bs58=(await import('bs58')).default;
   const response=await fetch(`/api/profile/${mint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature:bs58.encode(signature),...(bannerBase64?{bannerBase64}:{})})});
   const body=await response.json() as View&{error?:string};if(!response.ok)throw Error(body.error||'Profile update failed.');setData(body);
  }catch(e){setError(e instanceof Error?e.message:'Profile update failed.');}finally{setBusy(false);}
 }
 const launch=data?.launch,update=data?.update;
 return <section className="panel corner-panel product-panel creator-profile" aria-label="Creator metadata"><div className="corner-head"><span className="corner-label">Creator</span><span className="corner-label is-right">launch record · signed edits</span></div><h2 className="display-title">the creator<span>.</span></h2>
 {error&&<p role="status" className="feedback error">{error}</p>}
 {launch&&<dl className="product-facts"><div><dt>Launch description</dt><dd>{launch.description||'Not provided'}</dd></div><div><dt>Token website</dt><dd>{launch.website?<a href={launch.website}>{launch.website}</a>:'Not provided'}</dd></div><div><dt>X</dt><dd>{launch.twitter?<a href={launch.twitter}>{launch.twitter}</a>:'Not provided'}</dd></div><div><dt>Telegram</dt><dd>{launch.telegram?<a href={launch.telegram}>{launch.telegram}</a>:'Not provided at launch'}</dd></div></dl>}
 {update&&<div><p className="small muted">Creator update · signed by {update.signer.slice(0,4)}…{update.signer.slice(-4)} · {new Date(update.updatedAt).toLocaleString()}</p>
 {/* eslint-disable-next-line @next/next/no-img-element -- Creator banners are content-addressed uploads, not the site image optimizer. */}
 {update.banner&&<img className="creator-banner" src={update.banner} alt=""/>}
 <p>{update.description}</p><p className="small">{[update.website,update.twitter,update.telegram].filter(Boolean).join(' · ')||'No updated links'}</p></div>}
 <p className="small muted">{data?.notice}</p>
 <details><summary>Edit display metadata</summary><p className="small muted">This signs an off-chain Grainpad update. It does not change the token’s on-chain metadata.</p>
 <label>Description<textarea value={description} maxLength={1000} onChange={e=>setDescription(e.target.value)}/></label>
 <label>Project website<Input value={website} onChange={e=>setWebsite(e.target.value)}/></label>
 <label>X / Twitter<Input value={twitter} onChange={e=>setTwitter(e.target.value)}/></label>
 <label>Telegram<Input value={telegram} placeholder="https://t.me/your_project" onChange={e=>setTelegram(e.target.value)}/></label>
 <label>Banner<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>setBanner(String(reader.result));reader.readAsDataURL(file);}}/></label>
 {!owner?<Button variant="outline" onClick={()=>setChoices(walletProviders())}>Connect creator wallet</Button>:<Button disabled={busy} onClick={()=>void save()}>{busy?'Waiting for signature…':'Sign profile update'}</Button>}
 {choices.map(c=><Button data-wallet-provider={c.name.toLowerCase()} key={c.name} variant="outline" onClick={()=>void connect(c.wallet)}>{c.name}</Button>)}<WalletAvailability/>
 </details></section>;
}
