"use client";
import Image from 'next/image';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {ArrowUpRight,Check,ChevronDown,ChevronRight,Copy,Loader2,Lock,LogOut,Repeat,RotateCcw} from 'lucide-react';
import {walletSession} from '@/lib/wallet-session.mjs';
import {walletProviders,restoreWalletSession,disconnectWalletSession,type WalletProvider} from '@/lib/wallet';
import {groupWalletProviders,readLastUsedWallet,rememberLastUsedWallet,walletConnectError,addressGradient,shortAddress} from '@/lib/wallet-picker.mjs';
import {BRAND_ASSETS} from '@/lib/brand-assets';
import {Button} from './ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './ui/dialog';
import {OpenInWallet} from './open-in-wallet';
import {WalletLogo} from './wallet-logos';
const empty=()=>null;
type Row={provider:WalletProvider;label:string};
type Attempt={row:Row;error:string}|null;

function Avatar({address,size=28}:{address:string;size?:number}){return <span className="wallet-avatar" style={{width:size,height:size,background:addressGradient(address)}} aria-hidden="true"/>;}

function WalletRow({row,lastUsed,secondary,onSelect}:{row:Row;lastUsed?:boolean;secondary?:boolean;onSelect:()=>void}){
 const p=row.provider;
 return <button type="button" className="wallet-row" data-wallet-row={p.brand.toLowerCase()} onClick={onSelect} aria-label={`Connect ${row.label}`}>
  <WalletLogo brand={p.brand} icon={p.icon} size={secondary?32:40}/>
  <span className="wallet-row-name"><strong>{row.label}</strong>{secondary?<small>Wallet Standard connection</small>:lastUsed?<small className="wallet-row-last">Last used</small>:null}</span>
  {!secondary&&<span className="wallet-row-status">Detected</span>}
  <ChevronRight className="wallet-row-arrow" size={18} aria-hidden="true"/>
 </button>;
}

export function SiteWallet(){
 const session=useSyncExternalStore(walletSession.subscribe,walletSession.getSnapshot,empty);
 const [open,setOpen]=useState(false),[choices,setChoices]=useState<WalletProvider[]>([]),[lastUsed,setLastUsed]=useState(''),[attempt,setAttempt]=useState<Attempt>(null),[busy,setBusy]=useState(false),[moreOpen,setMoreOpen]=useState(false),[copied,setCopied]=useState(false),[notice,setNotice]=useState(''),[switching,setSwitching]=useState(false);
 const current=useRef(0);
 function show(){setChoices(walletProviders());setLastUsed(readLastUsedWallet());setAttempt(null);setBusy(false);setMoreOpen(false);setNotice('');setSwitching(false);setOpen(true);}
 useEffect(()=>{void restoreWalletSession();window.addEventListener('grainpad-open-wallet',show);return()=>window.removeEventListener('grainpad-open-wallet',show);},[]);
 useEffect(()=>{if(!copied)return;const t=setTimeout(()=>setCopied(false),1600);return()=>clearTimeout(t);},[copied]);
 async function connect(row:Row){
  const id=++current.current;setAttempt({row,error:''});setBusy(true);
  try{await row.provider.wallet.connect();if(id!==current.current)return;rememberLastUsedWallet(row.provider.name);setOpen(false);setAttempt(null);setSwitching(false);}
  catch(e){if(id===current.current)setAttempt({row,error:walletConnectError(e,row.label)});}
  finally{if(id===current.current)setBusy(false);}
 }
 /** Leaves the wallet prompt to the wallet; a late approval still connects through the session listener. */
 function back(){current.current++;setAttempt(null);setBusy(false);}
 async function copy(address:string){try{await navigator.clipboard.writeText(address);setCopied(true);}catch{setNotice('Copy failed. Select the address to copy it.');}}
 async function disconnect(){try{await disconnectWalletSession();setOpen(false);}catch{setNotice('Wallet disconnected from grainpad.');}}
 const account=session&&!attempt&&!switching;
 const {rows,more,install,lastUsed:lastRow}=groupWalletProviders(choices,lastUsed);

 let body;
 if(account)body=<div className="wallet-account">
  <div className="wallet-account-card">
   <Avatar address={session.owner} size={48}/>
   <div className="wallet-account-id"><strong>{shortAddress(session.owner)}</strong><small>Connected with {session.name.replace(' · Wallet Standard','')}</small></div>
  </div>
  <p className="wallet-account-address" title={session.owner}>{session.owner}</p>
  <div className="wallet-account-actions">
   <button type="button" className="wallet-action" onClick={()=>void copy(session.owner)} aria-live="polite">{copied?<><Check size={15}/>Copied</>:<><Copy size={15}/>Copy address</>}</button>
   <a className="wallet-action" href={`https://solscan.io/account/${session.owner}`} target="_blank" rel="noreferrer"><ArrowUpRight size={15}/>View on Solscan</a>
   <button type="button" className="wallet-action" onClick={()=>{setChoices(walletProviders());setSwitching(true);}}><Repeat size={15}/>Switch wallet</button>
  </div>
  <button type="button" className="wallet-disconnect" onClick={()=>void disconnect()}><LogOut size={15}/>Disconnect</button>
 </div>;
 else if(attempt)body=<div className="wallet-connecting" role="status" aria-live="polite">
  <div className={`wallet-connecting-logo${attempt.error?' is-error':''}`}><WalletLogo brand={attempt.row.provider.brand} icon={attempt.row.provider.icon} size={64}/>{busy&&<span className="wallet-connecting-ring" aria-hidden="true"/>}</div>
  {attempt.error?<><strong>Not connected</strong><p role="alert">{attempt.error}</p></>:<><strong>Approve in {attempt.row.label}</strong><p>Confirm the connection request in your wallet.</p></>}
  <div className="wallet-connecting-actions">
   {attempt.error&&<Button className="wallet-retry" onClick={()=>void connect(attempt.row)}><RotateCcw size={15}/>Try again</Button>}
   <button type="button" className="wallet-back" onClick={back}>{attempt.error?'Choose another wallet':'Cancel'}</button>
  </div>
  {busy&&<p className="wallet-connecting-hint"><Loader2 size={13} className="spin"/>Waiting for {attempt.row.label}</p>}
 </div>;
 else body=<>
  {rows.length>0&&<div className="wallet-rows" role="group" aria-label="Detected wallets">{rows.map(r=><WalletRow key={r.provider.name} row={r} lastUsed={r.provider.name===lastRow} onSelect={()=>void connect(r)}/>)}</div>}
  {more.length>0&&<div className="wallet-more">
   <button type="button" className="wallet-more-toggle" aria-expanded={moreOpen} onClick={()=>setMoreOpen(v=>!v)}>More options<ChevronDown size={15} aria-hidden="true"/></button>
   {moreOpen&&<div className="wallet-rows is-secondary">{more.map(r=><WalletRow key={r.provider.name} row={r} secondary onSelect={()=>void connect(r)}/>)}</div>}
  </div>}
  {!rows.length&&<OpenInWallet mobileOnly/>}
  {switching&&session&&<button type="button" className="wallet-back" onClick={()=>setSwitching(false)}>Back to your wallet</button>}
  {install.length>0&&<div className="wallet-install">
   <p>{rows.length?'Get another wallet':'Get a Solana wallet'}</p>
   <div className="wallet-rows">{install.map(link=><a key={link.brand} className="wallet-row is-install" href={link.href} target="_blank" rel="noreferrer">
    <WalletLogo brand={link.brand} size={40}/><span className="wallet-row-name"><strong>{link.brand}</strong></span><span className="wallet-row-install">Install<ArrowUpRight size={14}/></span>
   </a>)}</div>
  </div>}
 </>;

 return <><Button className="header-cta site-wallet-trigger" onClick={show} aria-label={session?`Connected wallet ${session.owner}`:'Connect wallet'}>{session?<><Avatar address={session.owner} size={16}/><span className="wallet-trigger-full">{shortAddress(session.owner)}</span></>:<><span className="wallet-trigger-full">Connect wallet</span><span className="wallet-trigger-short" aria-hidden="true">Connect</span></>}</Button>
 <Dialog open={open} onOpenChange={setOpen}><DialogContent className="wallet-session-dialog">
  <DialogHeader className="wallet-dialog-header"><span className="wallet-dialog-mark" aria-hidden="true"><Image unoptimized src={BRAND_ASSETS.mark} alt="" width={28} height={28}/></span><DialogTitle>{account?'your wallet':switching?'switch wallet':'connect to grainpad'}</DialogTitle><DialogDescription>{account?'One connection across grainpad.':'Choose a wallet to continue.'}</DialogDescription></DialogHeader>
  {body}
  {notice&&<p className="wallet-notice" role="alert">{notice}</p>}
  {!account&&<p className="wallet-safety"><Lock size={13} aria-hidden="true"/>Connecting shares only your public address. It never approves a transaction.</p>}
 </DialogContent></Dialog></>;
}
