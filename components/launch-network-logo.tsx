/* eslint-disable @next/next/no-img-element -- Supplied network SVGs are immutable local assets. */
import {pickerNetwork,type PickerNetworkId} from '@/lib/chain/launch-network-picker.ts';
export function LaunchNetworkLogo({networkId}:{networkId:PickerNetworkId}) {
 const network=pickerNetwork(networkId);if(!network)return null;
 return <span className={'launch-network-logo is-'+network.family} aria-hidden="true"><img className="network-logo-main" src={network.logoMain} alt="" width={28} height={28}/><img className="network-logo-hover" src={network.logoHover} alt="" width={28} height={28}/></span>;
}
export function LaunchNetworkStamp({networkId}:{networkId:PickerNetworkId}) {
 const network=pickerNetwork(networkId);if(!network)return null;
 return <span className={'launch-network-stamp'+(network.environment==='testnet'?' is-testnet':'')}><LaunchNetworkLogo networkId={networkId}/><span>{network.label} · {network.environment==='testnet'?'Testnet':'Mainnet'}</span></span>;
}
