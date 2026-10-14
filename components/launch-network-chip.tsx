"use client";
import {useState} from 'react';
import {ChevronDown,ArrowRight} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {pickerDefaults,pickerNetwork,pickerNetworkHref,type PickerNetworkId} from '@/lib/chain/launch-network-picker.ts';
import {saveLaunchHandoff,type LaunchIdentityDraft} from '@/lib/chain/launch-network-handoff.ts';
import {LaunchNetworkLogo} from './launch-network-logo';
import {LaunchNetworkOptions} from './launch-network-options';
import '@/app/launch-network-picker.css';
export function LaunchNetworkChip({networkId,disabled=false,submitted=false,identity,onError}:{networkId:PickerNetworkId;disabled?:boolean;submitted?:boolean;identity?:()=>LaunchIdentityDraft;onError?:(message:string)=>void}) {
 const network=pickerNetwork(networkId),[open,setOpen]=useState(false),[selected,setSelected]=useState<PickerNetworkId>(pickerDefaults(null,networkId)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!network)return null;
 async function change(){
  const target=pickerNetwork(selected);if(disabled||busy||!target?.available||target.recoveryOnly||target.environment!=='mainnet'||selected===networkId)return;
  setBusy(true);setError('');try{
   const draft=identity?await saveLaunchHandoff(networkId,selected,identity()):undefined;
   window.location.assign(pickerNetworkHref(selected,{...(draft?{draft}:{})}));
  }catch(e){const message=e instanceof Error?e.message:'Draft could not be copied. Your current launch is preserved.';setError(message);onError?.(message);setBusy(false);}
 }
 return <div className="launch-network-context"><button type="button" className={'launch-network-chip'+(network.environment==='testnet'?' is-testnet':'')} disabled={disabled||submitted} aria-label={'Change launch network: '+network.label+' '+network.environment} onClick={()=>{setSelected(pickerDefaults(null,networkId));setOpen(true);}}><LaunchNetworkLogo networkId={networkId}/><span>{network.label}</span><small>{network.environment==='testnet'?'TESTNET':'MAINNET'}</small>{!submitted&&<ChevronDown size={15}/>}</button>
  {submitted&&<><span className="launch-network-lock-note">This launch stays on {network.label}. Recover it here.</span><button type="button" className="launch-network-new-draft" disabled={disabled} onClick={()=>{setSelected(pickerDefaults(null,networkId));setOpen(true);}}>New draft on another network</button></>}
  {network.environment==='testnet'&&<p className="launch-network-test-note">Test assets only · no real value.</p>}
  <Dialog open={open} onOpenChange={next=>{if(!busy)setOpen(next);}}><DialogContent className="launch-network-dialog"><DialogTitle>{submitted?'Start a separate launch':'Choose your launch network'}</DialogTitle><DialogDescription>{submitted?'Your submitted launch and recovery record stay on their original network. Only the token identity is copied.':'Keep your name, image, description and links. Review the new network terms before signing.'}</DialogDescription><LaunchNetworkOptions value={selected} onChange={setSelected}/><p className="launch-network-switch-note">Wallet connection, approvals and the transaction review must be checked again. Each network keeps its own launch settings.</p>{error&&<p role="alert">{error}</p>}<button type="button" className="gx-pill is-orange" disabled={disabled||busy||selected===networkId||!pickerNetwork(selected)?.available} onClick={()=>void change()}>{busy?'Saving your draft…':submitted?'Open new draft':'Continue'}<ArrowRight size={16}/></button></DialogContent></Dialog>
 </div>;
}
