'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {useSharedWallet} from './use-shared-wallet';
import {openWalletPicker,type Wallet} from '@/lib/wallet';
import {canonicalLaunchTweet} from '@/lib/launch-post-link.mjs';
import {launchPostMessage} from '@/lib/token-launch-post.mjs';
type Post={mint:string;creator:string;url:string;revision:number;updatedAt:number|null;source:string};
export function TokenLaunchPost({mint}:{mint:string}){
 const wallet=useRef<Wallet|null>(null),activeMint=useRef(mint);
 const [owner,setOwner]=useState(''),[data,setData]=useState<Post|null>(null),[url,setUrl]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
 useSharedWallet(wallet,setOwner,()=>setSaved(false));
 useEffect(()=>{
  activeMint.current=mint;const controller=new AbortController();
  fetch(`/api/token/${mint}/launch-post`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   const body=await response.json() as Post;if(!response.ok||body.mint!==mint||!Number.isSafeInteger(body.revision)||body.revision<0||canonicalLaunchTweet(body.url)!==body.url)throw Error('Launch post is temporarily unavailable.');
   if(!controller.signal.aborted){setData(body);setUrl(body.url);setError('');}
  }).catch(reason=>{if(!controller.signal.aborted){setData(null);setError(reason instanceof Error?reason.message:'Launch post is unavailable.');}});
  return()=>controller.abort();
 },[mint]);
 async function save(){
  if(!data||data.mint!==mint)return;
  setBusy(true);setSaved(false);setError('');
  try{
   const selected=wallet.current;
   if(!selected?.publicKey||selected.publicKey.toBase58()!==data.creator)throw Error('Connect the launch creator wallet.');
   const payload={version:1,origin:location.origin,mint,creator:data.creator,url:canonicalLaunchTweet(url),baseRevision:data.revision,nonce:crypto.randomUUID(),expires:Date.now()+600000};
   const result=await selected.signMessage(new TextEncoder().encode(launchPostMessage(payload)));
   if(activeMint.current!==mint||wallet.current!==selected||selected.publicKey?.toBase58()!==data.creator)throw Error('Wallet or token changed. Refresh before signing again.');
   const bs58=(await import('bs58')).default;
   const response=await fetch(`/api/token/${mint}/launch-post`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature:bs58.encode(result instanceof Uint8Array?result:result.signature)})});
   const body=await response.json() as Post&{error?:string};if(!response.ok)throw Error(body.error||'Launch post update failed. Refresh and try again.');
   if(body.mint!==mint||body.creator!==data.creator||canonicalLaunchTweet(body.url)!==body.url||!Number.isSafeInteger(body.revision))throw Error('Launch post response could not be verified. Refresh the page.');
   if(activeMint.current===mint){setData(body);setUrl(body.url);setSaved(true);}
  }catch(reason){setError(reason instanceof Error?reason.message:'Launch post update failed.');}finally{setBusy(false);}
 }
 const current=data?.mint===mint?data:null;
 return <section className="token-launch-post" aria-label="Launch post">
  {current?.url&&<a className="token-launch-post-link" href={current.url} target="_blank" rel="noreferrer noopener">Launch post <ArrowUpRight size={14}/><span className="small muted">on X</span></a>}
  {current&&(!owner||owner===current.creator)&&<details className="token-launch-post-editor"><summary>{current.url?'Edit launch post':'Add launch post'} <span className="small muted">· creator</span></summary>
   <p className="small muted">Link the post announcing this token. This is separate from your X profile and can be added after publishing the CA. Your wallet signs a message; no payment is requested.</p>
   <label>Launch post URL<Input type="url" value={url} maxLength={300} placeholder="https://x.com/your_project/status/123456789" disabled={busy} onChange={event=>{setUrl(event.target.value);setSaved(false);}}/></label>
   {!owner?<Button variant="outline" onClick={openWalletPicker}>Connect creator wallet</Button>:<Button variant="outline" disabled={busy||(!url.trim()&&!current.url)} onClick={()=>void save()}>{busy?'Waiting for signature…':!url.trim()&&current.url?'Sign to remove link':'Sign launch post update'}</Button>}
   {saved&&<p role="status" className="small">Launch post updated.</p>}
  </details>}
  {current?.url&&<p className="token-launch-post-note">Linked by the token creator. Post content is not verified by grainpad.</p>}
  {error&&<p className="small muted" role="status">{error}</p>}
 </section>;
}
