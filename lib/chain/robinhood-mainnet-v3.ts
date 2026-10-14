import {ROBINHOOD_CHAIN_MAINNET} from './robinhood-mainnet.ts';
import type {EvmLaunchProfile} from './evm-one-approval-launch.ts';
/** Only pinned after exact reviewed deployment verification. */
export const ROBINHOOD_MAINNET_V3_FACTORY_ADDRESS: string | null = null;
export const ROBINHOOD_MAINNET_V3_DEPLOYMENT_BLOCK: bigint | null = null;
export function robinhoodMainnetV3Profile(factory: string | null = ROBINHOOD_MAINNET_V3_FACTORY_ADDRESS): EvmLaunchProfile | null {
 if(!factory)return null;
 return {networkId:'robinhood:mainnet',chainId:ROBINHOOD_CHAIN_MAINNET.chainId,factory,marketModel:'uniswap-v3-continuous',metadataOrigin:'https://grainpad.fun',metadataPath:'/api/robinhood/mainnet/metadata/{launchId}',assetOrigin:'https://grainpad.fun',registrationWindowSeconds:86400};
}
