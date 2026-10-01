"use client";
import {useEffect,useState,useSyncExternalStore} from 'react';
import {walletSession} from '@/lib/wallet-session.mjs';
import {walletProviders,restoreWalletSession,disconnectWalletSession,type Wallet} from '@/lib/wallet';
import {Button} from './ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './ui/dialog';
import {WalletAvailability} from './wallet-availability';
import {OpenInWallet} from './open-in-wallet';
const empty=()=>null;
export function SiteWallet(){
 const session=useSyncExternalStore(walletSession.subscribe,walletSession.getSnapshot,empty);
 const [open,setOpen]=useState(false),[choices,setChoices]=useState<ReturnType<typeof walletProviders>>([]),[error,setError]=useState(''),[busy,setBusy]=useState('');
 function show(){setChoices(walletProviders());setError('');setOpen(true);}
 useEffect(()=>{void restoreWalletSession();window.addEventListener('grainpad-open-wallet',show);return()=>window.removeEventListener('grainpad-open-wallet',show);},[]);
 async function connect(w:Wallet,name:string){setBusy(name);setError('');try{await w.connect();setOpen(false);}catch(e){setError(e instanceof Error?e.message:'Could not connect wallet.');}finally{setBusy('');}}
 return <><Button className="header-cta site-wallet-trigger" onClick={show} aria-label={session?`Connected wallet ${session.owner}`:'Connect wallet'}>{session?<><span className="wallet-status-dot"/>{session.owner.slice(0,4)}…{session.owner.slice(-4)}</>:'Connect wallet'}</Button>
 <Dialog open={open} onOpenChange={setOpen}><DialogContent className="wallet-session-dialog"><DialogHeader><DialogTitle>{session?'Your wallet':'Connect wallet'}</DialogTitle><DialogDescription>{session?'One connection across Grainpad.':'Choose your wallet to use it across Grainpad.'}</DialogDescription></DialogHeader>
 {session&&<div><p className="address-line">{session.owner}</p><Button variant="outline" disabled={!!busy} onClick={async()=>{try{await disconnectWalletSession();setOpen(false);}catch{setError('Wallet disconnected from Grainpad.');}}}>Disconnect</Button></div>}
 <div className="token-wallet-options">{choices.map(p=><Button key={p.name} data-wallet-provider={p.name.toLowerCase()} disabled={!!busy} onClick={()=>connect(p.wallet,p.name)}>{busy===p.name?'Connecting…':p.name}</Button>)}</div>
 {!choices.length&&<OpenInWallet/>}<WalletAvailability/>{error&&<p role="alert">{error}</p>}</DialogContent></Dialog></>;
}
