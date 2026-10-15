import {ROBINHOOD_MAINNET_V3_FACTORY_ADDRESS} from './robinhood-mainnet-v3.ts';
import {ROBINHOOD_MAINNET_METADATA_FACTORY_ADDRESS} from './robinhood-mainnet-v3-metadata.ts';
/**
 * Registry of the reviewed Robinhood mainnet factories. V1 is the deployed two-signature factory; V2 is the one-approval factory
 * (pinned only after an owner-verified deployment). A token belongs to exactly one factory, whose curve and fee vault the
 * market reader derives and cross-checks on-chain, so market, directory, history, trading and fee claims follow the token's own
 * factory and never another's.
 */
import {ROBINHOOD_MAINNET_FACTORY_ADDRESS} from "./robinhood-mainnet.ts";
import {ROBINHOOD_MAINNET_V2_FACTORY_ADDRESS} from "./robinhood-mainnet-v2.ts";
import {readRobinhoodMainnetLaunch, type MainnetLaunchRecord} from "./robinhood-mainnet-registration.ts";
import type {RobinhoodRecordStore} from "./robinhood-registration.ts";

export type MainnetFactoryKind = "v1" | "v2" | "v3" | "v3-metadata";
export type MainnetFactoryRef = {kind: MainnetFactoryKind; address: string};

export function mainnetFactories(pins: {v1: string | null; v2: string | null; v3?: string | null; metadata?: string | null} = {v1: ROBINHOOD_MAINNET_FACTORY_ADDRESS, v2: ROBINHOOD_MAINNET_V2_FACTORY_ADDRESS, v3: ROBINHOOD_MAINNET_V3_FACTORY_ADDRESS, metadata: ROBINHOOD_MAINNET_METADATA_FACTORY_ADDRESS}): MainnetFactoryRef[] {
  return [...(pins.v1 ? [{kind: "v1" as const, address: pins.v1.toLowerCase()}] : []), ...(pins.v2 ? [{kind: "v2" as const, address: pins.v2.toLowerCase()}] : []), ...(pins.v3 ? [{kind: "v3" as const, address: pins.v3.toLowerCase()}] : []), ...(pins.metadata ? [{kind: "v3-metadata" as const, address: pins.metadata.toLowerCase()}] : [])];
}
export const isReviewedMainnetFactory = (address: string, factories = mainnetFactories()) => factories.some(f => f.address === address.toLowerCase());
export const mainnetFactoryKind = (address: string, factories = mainnetFactories()): MainnetFactoryKind | null => factories.find(f => f.address === address.toLowerCase())?.kind ?? null;

/** The launch record for a token at whichever reviewed factory created it, or null (also null for a retired token). */
export async function findMainnetLaunch(storage: RobinhoodRecordStore, token: string, factories = mainnetFactories()): Promise<{record: MainnetLaunchRecord; kind: MainnetFactoryKind} | null> {
  for (const factory of factories) {
    const record = await readRobinhoodMainnetLaunch(storage, token, factory.address);
    if (record) return {record, kind: factory.kind};
  }
  return null;
}
