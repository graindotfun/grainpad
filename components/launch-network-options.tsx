"use client";
import {PICKER_NETWORKS,type PickerNetworkId} from '@/lib/chain/launch-network-picker.ts';
import {LaunchNetworkLogo} from './launch-network-logo';
export function LaunchNetworkOptions({value,onChange}:{value:PickerNetworkId;onChange:(id:PickerNetworkId)=>void}) {
 const networks=PICKER_NETWORKS.filter(n=>n.environment==='mainnet'&&!n.recoveryOnly);
 return <div className="launch-network-list" role="radiogroup" aria-label="Launch network">{networks.map(n=><label key={n.id} className={'launch-network-row'+(value===n.id?' is-selected':'')}>
  <input type="radio" name="launch-network" aria-label={n.label+' mainnet'} value={n.id} checked={value===n.id} disabled={!n.available} onChange={()=>onChange(n.id)}/><LaunchNetworkLogo networkId={n.id}/><span className="launch-network-name"><strong>{n.label}</strong><small>Mainnet</small></span><span className="launch-network-facts"><span className="launch-network-fact"><span className="launch-network-fact-label">pair options</span><b>{n.quoteLabel}</b>{n.quoteHint&&<small>{n.quoteHint}</small>}</span><span className="launch-network-fact"><span className="launch-network-fact-label">wallet</span><b>{n.walletLabel}</b></span><span className="launch-network-fact is-dex"><span className="launch-network-fact-label">DEX</span><b>{n.dexLabel}</b></span></span>
 </label>)}</div>;
}
