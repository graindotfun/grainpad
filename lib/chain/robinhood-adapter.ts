import {pendingAdapter, type LaunchNetworkAdapter} from "./adapter.ts";
import {launchNetwork} from "./networks.ts";
import {ROBINHOOD_FACTORY_ADDRESS} from "./robinhood-factory.ts";
import {buildRobinhoodCreateTransaction} from "./robinhood-create.ts";
import {address, bytes32, parseUnits18, publicTestnetRpc, readMarket, prepareTrade, readFees, prepareClaim, transactionStatus, type Rpc, type LaunchIdentity} from "./robinhood-market.ts";

/** Optional dependencies permit a local-node integration test without enabling the public app. */
export function createRobinhoodLaunchAdapter(deps: {
  factory?: string | null; rpc?: Rpc; quote?: string;
  resolveLaunch?: (token: string) => Promise<LaunchIdentity>;
} = {}): LaunchNetworkAdapter {
  const factory = deps.factory === undefined ? ROBINHOOD_FACTORY_ADDRESS : deps.factory;
  const rpc = deps.rpc ?? publicTestnetRpc;
  const pending = pendingAdapter(launchNetwork("robinhood:testnet"), () => "deployment", "The verified testnet factory is not configured.");
  const resolve = deps.resolveLaunch ?? (async (token: string) => {
    const response = await fetch("/api/robinhood/register?token=" + encodeURIComponent(token), {cache: "no-store"});
    if (!response.ok) throw new Error("Testnet token registration unavailable.");
    return await response.json() as LaunchIdentity;
  });
  async function market(token: unknown) {
    if (!factory) return pending.getMarket(token) as never;
    const identity = await resolve(address(token));
    if (address(identity.factory) !== address(factory) || address(identity.tokenAddress) !== address(token)) throw new Error("Registration identity differs.");
    return readMarket(rpc, identity, deps.quote);
  }
  async function trade(owner: unknown, token: unknown, side: unknown, amount: unknown, slippage: unknown) {
    if (!factory) return pending.getQuote(owner, token, side, amount, slippage);
    if (side !== "buy" && side !== "sell") throw new Error("Unknown trade side.");
    if (typeof slippage !== "number") throw new Error("Slippage must be integer basis points.");
    return prepareTrade(rpc, await market(token), address(owner), side, parseUnits18(amount), slippage);
  }
  return {
    ...pending,
    executionReady: factory != null,
    async createToken(input) {
      if (!factory) throw new Error("Robinhood Chain testnet create is unavailable. The factory address is not configured.");
      if (!input || typeof input !== "object") throw new Error("Robinhood create needs a name, symbol, and launch id.");
      const value = input as Record<string, unknown>;
      if (typeof value.name !== "string" || typeof value.symbol !== "string" || typeof value.launchId !== "string") throw new Error("Robinhood create needs a name, symbol, and launch id.");
      return buildRobinhoodCreateTransaction({name: value.name, symbol: value.symbol, launchId: value.launchId, factory});
    },
    buy: (owner, token, amount, slippage) => factory ? trade(owner, token, "buy", amount, slippage) : pending.buy(owner, token, amount, slippage),
    sell: (owner, token, amount, slippage) => factory ? trade(owner, token, "sell", amount, slippage) : pending.sell(owner, token, amount, slippage),
    getQuote: trade,
    getMarket: market,
    async getTransaction(hash) {
      if (!factory) return pending.getTransaction(hash);
      return transactionStatus(rpc, bytes32(hash));
    },
    // Robinhood rewards are per launch, not the Solana holder-tax program.
    async getCreatorRewards(owner, token) {
      if (!factory) return pending.getCreatorRewards(owner, token);
      address(owner);
      const state = await market(token);
      return {market: state, ...await readFees(rpc, state)};
    },
    async claimCreatorRewards(owner, kind, _maxCost, token) {
      if (!factory) return pending.claimCreatorRewards(owner, kind, _maxCost, token);
      if (kind !== "creator" && kind !== "platform" && kind !== "trade") throw new Error("Unknown fee bucket.");
      return prepareClaim(rpc, await market(token), address(owner), kind === "creator" ? 1 : kind === "platform" ? 0 : 2);
    },
  };
}
