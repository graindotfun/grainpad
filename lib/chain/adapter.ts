import type {LaunchNetwork, LaunchNetworkId} from "./networks.ts";

/** Product operations. Chain modules implement these. UI code should not branch on family. */
export const LAUNCH_OPERATIONS = [
  "createToken",
  "buy",
  "sell",
  "getQuote",
  "getTransaction",
  "getMarket",
  "getCreatorRewards",
  "claimCreatorRewards",
] as const;

export type LaunchOperation = (typeof LAUNCH_OPERATIONS)[number];

export interface LaunchNetworkAdapter {
  readonly network: LaunchNetwork;
  /** False until that network's execution stage exists. Methods throw LaunchNetworkPending. */
  readonly executionReady: boolean;
  createToken(input: unknown): Promise<unknown>;
  buy(owner: unknown, tokenAddress: unknown, amount: unknown, slippage: unknown): Promise<unknown>;
  sell(owner: unknown, tokenAddress: unknown, amount: unknown, slippage: unknown): Promise<unknown>;
  getQuote(owner: unknown, tokenAddress: unknown, side: unknown, amount: unknown, slippage: unknown): Promise<unknown>;
  getTransaction(transactionHash: unknown): Promise<unknown>;
  getMarket(tokenAddress: unknown): Promise<unknown>;
  getCreatorRewards(owner: unknown, quoteSymbol?: unknown): Promise<unknown>;
  claimCreatorRewards(owner: unknown, kind: unknown, maxCost: unknown, quoteSymbol?: unknown): Promise<unknown>;
}

export class UnknownLaunchNetworkError extends Error {
  readonly networkId: string;
  constructor(networkId: string) {
    super("Unknown launch network.");
    this.name = "UnknownLaunchNetworkError";
    this.networkId = networkId;
  }
}

export class LaunchNetworkPending extends Error {
  readonly networkId: LaunchNetworkId;
  readonly operation: LaunchOperation;
  readonly stage: string;
  constructor(networkId: LaunchNetworkId, operation: LaunchOperation, stage: string, detail: string) {
    super(detail);
    this.name = "LaunchNetworkPending";
    this.networkId = networkId;
    this.operation = operation;
    this.stage = stage;
  }
}

export function pendingAdapter(
  network: LaunchNetwork,
  stageFor: (operation: LaunchOperation) => string,
  detail: string,
): LaunchNetworkAdapter {
  const fail = (operation: LaunchOperation) => async (): Promise<unknown> => {
    throw new LaunchNetworkPending(network.id, operation, stageFor(operation), detail);
  };
  return {
    network,
    executionReady: false,
    createToken: fail("createToken"),
    buy: fail("buy"),
    sell: fail("sell"),
    getQuote: fail("getQuote"),
    getTransaction: fail("getTransaction"),
    getMarket: fail("getMarket"),
    getCreatorRewards: fail("getCreatorRewards"),
    claimCreatorRewards: fail("claimCreatorRewards"),
  };
}
