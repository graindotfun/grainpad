import type {LaunchNetworkAdapter} from "./adapter.ts";
import {launchNetwork} from "./networks.ts";

type LaunchModule = typeof import("../launch.ts");
type TradeModule = typeof import("../trade.ts");
type MarketModule = typeof import("../server-market.ts");
type FeesModule = typeof import("../fees.ts");

/**
 * Where each product operation already lives. The adapter forwards arguments
 * and does not rebuild transactions, fees, or locks.
 *
 * Not bound here, on purpose:
 * - graduated creator/LP claims stay `prepareGraduatedClaim` in `lib/graduated-fees.ts`
 * - indexed creator history stays `creatorFeeTotals` in `lib/event-history.mjs`
 * - holder transfer-tax rewards stay the Token-2022 operator, not this claim
 */
export const SOLANA_OPERATION_BINDINGS = {
  createToken: {module: "lib/launch.ts", exportName: "prepareLaunch"},
  buy: {module: "lib/trade.ts", exportName: "prepareTrade", side: "buy"},
  sell: {module: "lib/trade.ts", exportName: "prepareTrade", side: "sell"},
  getQuote: {module: "lib/trade.ts", exportName: "prepareTrade"},
  getTransaction: {module: "lib/launch.ts", exportName: "resolveSubmitted"},
  getMarket: {module: "lib/server-market.ts", exportName: "serverMarket"},
  getCreatorRewards: {module: "lib/fees.ts", exportName: "readFees"},
  claimCreatorRewards: {module: "lib/fees.ts", exportName: "prepareFeeClaim"},
} as const;

export type SolanaPorts = {
  launch(): Promise<{
    prepareLaunch: LaunchModule["prepareLaunch"];
    resolveSubmitted: LaunchModule["resolveSubmitted"];
  }>;
  trade(): Promise<{
    prepareTrade: TradeModule["prepareTrade"];
  }>;
  market(): Promise<{
    serverMarket: MarketModule["serverMarket"];
  }>;
  fees(): Promise<{
    readFees: FeesModule["readFees"];
    prepareFeeClaim: FeesModule["prepareFeeClaim"];
  }>;
};

export const defaultSolanaPorts: SolanaPorts = {
  launch: () => import("../launch.ts"),
  trade: () => import("../trade.ts"),
  market: () => import("../server-market.ts"),
  fees: () => import("../fees.ts"),
};

export function createSolanaLaunchAdapter(ports: SolanaPorts = defaultSolanaPorts): LaunchNetworkAdapter {
  return {
    network: launchNetwork("solana:mainnet-beta"),
    executionReady: true,
    async createToken(input) {
      return (await ports.launch()).prepareLaunch(input as Parameters<LaunchModule["prepareLaunch"]>[0]);
    },
    async buy(owner, tokenAddress, amount, slippage) {
      return (await ports.trade()).prepareTrade(owner as string, tokenAddress as string, "buy", amount as string, slippage as string);
    },
    async sell(owner, tokenAddress, amount, slippage) {
      return (await ports.trade()).prepareTrade(owner as string, tokenAddress as string, "sell", amount as string, slippage as string);
    },
    async getQuote(owner, tokenAddress, side, amount, slippage) {
      return (await ports.trade()).prepareTrade(owner as string, tokenAddress as string, side as "buy" | "sell", amount as string, slippage as string);
    },
    async getTransaction(transactionHash) {
      return (await ports.launch()).resolveSubmitted(transactionHash as string);
    },
    async getMarket(tokenAddress) {
      return (await ports.market()).serverMarket(tokenAddress as string);
    },
    async getCreatorRewards(owner, quoteSymbol) {
      return (await ports.fees()).readFees(owner as string, quoteSymbol as string | undefined);
    },
    async claimCreatorRewards(owner, kind, maxCost, quoteSymbol) {
      return (await ports.fees()).prepareFeeClaim(owner as string, kind as "creator" | "platform", maxCost as string, quoteSymbol as string | undefined);
    },
  };
}
