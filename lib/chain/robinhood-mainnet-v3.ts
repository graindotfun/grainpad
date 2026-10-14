import {ROBINHOOD_CHAIN_MAINNET} from './robinhood-mainnet.ts';
import type {EvmLaunchProfile} from './evm-one-approval-launch.ts';
/** Owner deployment 0x1b0f0d88e6e6fc8f08b7f0f9dd4b0d9e234f1354a323575b444b58638f4a53d8; finalized runtime and policy verified. */
export const ROBINHOOD_MAINNET_V3_FACTORY_ADDRESS: string | null = '0x1dfa8f0d14d273525cd26defd5c5ee2152f00967';
export const ROBINHOOD_MAINNET_V3_DEPLOYMENT_BLOCK: bigint | null = 88620713n;
export function robinhoodMainnetV3Profile(factory: string | null = ROBINHOOD_MAINNET_V3_FACTORY_ADDRESS): EvmLaunchProfile | null {
 if(!factory)return null;
 return {networkId:'robinhood:mainnet',chainId:ROBINHOOD_CHAIN_MAINNET.chainId,factory,marketModel:'uniswap-v3-continuous',metadataOrigin:'https://grainpad.fun',metadataPath:'/api/robinhood/mainnet/metadata/{launchId}',assetOrigin:'https://grainpad.fun',registrationWindowSeconds:86400};
}
