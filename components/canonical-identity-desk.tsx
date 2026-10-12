'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {useSharedWallet} from './use-shared-wallet';
import {metadataLink} from '@/lib/metadata-shared';
import type {Wallet} from '@/lib/wallet';
import {IDENTITY_UPDATE_SENTENCE,canonicalXCommunity,identityAmendmentMessage} from '@/lib/identity-amendment.mjs';
type Launch={mint:string;name:string;symbol:string};
type Header={uri?:string;sha256?:string;renditions?:{'600x200'?:{uri?:string}}};
type Presentation={header:Header|null;twitter:string;telegram:string;xCommunity:string;revision:number;amendmentSha256:string|null;identitySha256:string};
type Body={identitySha256:string;document:{name?:string;symbol?:string;creator?:string|null;header?:Header|null;twitter?:string;telegram?:string;sealedAt?:string};revisions:{revision:number;sha256:string}[];presentation:Presentation;error?:string};
export function CanonicalIdentityDesk({owner,launches}:{owner:string;launches:Launch[]}){
 const wallet=useRef<Wallet|null>(null);
 const [signer,setSigner]=useState('');
 useSharedWallet(wallet,setSigner,()=>{});
 const [chosen,setChosen]=useState('');
 const mint=launches.some(launch=>launch.mint===chosen)?chosen:(launches[0]?.mint||'');
 const [record,setRecord]=useState<Body|null>(null);
 const [twitter,setTwitter]=useState('');
 const [telegram,setTelegram]=useState('');
 const [xCommunity,setXCommunity]=useState('');
 const [banner,setBanner]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  if(!mint)return;
  const controller=new AbortController();
  fetch(`/api/identity/token/${mint}/amendments`,{signal:controller.signal,cache:'no-store'}).then(async response=>{
   const body=await response.json() as Body;
   if(!response.ok)throw Error(body.error||'Canonical identity is unavailable.');
   setRecord(body);
   setTwitter(body.presentation?.twitter||'');
   setTelegram(body.presentation?.telegram||'');
   setXCommunity(body.presentation?.xCommunity||'');
  }).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Canonical identity is unavailable.');});
  return()=>controller.abort();
 },[mint]);
 async function save(){
  if(!record||!mint)return;
  setBusy(true);setError('');
  try{
   const current=wallet.current;
   if(!current?.publicKey||current.publicKey.toBase58()!==owner)throw Error('Connect the launch creator wallet.');
   let headerSha256='',smallSha256='',headerBase64='',headerType='';
   if(banner.startsWith('data:')){
    const [prefix,data]=banner.split(',');
    headerType=prefix.split(':')[1]?.split(';')[0]||'';
    const bytes=Uint8Array.from(atob(data||''),char=>char.charCodeAt(0));
    const {validateHeaderImage,headerRenditions}=await import('@/lib/header-image.mjs');
    validateHeaderImage(bytes,headerType);
    const renditions=await headerRenditions(bytes);
    const digest=async(value:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
    headerSha256=await digest(renditions.large);smallSha256=await digest(renditions.small);headerBase64=data||'';
   }
   const nextTwitter=twitter.trim()?metadataLink(twitter,'twitter'):'';
   const nextTelegram=telegram.trim()?metadataLink(telegram,'telegram'):'';
   const nextCommunity=xCommunity.trim()?canonicalXCommunity(xCommunity):'';
   const changedTwitter=nextTwitter&&nextTwitter!==(record.presentation.twitter||'')?nextTwitter:'';
   const changedTelegram=nextTelegram&&nextTelegram!==(record.presentation.telegram||'')?nextTelegram:'';
   const changedCommunity=nextCommunity&&nextCommunity!==(record.presentation.xCommunity||'')?nextCommunity:'';
   if(!headerSha256&&!changedTwitter&&!changedTelegram&&!changedCommunity)throw Error('Identity update does not change a canonical field.');
   const payload={schema:'grainpad.identity.amendment.v1',mint,signer:owner,identitySha256:record.identitySha256,previousSha256:record.presentation.amendmentSha256||record.identitySha256,revision:(record.presentation.revision||0)+1,headerSha256,smallSha256,twitter:changedTwitter,telegram:changedTelegram,xCommunity:changedCommunity,expires:Date.now()+10*60*1000};
   setBusy(true);
   const signed=await current.signMessage(new TextEncoder().encode(identityAmendmentMessage(payload)));
   const signatureBytes=signed instanceof Uint8Array?signed:signed.signature;
   const bs58=(await import('bs58')).default;
   const response=await fetch(`/api/identity/token/${mint}/amendments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature:bs58.encode(signatureBytes),...(headerBase64?{headerBase64,headerType}:{})})});
   const body=await response.json() as Body;
   if(!response.ok)throw Error(body.error||'Identity update failed.');
   setRecord(body);setBanner('');
  }catch(reason){setError(reason instanceof Error?reason.message:'Identity update failed.');}
  finally{setBusy(false);}
 }
 const original=record?.document;
 const current=record?.presentation;
 const bannerUri=current?.header?.uri&&current.header.sha256&&current.header.uri.endsWith('/'+current.header.sha256)?current.header.uri:'';
 return <section className="canonical-identity-desk" aria-label="Canonical token identity"><div className="product-section-heading"><h2>canonical token identity</h2></div>
 <p>Changes here create a signed canonical identity revision. Your original launch identity remains preserved.</p>
 <p className="small">{IDENTITY_UPDATE_SENTENCE}</p>
 {!owner?<p className="small muted">Connect your wallet to add or replace a canonical banner, X account, or X Community.</p>:<>
 {!launches.length?<p className="small muted">Indexed launches appear here after registration. A room submission does not become the canonical banner.</p>:<label>Project<select value={mint} onChange={event=>{setChosen(event.target.value);setRecord(null);setBanner('');}}>{launches.map(launch=><option key={launch.mint} value={launch.mint}>{launch.name} · ${launch.symbol}</option>)}</select></label>}
 {original&&<dl className="product-facts"><div><dt>Original launch identity</dt><dd><a href={`/api/identity/token/${mint}`}>{original.name} · ${original.symbol}</a> · {record?.identitySha256.slice(0,12)}</dd></div><div><dt>Current canonical banner</dt><dd>{bannerUri?bannerUri:'No canonical banner yet'}</dd></div><div><dt>Current revision</dt><dd>{current?.revision||0}{current?.amendmentSha256?` · ${current.amendmentSha256.slice(0,12)}`:''}</dd></div></dl>}
 {bannerUri&&<>
 {/* eslint-disable-next-line @next/next/no-img-element -- Content-addressed canonical banner, not the site image optimizer. */}
 <img className="creator-banner" src={bannerUri} alt="Current canonical banner"/>
 </>}
 {!!record?.revisions?.length&&<p className="small muted">{record.revisions.length} signed revision{record.revisions.length===1?'':'s'} kept. Replacing a banner does not delete an earlier revision.</p>}
 <p className="eyebrow">Add / Replace banner</p>
 <label>Banner PNG, exactly 1200×400<input type="file" accept="image/png" disabled={!signer||busy} onChange={event=>{const file=event.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>setBanner(String(reader.result));reader.readAsDataURL(file);}}/></label>
 <label>X account<Input value={twitter} disabled={!signer||busy} placeholder="https://x.com/your_project" onChange={event=>setTwitter(event.target.value)}/></label>
 <label>X Community<Input value={xCommunity} disabled={!signer||busy} placeholder="https://x.com/i/communities/123" onChange={event=>setXCommunity(event.target.value)}/></label>
 <label>Telegram<Input value={telegram} disabled={!signer||busy} placeholder="https://t.me/your_project" onChange={event=>setTelegram(event.target.value)}/></label>
 <Button disabled={!signer||busy||signer!==owner} onClick={()=>void save()}>{busy?IDENTITY_UPDATE_SENTENCE:'Sign canonical identity update'}</Button>
 </>}
 {error&&<p className="feedback error" role="alert">{error}</p>}</section>;
}
