import type {EvmLaunchProfile} from "./evm-one-approval-launch.ts";

/** Existing owner-deployed GMETA factory. These facts are not public-product or native-publication activation. */
export const RH_METADATA_FACTORY_CANDIDATE = "0x5484e14cc34720091d916f18eee303947035d116";
export const RH_METADATA_FACTORY_DEPLOYMENT_BLOCK = 88884670n;
export const RH_METADATA_FACTORY_RUNTIME_SHA256 = "81cdf11d154463aa02f17c89e5ff3e63cffa9774a5133e0228165f0f125f227e";
/** Release candidate pin; installation and production deployment require exact independent acceptance. */
export const ROBINHOOD_MAINNET_METADATA_FACTORY_ADDRESS: string | null = RH_METADATA_FACTORY_CANDIDATE;

/** Explicit candidate profile is for isolated verification; null explicitly closes an isolated profile. */
export function robinhoodMainnetMetadataProfile(factory: string | null = ROBINHOOD_MAINNET_METADATA_FACTORY_ADDRESS): EvmLaunchProfile | null {
  if (factory === null) return null;
  if (factory.toLowerCase() !== RH_METADATA_FACTORY_CANDIDATE) throw Error("Unreviewed direct metadata factory.");
  return {networkId: "robinhood:mainnet", chainId: 4663, factory: RH_METADATA_FACTORY_CANDIDATE,
    marketModel: "uniswap-v3-continuous", metadataMode: "inline-direct", metadataOrigin: "https://grainpad.fun",
    metadataPath: "/api/robinhood/mainnet/metadata/{launchId}", assetOrigin: "https://grainpad.fun", registrationWindowSeconds: 86400};
}
