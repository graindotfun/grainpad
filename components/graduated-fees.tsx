"use client";
import {WxmrWalletNote} from '@/components/wxmr-wallet-note';
import {QUOTES} from '@/lib/quote-assets.mjs';
import {useTransactionReceipt} from './use-transaction-receipt';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './ui/dialog';
import {useSharedWallet} from "@/components/use-shared-wallet";
import {useEffect,useRef,useState} from 'react';
import {displayUnits} from '@/lib/token-units.mjs';
import {Field,FieldGroup,FieldLabel,FieldDescription} from '@/components/ui/field';
import {GrainSelect} from '@/components/grain-select';
import {Input} from '@/components/ui/input';import {Button} from '@/components/ui/button';import {openWalletPicker,watchWalletIdentity,type Wallet} from '@/lib/wallet';import type {prepareGraduatedClaim} from '@/lib/graduated-fees';
type Quote=Awaited<ReturnType<typeof prepareGraduatedClaim>>;
export function GraduatedFees(){
 const [mint,setMint]=useState(''),[nft,setNft]=useState(''),[kind,setKind]=useState<'creator'|'lp'>('creator'),[limit,setLimit]=useState('0.005'),[owner,setOwner]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[quote,setQuote]=useState<Quote|null>(null),[open,setOpen]=useState(false);const wallet=useRef<Wallet|null>(null);
 const {receipt,track,clearResolved,locked}=useTransactionReceipt('grainpad-graduated-fee-signature');
 const busyRef=useRef(false);
 const [wxmrReceipt,setWxmrReceipt]=useState('');
 const wxmrDelivered=receipt?.status==='finalized'&&receipt.signature===wxmrReceipt;
 useSharedWallet(wallet,setOwner,()=>{setQuote(null);});
 useEffect(()=>{const w=wallet.current;if(!w)return;return watchWalletIdentity(w,()=>{wallet.current=null;setOwner('');setQuote(null);setError('Wallet changed. Reconnect and prepare a fresh claim.');});},[owner]);
 async function prepare(){if(busyRef.current||locked)return;busyRef.current=true;clearResolved();setBusy(true);setOpen(true);setError('');setQuote(null);try{const selected=wallet.current;if(!selected?.publicKey)throw Error('Connect your wallet.');const owner=selected.publicKey.toBase58();await import('@/lib/browser-buffer.mjs');const {prepareGraduatedClaim}=await import('@/lib/graduated-fees');const review=await prepareGraduatedClaim(owner,mint,kind,nft,limit);if(wallet.current!==selected||selected.publicKey?.toBase58()!==owner)throw Error('Wallet changed. Try again.');setQuote(review);const {signAndSend}=await import('@/lib/launch');await signAndSend(review,selected,signature=>{track(signature);setWxmrReceipt(review.received.some(row=>row.mint===QUOTES.wXMR.mint&&BigInt(row.amount)>0n)?signature:'');});}catch(e){setError(e instanceof Error?e.message:String(e));}finally{busyRef.current=false;setBusy(false);}}
 return <section className="panel official-settings" id="graduated-claims"><p className="eyebrow">AFTER GRADUATION</p><h2>CPMM creator fees<span className="gx-dot">.</span></h2><p>The 1% CPMM creator fee goes to each token’s creator. Fees from the initial locked LP go to the holder of its Fee Key NFT. grainpad’s configuration assigns that Fee Key to the platform wallet, so token creators do not hold one. A claim cannot withdraw the locked liquidity.</p><FieldGroup className="claim-fields">
  <Field><FieldLabel htmlFor="graduated-mint">Token mint</FieldLabel><Input id="graduated-mint" value={mint} disabled={busy||locked} onChange={e=>{setMint(e.target.value);setQuote(null);}}/></Field>
  <div className="claim-field-row">
   <Field><FieldLabel htmlFor="graduated-source">Fee source</FieldLabel><GrainSelect id="graduated-source" size="field" disabled={busy||locked} value={kind} onValueChange={value=>{setKind(value as 'creator'|'lp');setQuote(null);}} options={[{value:'creator',label:'CPMM creator fees'},{value:'lp',label:'Platform Fee Key · locked LP'}]}/></Field>
   <Field><FieldLabel htmlFor="graduated-limit">Maximum transaction cost · SOL</FieldLabel><Input id="graduated-limit" value={limit} disabled={busy||locked} onChange={e=>{setLimit(e.target.value);setQuote(null);}}/></Field>
  </div>
  {kind==='lp'&&<Field><FieldLabel htmlFor="graduated-nft">Fee Key NFT mint</FieldLabel><Input id="graduated-nft" aria-describedby="graduated-nft-help" value={nft} onChange={e=>{setNft(e.target.value);setQuote(null);}}/><FieldDescription id="graduated-nft-help">Only the platform Fee Key holder can claim. Find it under locked positions in the Raydium portfolio of that wallet.</FieldDescription></Field>}
 </FieldGroup>
 {!owner?<Button variant="outline" onClick={openWalletPicker}>Connect wallet</Button>:<Button disabled={busy||!mint.trim()||locked} variant="outline" onClick={prepare}>{busy?'Preparing claim…':locked?'Confirming claim…':'Claim all fees'}</Button>}
 <p className="small muted">The SOL limit covers network fees and account creation, not the amount claimed. You receive the full available fees in their original tokens.</p>
 <Dialog open={open} onOpenChange={setOpen}><DialogContent className="trade-flow-dialog"><DialogHeader><DialogTitle>claim pool fees</DialogTitle><DialogDescription>{busy?'Preparing your claim. Confirm in your wallet when it opens.':locked?'Tracking confirmation automatically.':'Claim status'}</DialogDescription></DialogHeader>
 {wxmrDelivered&&<WxmrWalletNote/>}{quote&&<div><p>Estimated SOL cost: {displayUnits(quote.estimatedLamports,9)} SOL</p>{quote.received.map(r=><p className="address-line" key={r.mint}>{displayUnits(r.amount,r.decimals)} · {r.mint}</p>)}<p className="small muted">SOL fees arrive as wSOL.</p></div>}{error&&<p role="alert" className="feedback error">{error}</p>}<Button variant="outline" onClick={()=>setOpen(false)}>Close</Button></DialogContent></Dialog>
 {receipt&&<div className="receipt" role="status"><p>{receipt.status==='finalized'?'Claim confirmed.':receipt.status==='failed'?'Claim failed. You can try again.':receipt.status==='expired'?'Claim expired. You can try again.':receipt.reason||'Confirming automatically…'}</p><a className="text-link" href={`https://explorer.solana.com/tx/${receipt.signature}`} target="_blank" rel="noreferrer">View transaction ↗</a></div>}{wxmrDelivered&&!open&&<WxmrWalletNote/>}{error&&!open&&<p role="alert" className="feedback error">{error}</p>}</section>;
}
