/** Explicit reviewed generations; preserved records are always read with their own factory and ABI. */
import {ROBINHOOD_MAINNET_V2_FACTORY_ADDRESS, ROBINHOOD_MAINNET_V2_DEPLOYMENT_BLOCK, robinhoodMainnetV2Profile} from "./robinhood-mainnet-v2.ts";
import {ROBINHOOD_MAINNET_V3_FACTORY_ADDRESS, ROBINHOOD_MAINNET_V3_DEPLOYMENT_BLOCK} from "./robinhood-mainnet-v3.ts";
import {ROBINHOOD_MAINNET_METADATA_FACTORY_ADDRESS, RH_METADATA_FACTORY_DEPLOYMENT_BLOCK} from "./robinhood-mainnet-v3-metadata.ts";

export function configuredMainnetLaunchProfiles() {
  // Preserve the original HTTPS metadata URLs if a launch id also exists at an inline-metadata factory.
  return [
    {factory: ROBINHOOD_MAINNET_V2_FACTORY_ADDRESS, deploymentBlock: ROBINHOOD_MAINNET_V2_DEPLOYMENT_BLOCK},
    {factory: ROBINHOOD_MAINNET_V3_FACTORY_ADDRESS, deploymentBlock: ROBINHOOD_MAINNET_V3_DEPLOYMENT_BLOCK},
    {factory: ROBINHOOD_MAINNET_METADATA_FACTORY_ADDRESS, deploymentBlock: RH_METADATA_FACTORY_DEPLOYMENT_BLOCK},
  ].flatMap(({factory, deploymentBlock}) => {
    if (!factory || deploymentBlock === null) return [];
    const profile = robinhoodMainnetV2Profile(factory);
    return profile ? [{profile, deploymentBlock}] : [];
  });
}
export function mainnetLaunchProfileForFactory(factory: unknown) {
  return typeof factory === "string" ? configuredMainnetLaunchProfiles().find(p => p.profile.factory.toLowerCase() === factory.toLowerCase())?.profile ?? null : null;
}
