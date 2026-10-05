"use client";
import {WxmrWalletNote} from '@/components/wxmr-wallet-note';
import {QUOTES} from '@/lib/quote-assets.mjs';
import {ArrowUpRight,Check} from "lucide-react";
import {CreatorDesk} from "@/components/creator-desk";
import {ClaimIdentity} from "@/components/claim-identity";
import {useCallback,useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {SiteHeader} from "@/components/site-header";
import {KineticText} from "@/components/kinetic-text";
import {GraduatedFees} from "@/components/graduated-fees";
import {useSharedWallet} from '@/components/use-shared-wallet';
import {useTransactionReceipt} from '@/components/use-transaction-receipt';
import {SITE} from "@/lib/site-config";
import {PLATFORM_SETTINGS} from '@/lib/platform-settings.mjs';
import {openWalletPicker,type Wallet} from "@/lib/wallet";
import {displayUnits} from '@/lib/token-units.mjs';
import {WxmrWarning} from '@/components/wxmr-warning';
import type {prepareFeeClaim} from "@/lib/fees";
type Quote=Awaited<ReturnType<typeof prepareFeeClaim>>;
type FeeBalance={symbol:'SOL'|'wXMR';creator?:string;platform?:string;error?:string};
const emptyBalances=():FeeBalance[]=>[{symbol:'SOL'},{symbol:'wXMR'}];
const hasFees=(amount?:string)=>amount!==undefined&&BigInt(amount)>0n;
const delegatedPlatformClaims=PLATFORM_SETTINGS.claimAuthority!==SITE.projectWallet;
const unit=(symbol:string)=>symbol==='SOL'?'wSOL':'wXMR';
const display=(amount:string,symbol:string)=>displayUnits(amount,symbol==='SOL'?9:12);
export default function Fees(){
 const wallet=useRef<Wallet|null>(null),busyRef=useRef(false),generation=useRef(0);
 const [owner,setOwner]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState(''),[balances,setBalances]=useState<FeeBalance[]>(emptyBalances),[prepared,setPrepared]=useState<Quote|null>(null),[limit,setLimit]=useState('0.005'),[open,setOpen]=useState(false);
 const {receipt,track,clearResolved,locked}=useTransactionReceipt('grainpad-fee-signature');
 const [wxmrReceipt,setWxmrReceipt]=useState('');
 const wxmrDelivered=receipt?.status==='finalized'&&receipt.signature===wxmrReceipt;
 useSharedWallet(wallet,setOwner,()=>{generation.current++;setPrepared(null);setBalances(emptyBalances());setError('');});
 const refresh=useCallback(async(address:string)=>{
  const run=++generation.current;await import('@/lib/browser-buffer.mjs');const {readFees}=await import('@/lib/fees');
  await Promise.allSettled((['SOL','wXMR'] as const).map(async symbol=>{try{const result=await readFees(address,symbol);if(run===generation.current)setBalances(current=>current.map(row=>row.symbol===symbol?{symbol,creator:result.creator,platform:result.platform}:row));}catch(e){if(run===generation.current)setBalances(current=>current.map(row=>row.symbol===symbol?{symbol,error:e instanceof Error?e.message:'Balance unavailable'}:row));}}));
 },[]);
 // eslint-disable-next-line react-hooks/exhaustive-deps -- Invalidate the asynchronous balance request, not a DOM ref.
 useEffect(()=>{if(owner)void refresh(owner);return()=>{generation.current++;};},[owner,refresh,receipt?.status]);
 async function claim(symbol:'SOL'|'wXMR',kind:'creator'|'platform'){
  if(busyRef.current||locked)return;const selected=wallet.current;if(!selected?.publicKey){openWalletPicker();return;}
  const address=selected.publicKey.toBase58();busyRef.current=true;clearResolved();setError('');setPrepared(null);setOpen(true);setBusy('Preparing your claim…');
  try{await import('@/lib/browser-buffer.mjs');const {prepareFeeClaim}=await import('@/lib/fees');const review=await prepareFeeClaim(address,kind,limit,symbol);
   if(wallet.current!==selected||selected.publicKey?.toBase58()!==address)throw Error('Wallet changed. Please try again.');
   setPrepared(review);setBusy('Confirm in your wallet');const {signAndSend}=await import('@/lib/launch');
   await signAndSend(review,selected,signature=>{track(signature);setWxmrReceipt(review.quote.mint===QUOTES.wXMR.mint?signature:'');setBusy('Confirming your claim…');});await refresh(address);
  }catch(e){setError(e instanceof Error?e.message:'Could not complete claim.');}finally{busyRef.current=false;setBusy('');}
 }
 const rows=[...balances].sort((a,b)=>Number(BigInt(b.creator||'0')>0n)-Number(BigInt(a.creator||'0')>0n));
 return <main className="shell"><SiteHeader/><div className="page-heading"><div><p className="eyebrow">CREATOR DESK / MAINNET</p><h1><KineticText>Build. Track. Earn.</KineticText></h1></div><p>Accrued trading fees.<br/>Paid to your connected wallet.</p></div>{owner&&<ClaimIdentity key={owner} wallet={owner} signMessage={async bytes=>{const current=wallet.current;if(!current||current.publicKey?.toBase58()!==owner)throw Error('Reconnect your wallet.');const signed=await current.signMessage(bytes);return signed instanceof Uint8Array?signed:signed.signature;}}/>}<CreatorDesk key={owner} owner={owner}/><div className="launch-grid"><section className="panel form-panel earnings-panel" id="claim-controls"><h2>Your earnings</h2><p>All fee currencies, together. Claim the full available balance in its original currency.</p>
 {!owner?<Button className="primary-action" onClick={openWalletPicker}>Connect wallet</Button>:<>
 <div className="earnings-balances">{rows.map(row=><article className="earnings-currency" data-claimable={hasFees(row.creator)||owner===SITE.projectWallet&&!delegatedPlatformClaims&&hasFees(row.platform)||undefined} key={row.symbol}><div className="earnings-currency-heading"><h3>{unit(row.symbol)}</h3><span className="earnings-status">{hasFees(row.creator)||owner===SITE.projectWallet&&!delegatedPlatformClaims&&hasFees(row.platform)?<><span className="earnings-status-dot"/>Ready to claim</>:row.error?'Balance unavailable':row.creator===undefined?'Checking balance':'No fees yet'}</span></div><p className="earnings-balance-label">Creator balance</p><p className="earnings-amount" aria-live="polite">{row.error?'Unavailable':row.creator===undefined?'Loading…':display(row.creator,row.symbol)}{row.creator!==undefined&&<small> {unit(row.symbol)}</small>}</p>
 {row.error?<><p role="status" className="small muted">Could not read this balance. It is not shown as zero.</p><Button variant="outline" onClick={()=>refresh(owner)}>Retry balance</Button></>:<Button className="primary-action earnings-claim-button" data-empty={row.creator==='0'||undefined} disabled={!!busy||locked||!row.creator||row.creator==='0'} onClick={()=>claim(row.symbol,'creator')}><span>{row.creator==='0'?'Nothing to claim':row.creator===undefined?'Loading balance…':`Claim all ${unit(row.symbol)}`}</span>{hasFees(row.creator)&&<ArrowUpRight aria-hidden="true" size={17}/>}</Button>}
 <p className="earnings-delivery-note">{row.symbol==='SOL'?'Paid to your wallet as wSOL.':'Paid to your wallet as wXMR.'} Full balance · no conversion.</p>
 {owner===SITE.projectWallet&&<div className="platform-earnings"><div className="platform-earnings-summary"><span>Platform balance</span><strong>{row.platform===undefined?'…':display(row.platform,row.symbol)} <small>{unit(row.symbol)}</small></strong></div>{delegatedPlatformClaims?<p className="small muted">Collected by the approved operator and forwarded under the treasury policy. This balance is accrued, not yet paid. <a className="inline-link" href="/treasury">View verified payments ↗</a></p>:<Button className="platform-claim-button" variant="outline" disabled={!!busy||locked||!row.platform||row.platform==='0'} onClick={()=>claim(row.symbol,'platform')}><span>{row.platform==='0'?'No platform fees':`Claim platform ${unit(row.symbol)}`}</span>{hasFees(row.platform)&&<ArrowUpRight aria-hidden="true" size={16}/>}</Button>}</div>}
 </article>)}</div>
 <p className="earnings-cost-note">Network fees and account creation are paid in SOL. Cost limit: <strong>{limit} SOL</strong>.</p>
 <details className="claim-cost-settings"><summary>Network cost settings</summary><label>Maximum network fees + account creation · SOL<Input inputMode="decimal" value={limit} disabled={!!busy||locked} onChange={e=>setLimit(e.target.value)}/></label><p className="small muted">This is a spending limit, not the amount you claim. Your complete earnings balance is claimed.</p></details>
 </>}
 {error&&!open&&<p role="alert" className="feedback error">{error}</p>}{receipt&&<div className="receipt earnings-receipt" data-confirmed={receipt.status==='finalized'||undefined} role="status"><p>{receipt.status==='finalized'&&<Check size={16} aria-hidden="true"/>}{receipt.status==='finalized'?'Claim confirmed. Your balances have been refreshed.':receipt.status==='expired'?'Previous claim expired. You can try again.':receipt.status==='failed'?'Previous claim failed. You can try again.':receipt.reason||'Confirming your claim automatically…'}</p><a className="text-link" href={`https://explorer.solana.com/tx/${receipt.signature}`} target="_blank" rel="noreferrer">View transaction ↗</a></div>}
 {wxmrDelivered&&!open&&<WxmrWalletNote/>}
 <details className="claim-disclosures"><summary>About wXMR</summary><WxmrWarning/></details>
 </section>
 <aside className="preview-panel"><p className="eyebrow">HOW EARNINGS WORK</p><h2>Earn from activity.</h2><p className="muted">Creators receive a configured share of trading volume. No volume means no new fees. A token’s price and a creator’s fee income are separate outcomes.</p><div className="preview-divider"/><p className="muted">This page shows LaunchLab’s shared per-quote creator vault for your wallet, including eligible launches made elsewhere. Post-graduation CPMM creator fees can be claimed in the section below. Locked-LP fees belong to the platform Fee Key, not to creators.</p><div className="preview-divider"/><p className="muted">GRAIN holders do not receive these creator or platform fees merely by holding GRAIN.</p></aside></div>
 <Dialog open={open} onOpenChange={setOpen}><DialogContent className="trade-flow-dialog"><DialogHeader><DialogTitle>Claim earnings</DialogTitle><DialogDescription>{busy|| (locked?'Tracking confirmation automatically.':error?'Claim needs attention.':receipt?.status==='finalized'?'Your claim is finalized.':'You can close this window.')}</DialogDescription></DialogHeader>
 {prepared&&<dl><div><dt>You receive · full balance</dt><dd>{display(prepared.amount,prepared.quote.symbol)} {unit(prepared.quote.symbol)}</dd></div><div><dt>Estimated SOL cost</dt><dd>{displayUnits(prepared.estimatedLamports,9)} SOL</dd></div><div><dt>Maximum SOL cost</dt><dd>{limit} SOL</dd></div></dl>}
 {wxmrDelivered&&<WxmrWalletNote/>}
 {error&&<p role="alert" className="feedback error">{error}</p>}<Button variant="outline" onClick={()=>setOpen(false)}>Close</Button></DialogContent></Dialog>
 <GraduatedFees/><footer><span>Grainpad / Creator earnings</span><span>You approve every payment in your wallet.</span></footer></main>;
}
