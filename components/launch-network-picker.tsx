"use client";
import {useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {SiteHeader} from './site-header';
import {SiteFooter} from './site-footer';
import {pickerDefaults,pickerNetwork,pickerNetworkHref,parseStoredSolanaPending,parseStoredRhPending,type PickerNetworkId,type PendingPickerLaunch} from '@/lib/chain/launch-network-picker.ts';
import {listMainnetLaunchDrafts} from '@/lib/chain/robinhood-mainnet-draft.ts';
import {LaunchNetworkOptions} from './launch-network-options';
import '@/app/launch-network-picker.css';
const preferenceKey='grainpad:launch:last-network';
export function LaunchNetworkPicker(){
 const params=useSearchParams();
 const [ready,setReady]=useState(false);
 const [selected,setSelected]=useState<PickerNetworkId>('solana:mainnet-beta'),[testnets,setTestnets]=useState(false),[pending,setPending]=useState<PendingPickerLaunch[]>([]),[storageWarning,setStorageWarning]=useState(false),[navigationError,setNavigationError]=useState('');
 useEffect(()=>{let cancelled=false;
  void Promise.resolve().then(()=>{if(cancelled)return;
  try{setSelected(pickerDefaults(localStorage.getItem(preferenceKey),params.get('network'),false));}catch{setSelected(pickerDefaults(null,params.get('network'),false));}
  const records=new Map<string,PendingPickerLaunch>();const add=(record:PendingPickerLaunch|null)=>{if(record)records.set(record.sourceKey,record);};
  try{add(parseStoredSolanaPending(localStorage.getItem('grainpad-pending')));for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&/^grainpad:(4663|46630):create:/.test(key))add(parseStoredRhPending(key,localStorage.getItem(key)));}}catch{setStorageWarning(true);}
  setPending([...records.values()]);setReady(true);
  void listMainnetLaunchDrafts().then(rows=>{if(cancelled)return;for(const row of rows){const candidate=parseStoredRhPending(row.key,row.value),saved=records.get(row.key);if(candidate&&(!saved||saved.status==='uncertain'))add(candidate);}setPending([...records.values()]);}).catch(()=>{if(!cancelled)setStorageWarning(true);});
  });
  return()=>{cancelled=true;};
 },[params]);
 const network=pickerNetwork(selected);
 const proceed=()=>{if(!ready||!network?.available||network.recoveryOnly||network.environment==='testnet'&&!testnets)return;try{localStorage.setItem(preferenceKey,selected);}catch{/* Optional preference only. */}
  try{const name=params.get('name'),recover=params.get('recover'),draft=params.get('draft');window.location.assign(pickerNetworkHref(selected,{...(name?{name}:{}),...(recover?{recover}:{}),...(draft?{draft}:{})}));}catch{setNavigationError('This recovery link does not match the selected network. Choose its original network or open a fresh launch page.');}};
 return <div className="gx"><SiteHeader showWallet={false}/><main id="main-content" className="launch-network-picker"><div className="launch-network-heading"><p className="eyebrow">ideas into existence</p><h1>Where will you launch?</h1><p>Choose your network. Your wallet connects on the next screen.</p></div>
 {pending.length>0&&<section className="launch-network-pending" aria-label="Saved launches"><h2>Pick up where you left off</h2>{pending.map(record=><div key={record.sourceKey} className="launch-pending-row"><div><strong>{pickerNetwork(record.networkId)?.label} · {pickerNetwork(record.networkId)?.environment}</strong><p>{record.status==='uncertain'?'A wallet result is still unknown. Check the original launch before trying again.':'A transaction receipt is saved. Continue its original registration.'}</p></div><a href={record.href}>{record.status==='uncertain'?'Check launch':'Resume launch'}</a></div>)}</section>}
 {storageWarning&&<p role="status">Some saved launch details could not be read. Keep your original launch tab and transaction receipts.</p>}
 <LaunchNetworkOptions value={selected} onChange={setSelected} showTestnets={testnets} onTestnetsChange={setTestnets}/>
 <button type="button" className="gx-pill is-orange launch-network-continue" disabled={!ready||!network?.available||network.recoveryOnly} onClick={proceed}>Continue with {network?.label}</button>
 {navigationError&&<p role="alert">{navigationError}</p>}
 <p className="launch-network-footnote">Changing network carries no transaction or wallet approval. Existing launches stay on their original network.</p>
 </main><SiteFooter/></div>;
}
