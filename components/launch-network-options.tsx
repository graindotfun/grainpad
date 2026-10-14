"use client";
import {PICKER_NETWORKS,type PickerNetworkId} from '@/lib/chain/launch-network-picker.ts';
import {LaunchNetworkLogo} from './launch-network-logo';
export function LaunchNetworkOptions({value,onChange,showTestnets,onTestnetsChange}:{value:PickerNetworkId;onChange:(id:PickerNetworkId)=>void;showTestnets:boolean;onTestnetsChange:(show:boolean)=>void}) {
 const groups=PICKER_NETWORKS.filter(n=>n.environment==='mainnet'&&!n.recoveryOnly);
 return <><div className="launch-network-list" role="radiogroup" aria-label="Launch network">{groups.map(main=>{
  const test=PICKER_NETWORKS.find(n=>n.environment==='testnet'&&!n.recoveryOnly&&n.id.split(':')[0]===main.id.split(':')[0]);
  const n=showTestnets&&test&&value===test.id?test:main;
  return <label key={main.id} className={'launch-network-row'+(value===n.id?' is-selected':'')+(n.environment==='testnet'?' is-testnet':'')}>
   <input type="radio" name="launch-network" aria-label={n.label+' '+n.environment} value={n.id} checked={value===n.id} disabled={!n.available} onChange={()=>onChange(n.id)}/><LaunchNetworkLogo networkId={n.id}/><span className="launch-network-name"><strong>{n.label}</strong><small>{n.environment==='testnet'?'Testnet · test assets':'Mainnet'}</small>{showTestnets&&test&&<span className="launch-network-environments">{[main,test].map(option=><button key={option.id} type="button" disabled={!option.available} aria-pressed={n.id===option.id} onClick={e=>{e.preventDefault();onChange(option.id);}}>{option.environment==='mainnet'?'Mainnet':'Testnet'}</button>)}</span>}</span><span className="launch-network-facts"><span>pair <b>{n.quoteLabel}</b></span><span>wallet <b>{n.walletLabel}</b></span><span>DEX <b>{n.dexLabel}</b></span></span>
  </label>;
 })}</div><label className="launch-testnet-toggle"><input type="checkbox" checked={showTestnets} onChange={e=>{onTestnetsChange(e.target.checked);if(!e.target.checked&&value.endsWith(':testnet')){const main=groups.find(n=>n.id.split(':')[0]===value.split(':')[0]);if(main)onChange(main.id);}}}/>Show test networks</label></>;
}
