import {ROBINHOOD_CHAIN_MAINNET} from './chain/robinhood-mainnet.ts';
import {LAUNCH_NETWORKS, type LaunchNetworkId} from "./chain/networks.ts";

/** Chains a token can be launched on. Keys derive from the canonical network ids in `chain/networks.ts`, never from names or trading pairs. */
export type DisplayNetworkId = LaunchNetworkId | typeof ROBINHOOD_CHAIN_MAINNET.networkId;
export type ChainKey = "solana" | "robinhood";
export type ChainFilter = "all" | ChainKey;
export const CHAIN_FILTERS: readonly ChainFilter[] = ["all", "solana", "robinhood"];

export type ChainDisplay = {
  key: ChainKey;
  /** Canonical product name, from the Robinhood Chain documentation. */
  name: string;
  /** Short label for filters and compact chips. */
  shortLabel: string;
  /** Full-colour official logo shipped in /public (owner-supplied). Every chain's mark is shown in its own brand colours, never recoloured or muted. Null only for a chain whose asset is not committed yet. */
  logo: string | null;
  monogram: string;
};

export const CHAINS: Record<ChainKey, ChainDisplay> = {
  solana: {key: "solana", name: "Solana", shortLabel: "Solana", logo: "/brand/chains/solana.svg", monogram: "S"},
  robinhood: {key: "robinhood", name: "Robinhood Chain", shortLabel: "RH Chain", logo: "/brand/chains/robinhood.svg", monogram: "RH"},
};

export const CHAIN_FILTER_LABELS: Record<ChainFilter, string> = {all: "All chains", solana: CHAINS.solana.shortLabel, robinhood: CHAINS.robinhood.shortLabel};

/** `launch_index.network` values that belong to each chain. Robinhood rows are projected from the R2 registrations by `chain/robinhood-index.ts`. */
export const CHAIN_RECORD_NETWORKS: Record<ChainKey, readonly string[]> = {solana: ["mainnet-beta"], robinhood: [ROBINHOOD_CHAIN_MAINNET.networkId]};

export function isChainFilter(value: unknown): value is ChainFilter {
  return typeof value === "string" && (CHAIN_FILTERS as readonly string[]).includes(value);
}

/** Canonical network id for a stored launch record. Solana rows keep the cluster name they were stored with. */
export function recordNetworkId(record: {networkId?: unknown; network?: unknown}): DisplayNetworkId | null {
  if (record.networkId === "robinhood:mainnet") return "robinhood:mainnet";
  if (typeof record.networkId === "string" && Object.hasOwn(LAUNCH_NETWORKS, record.networkId)) return record.networkId as LaunchNetworkId;
  if (record.network === "mainnet-beta" || record.network === "devnet") return `solana:${record.network}`;
  return null;
}

export function chainOfNetwork(networkId: DisplayNetworkId | null): ChainKey | null {
  if (!networkId) return null;
  const family = networkId.split(":")[0];
  return family === "solana" || family === "robinhood" ? family : null;
}
