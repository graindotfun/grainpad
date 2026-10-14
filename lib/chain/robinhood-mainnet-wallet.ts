import type {Eip1193Provider, EvmScope} from "./evm-wallet.ts";
import {ROBINHOOD_CHAIN_MAINNET, robinhoodMainnetAddChainParams} from "./robinhood-mainnet.ts";
import {address} from "./robinhood-market.ts";

export type MainnetWalletSession = {
  networkId: "robinhood:mainnet"; chainId: 4663; account: string; provider: Eip1193Provider;
};

export async function assertRobinhoodMainnet(provider: Eip1193Provider): Promise<void> {
  const chain = await provider.request({method: "eth_chainId"});
  if (typeof chain !== "string" || !/^0x[0-9a-f]+$/i.test(chain) || BigInt(chain) !== 4663n) {
    throw new Error("Wallet is not on Robinhood Chain mainnet.");
  }
}

/** Invoked only by an owner's explicit connect action; never runs on import. */
export async function connectRobinhoodMainnet(provider: Eip1193Provider, selectAccount = false): Promise<MainnetWalletSession> {
  const params = robinhoodMainnetAddChainParams();
  try {
    await provider.request({method: "wallet_switchEthereumChain", params: [{chainId: params.chainId}]});
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? Number(error.code) : null;
    if (code !== 4902) throw error;
    await provider.request({method: "wallet_addEthereumChain", params: [params]});
  }
  await assertRobinhoodMainnet(provider);
  if (selectAccount) {
    try { await provider.request({method: "wallet_requestPermissions", params: [{eth_accounts: {}}]}); }
    catch (error) {
      const code = error && typeof error === "object" && "code" in error ? Number(error.code) : null;
      if (code !== 4200 && code !== -32601) throw error;
    }
  }
  const accounts = await provider.request({method: "eth_requestAccounts"});
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string") throw new Error("The wallet did not return an account.");
  // Account approval can take time; do not retain a session if the chain changed.
  await assertRobinhoodMainnet(provider);
  return {networkId: "robinhood:mainnet", chainId: ROBINHOOD_CHAIN_MAINNET.chainId, account: address(accounts[0]), provider};
}

/** Account/chain events invalidate reviewed quotes; no prompts or transactions. */
export function watchRobinhoodMainnetWallet(session: MainnetWalletSession, changed: (next: MainnetWalletSession | null) => void): () => void {
  const provider = session.provider;
  if (!provider.on || !provider.removeListener) return () => {};
  let active = true;
  const disconnect = () => { if (active) { active = false; changed(null); } };
  const accountsChanged = (accounts: unknown) => {
    if (!active) return;
    try {
      if (!Array.isArray(accounts) || typeof accounts[0] !== "string") { disconnect(); return; }
      changed({...session, account: address(accounts[0])});
    } catch { disconnect(); }
  };
  const chainChanged = (chain: unknown) => {
    if (typeof chain !== "string" || !/^0x[0-9a-f]+$/i.test(chain) || BigInt(chain) !== 4663n) disconnect();
  };
  provider.on("accountsChanged", accountsChanged);
  provider.on("chainChanged", chainChanged);
  provider.on("disconnect", disconnect);
  return () => {
    active = false;
    provider.removeListener?.("accountsChanged", accountsChanged);
    provider.removeListener?.("chainChanged", chainChanged);
    provider.removeListener?.("disconnect", disconnect);
  };
}

export type MainnetWalletChoice = {name: string; connect(selectAccount?: boolean): Promise<MainnetWalletSession>};
/** EIP-6963 discovery requests metadata only, never account access. */
export async function discoverRobinhoodMainnetWallets(scope: EvmScope = globalThis as EvmScope): Promise<MainnetWalletChoice[]> {
  const providers = new Map<Eip1193Provider, string>();
  for (const injected of [...(scope.ethereum?.providers ?? []), scope.ethereum, scope.phantom?.ethereum]) {
    if (injected && typeof injected.request === "function") providers.set(injected, injected.isPhantom ? "Phantom" : injected.isMetaMask ? "MetaMask" : "Browser wallet");
  }
  if (typeof window !== "undefined") {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{provider?: Eip1193Provider; info?: {name?: string}}>).detail;
      if (detail?.provider && typeof detail.provider.request === "function") providers.set(detail.provider, detail.info?.name ?? "Browser wallet");
    };
    window.addEventListener("eip6963:announceProvider", listener);
    try { window.dispatchEvent(new Event("eip6963:requestProvider")); await new Promise(resolve => setTimeout(resolve, 150)); }
    finally { window.removeEventListener("eip6963:announceProvider", listener); }
  }
  return [...providers].sort((a, b) => Number(/metamask/i.test(b[1])) - Number(/metamask/i.test(a[1]))).map(([provider, name]) => ({name, connect: (selectAccount = false) => connectRobinhoodMainnet(provider, selectAccount)}));
}
