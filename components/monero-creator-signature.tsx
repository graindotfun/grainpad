'use client';
import {useState} from 'react';
import type {Wallet} from '@/lib/wallet';
import {canonicalCreatorMessage} from '@/lib/monero-creator-message.mjs';
import {Button} from './ui/button';
import {Input} from './ui/input';
// A separate reviewed owner decision is needed to enable this message-signing surface.
export const MONERO_CREATOR_SIGNING_ENABLED=false;
type Intent={mint:string;creator:string;metadataHash:string;nonce:string;messageHex:string;state:string};
async function api(body:{action:string;mint:string;signature?:string}):Promise<Intent>{const response=await fetch('/api/monero-publication',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json() as Intent&{error?:string};if(!response.ok)throw Error(result.error||'Publication review unavailable.');if(!result.mint||!result.creator||!result.metadataHash||!result.nonce||!result.messageHex||!/^(?:[0-9a-f]{2})+$/.test(result.messageHex))throw Error('Invalid publication review.');canonicalCreatorMessage(result,body.mint);return result;}
export function MoneroCreatorSignature({wallet}:{wallet:React.RefObject<Wallet|null>}){
 const [mint,setMint]=useState(''),[intent,setIntent]=useState<Intent|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[ack,setAck]=useState(false);
 async function review(){setBusy(true);setNotice('');try{setIntent(await api({action:'intent',mint}));setAck(false);}catch(e){setNotice(e instanceof Error?e.message:'Review unavailable.');}finally{setBusy(false);}}
 async function sign(){setBusy(true);setNotice('');try{
  if(!MONERO_CREATOR_SIGNING_ENABLED)throw Error('Creator message signing remains locked.');
  const w=wallet.current;if(!intent||!ack||w?.publicKey?.toBase58()!==intent.creator)throw Error('Matching creator wallet and review required.');
  const fresh=await api({action:'intent',mint:intent.mint});
  if(fresh.messageHex!==intent.messageHex||fresh.creator!==intent.creator)throw Error('Publication intent changed. Review again.');
  const bytes=canonicalCreatorMessage(fresh,intent.mint,w.publicKey.toBase58());
  const result=await w.signMessage(bytes),signature='signature' in result?result.signature:result;
  await api({action:'signature',mint:intent.mint,signature:Array.from(signature,b=>b.toString(16).padStart(2,'0')).join('')});setNotice('Creator signature saved. Native-XMR publication remains separately locked.');
 }catch(e){setNotice(e instanceof Error?e.message:'Signing unavailable.');}finally{setBusy(false);}}
 return <section className="setup-note"><h3>Monero provenance message</h3><p>Review a finalized GRAINU mint. This separate creator message binds its immutable metadata; publication uses a separately reviewed native-XMR transaction.</p><Input aria-label="Finalized GRAINU mint" value={mint} onChange={e=>{setMint(e.target.value);setIntent(null);setAck(false);}}/><Button disabled={busy||!mint} variant="outline" onClick={review}>Review provenance message</Button>{intent&&<><p>Mint: <code>{intent.mint}</code></p><p>Metadata SHA-256: <code>{intent.metadataHash}</code></p><p>Creator: <code>{intent.creator}</code></p><p>Status: {intent.state}</p><label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> I reviewed this separate provenance message.</label><Button disabled={!MONERO_CREATOR_SIGNING_ENABLED||busy||!ack} onClick={sign}>Creator signing locked</Button></>}{notice&&<p role="status">{notice}</p>}</section>;
}
