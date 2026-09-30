'use client';
import {useState} from 'react';
import type {Wallet} from '@/lib/wallet';
import {canonicalCreatorMessage} from '@/lib/monero-creator-message.mjs';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {MONERO_CREATOR_SIGNING_ENABLED,signReviewedCreatorIntent} from '@/lib/monero-creator-signing.mjs';
type Intent={mint:string;creator:string;metadataHash:string;nonce:string;messageHex:string;state:string};
async function api(body:{action:string;mint:string;signature?:string}):Promise<Intent>{const response=await fetch('/api/monero-publication',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json() as Intent&{error?:string};if(!response.ok)throw Error(result.error||'Publication review unavailable.');if(!result.mint||!result.creator||!result.metadataHash||!result.nonce||!result.messageHex||!/^(?:[0-9a-f]{2})+$/.test(result.messageHex))throw Error('Invalid publication review.');canonicalCreatorMessage(result,body.mint);return result;}
export function MoneroCreatorSignature({wallet,initialMint='',expectedCreator=null,expectedMetadataHash=null}:{wallet:React.RefObject<Wallet|null>;initialMint?:string;expectedCreator?:string|null;expectedMetadataHash?:string|null}){
 const [mint,setMint]=useState(initialMint),[intent,setIntent]=useState<Intent|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[ack,setAck]=useState(false);
 async function review(){setBusy(true);setNotice('');try{const next=await api({action:'intent',mint});if((expectedCreator!==null&&next.creator!==expectedCreator)||(expectedMetadataHash!==null&&next.metadataHash!==expectedMetadataHash))throw Error('Registered launch binding changed.');setIntent(next);setAck(false);}catch(e){setNotice(e instanceof Error?e.message:'Review unavailable.');}finally{setBusy(false);}}
 async function sign(){setBusy(true);setNotice('');try{
  if(!intent)throw Error('Review a registered mint first.');
  const signature=await signReviewedCreatorIntent(intent,wallet.current,{acknowledged:ack,expectedMint:mint,expectedCreator,expectedMetadataHash,freshIntent:(m:string)=>api({action:'intent',mint:m})});
  await api({action:'signature',mint:intent.mint,signature});setNotice('Creator signature saved. Native-XMR publication is pending separate operator approval and confirmation.');
 }catch(e){setNotice(e instanceof Error?e.message:'Signing unavailable.');}finally{setBusy(false);}}
 return <section className="setup-note"><h3>Monero provenance message</h3><p>Review this finalized, canonically registered mint. This separate creator message binds its immutable metadata; publication uses a separately reviewed native-XMR transaction.</p><Input aria-label="Finalized registered mint" disabled={!!initialMint} value={mint} onChange={e=>{setMint(e.target.value);setIntent(null);setAck(false);}}/><Button disabled={busy||!mint} variant="outline" onClick={review}>Review provenance message</Button>{intent&&<><p>Mint: <code>{intent.mint}</code></p><p>Metadata SHA-256: <code>{intent.metadataHash}</code></p><p>Creator: <code>{intent.creator}</code></p><p>Status: {intent.state}</p><label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> I reviewed this separate provenance message.</label><Button disabled={!MONERO_CREATOR_SIGNING_ENABLED||busy||!ack} onClick={sign}>Creator signing locked</Button></>}{notice&&<p role="status">{notice}</p>}</section>;
}
