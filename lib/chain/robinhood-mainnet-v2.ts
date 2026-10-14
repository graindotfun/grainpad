import {ROBINHOOD_MAINNET_V3_FACTORY_ADDRESS, robinhoodMainnetV3Profile} from './robinhood-mainnet-v3.ts';
import {ROBINHOOD_CHAIN_MAINNET} from "./robinhood-mainnet.ts";
import type {EvmLaunchProfile} from "./evm-one-approval-launch.ts";

/**
 * One-approval factory (GrainMainnetFactoryV2). NOT deployed: stays null until the owner deploys the independently
 * reviewed candidate and a verified pin is committed. While null every V2 path is closed and the existing
 * two-signature flow for the deployed factory is unchanged.
 */
export const ROBINHOOD_MAINNET_V2_FACTORY_ADDRESS: string | null = null;

/** First block of the owner-verified V2 deployment. Discovery never scans earlier. null while undeployed. */
export const ROBINHOOD_MAINNET_V2_DEPLOYMENT_BLOCK: bigint | null = null;

export function robinhoodMainnetV2Profile(factory: string | null = ROBINHOOD_MAINNET_V3_FACTORY_ADDRESS ?? ROBINHOOD_MAINNET_V2_FACTORY_ADDRESS): EvmLaunchProfile | null {
  if (!factory) return null;
  if (ROBINHOOD_MAINNET_V3_FACTORY_ADDRESS && factory.toLowerCase() === ROBINHOOD_MAINNET_V3_FACTORY_ADDRESS.toLowerCase()) return robinhoodMainnetV3Profile(factory);
  return {
    networkId: "robinhood:mainnet", chainId: ROBINHOOD_CHAIN_MAINNET.chainId, factory,
    metadataOrigin: "https://grainpad.fun", metadataPath: "/api/robinhood/mainnet/metadata/{launchId}",
    assetOrigin: "https://grainpad.fun", registrationWindowSeconds: 86_400,
  };
}
