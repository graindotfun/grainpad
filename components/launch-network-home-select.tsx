"use client";
import {useEffect,useState} from 'react';
import {PICKER_NETWORKS,pickerDefaults,type PickerNetworkId} from '@/lib/chain/launch-network-picker.ts';
import {LaunchNetworkLogo} from './launch-network-logo';
import '@/app/launch-network-picker.css';
export function LaunchNetworkHomeSelect(){
 const [selected,setSelected]=useState<PickerNetworkId>('solana:mainnet-beta');
 useEffect(()=>{queueMicrotask(()=>{try{setSelected(pickerDefaults(localStorage.getItem('grainpad:launch:last-network'),null,false));}catch{/* Mainnet Solana stays selected. */}});},[]);
 return <label className="launch-network-home"><LaunchNetworkLogo networkId={selected}/><span className="sr-only">Launch network</span><select name="network" aria-label="Launch network" value={selected} onChange={e=>{const next=pickerDefaults(null,e.target.value,false);setSelected(next);try{localStorage.setItem('grainpad:launch:last-network',next);}catch{/* Optional preference. */}}}>{PICKER_NETWORKS.filter(n=>n.available&&!n.recoveryOnly&&n.environment==='mainnet').map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select></label>;
}
