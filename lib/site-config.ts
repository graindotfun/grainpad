import {PLATFORM_SETTINGS} from "./platform-settings.mjs";
export const SITE = {
  name: "Grainpad",
  subtitle: "p/xmr research",
  projectWallet: PLATFORM_SETTINGS.founder,
  origin: "https://grainpad.fun",
  twitter: "https://x.com/GrainXMR",
  tokenName: "Grainpad",
  tokenSymbol: "GRAIN",
  maxCost: "0.022",
  description: "Grainpad combines a Solana launch interface using Raydium LaunchLab with an open p/xmr Monero registry experiment. GRAIN is the project token, with no XMR backing or claim on Monero test reserves.",
};
export type Network = "devnet" | "mainnet-beta";
export const NETWORKS = {
  devnet: { label: "Devnet · test funds", rpc: "https://api.devnet.solana.com", genesis: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG" },
  "mainnet-beta": { label: "Mainnet · real SOL", rpc: "https://solana-rpc.publicnode.com", genesis: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" },
};
