import {tokenRef, type LaunchNetworkId} from "./networks.ts";
import {ROBINHOOD_CHAIN_TESTNET, robinhoodChainIdHex} from "./robinhood-testnet.ts";
import {assertTestnet, submitTransaction} from "./robinhood-market.ts";
import {walletChoices, type WalletLoaders} from "./wallet-session.ts";

/** `cast sig "create(string,string,bytes32)"` on GrainFactory. Not a deployment transaction. */
export const GRAIN_CREATE_SELECTOR = "0x30f990cb";

const LAUNCH_ID = /^0x[0-9a-fA-F]{64}$/;
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

export type RobinhoodCreateInput = {
  factory: string;
  name: string;
  symbol: string;
  launchId: string;
};

export type RobinhoodCreateTransaction = {
  networkId: "robinhood:testnet";
  chainId: typeof ROBINHOOD_CHAIN_TESTNET.chainId;
  to: string;
  data: string;
  value: "0x0";
  launchId: string;
};

export type EvmRequest = {
  request(args: {method: string; params?: unknown[] | undefined}): Promise<unknown>;
};

export type CreateOutcome = {
  state: "pending" | "success" | "failure";
  transactionHash: string | null;
  launchId: string | null;
  tokenAddress: string | null;
  reason: string | null;
};

/** `LaunchCreated(bytes32,address,address,string,string)`. Token address is topic 2. */
export const LAUNCH_CREATED_TOPIC = "0xea72228796bce39ef35ee7d2378ac50eb80848108ccda3685d539d03177dbf97";

export type ReceiptWait = {
  attempts?: number;
  pause?: (ms: number) => Promise<void>;
};

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function hexBytes(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

function encodeAbiString(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const length = bytes.length.toString(16).padStart(64, "0");
  const data = hexBytes(bytes).padEnd(Math.ceil(bytes.length / 32) * 64, "0");
  return length + data;
}

function word(value: number): string {
  return value.toString(16).padStart(64, "0");
}

/**
 * Unsigned call to `GrainFactory.create`. Grainpad does not deploy the factory.
 * The caller supplies a testnet factory address.
 */
export function buildRobinhoodCreateTransaction(input: RobinhoodCreateInput): RobinhoodCreateTransaction {
  if (utf8Length(input.name) < 1 || utf8Length(input.name) > 32) throw new Error("Token name must be 1 to 32 bytes.");
  if (utf8Length(input.symbol) < 1 || utf8Length(input.symbol) > 10) throw new Error("Token symbol must be 1 to 10 bytes.");
  if (!LAUNCH_ID.test(input.launchId)) throw new Error("Launch id must be a 32-byte hex value.");
  const factory = tokenRef("robinhood:testnet", input.factory).tokenAddress;
  if (factory === ZERO_ADDRESS) throw new Error("Factory address is missing. Grainpad has not deployed the testnet factory.");
  const nameTail = encodeAbiString(input.name);
  const symbolTail = encodeAbiString(input.symbol);
  const nameOffset = 32 * 3;
  const symbolOffset = nameOffset + nameTail.length / 2;
  const data = GRAIN_CREATE_SELECTOR
    + word(nameOffset)
    + word(symbolOffset)
    + input.launchId.slice(2).toLowerCase()
    + nameTail
    + symbolTail;
  return {
    networkId: "robinhood:testnet",
    chainId: ROBINHOOD_CHAIN_TESTNET.chainId,
    to: factory,
    data,
    value: "0x0",
    launchId: input.launchId.toLowerCase(),
  };
}

/** Solana selections never load the EVM wallet module. */
export async function openCreateWallet(networkId: LaunchNetworkId, loaders?: WalletLoaders) {
  if (networkId === "solana:mainnet-beta") throw new Error("Solana create stays on the launch screen.");
  if (networkId === "solana:devnet") throw new Error("Solana devnet is not a Grainpad launch network.");
  return walletChoices(networkId, loaders);
}

export function robinhoodCreateCall(tx: RobinhoodCreateTransaction, from: string) {
  if (tx.networkId !== "robinhood:testnet" || tx.chainId !== ROBINHOOD_CHAIN_TESTNET.chainId || tx.value !== "0x0") {
    throw new Error("Create transaction must target Robinhood Chain testnet.");
  }
  if (!tx.data.startsWith(GRAIN_CREATE_SELECTOR)) throw new Error("Create transaction is not a factory create call.");
  return {
    from: tokenRef("robinhood:testnet", from).tokenAddress,
    to: tx.to,
    data: tx.data,
    value: tx.value,
    chainId: robinhoodChainIdHex(),
  };
}

function rejected(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error.code === 4001 || error.code === "4001");
}

function failure(reason: string, transactionHash: string | null, launchId: string | null): CreateOutcome {
  return {state: "failure", transactionHash, launchId, tokenAddress: null, reason};
}

function pending(transactionHash: string, launchId: string | null): CreateOutcome {
  return {state: "pending", transactionHash, launchId, tokenAddress: null, reason: null};
}

function topicAddress(topic: unknown): string | null {
  if (typeof topic !== "string" || !/^0x[0-9a-fA-F]{64}$/i.test(topic)) return null;
  const address = `0x${topic.slice(-40).toLowerCase()}`;
  if (!/^0x[0-9a-f]{40}$/.test(address) || address === ZERO_ADDRESS) return null;
  return address;
}

/** Read the token address from `LaunchCreated`. Indexed fields are launch id, token, creator. */
export function tokenFromLaunchReceipt(receipt: unknown, launchId: string | null, factory?: string): string | null {
  if (!receipt || typeof receipt !== "object" || !("logs" in receipt) || !Array.isArray(receipt.logs)) return null;
  const expected = launchId?.toLowerCase() ?? null;
  for (const log of receipt.logs) {
    if (!log || typeof log !== "object" || !("topics" in log) || !Array.isArray(log.topics) || log.topics.length < 3) continue;
    if (factory && (!("address" in log) || typeof log.address !== "string" || log.address.toLowerCase() !== factory.toLowerCase())) continue;
    const [signature, id, token] = log.topics;
    if (typeof signature !== "string" || signature.toLowerCase() !== LAUNCH_CREATED_TOPIC) continue;
    if (typeof id !== "string" || (expected && id.toLowerCase() !== expected)) continue;
    const address = topicAddress(token);
    if (address) return address;
  }
  return null;
}

function succeeded(status: unknown): boolean | null {
  if (status === 1 || status === "0x1" || status === "0x01") return true;
  if (status === 0 || status === "0x0" || status === "0x00") return false;
  if (typeof status === "string" && /^0x[0-9a-fA-F]+$/.test(status)) {
    const value = BigInt(status);
    if (value === 1n) return true;
    if (value === 0n) return false;
  }
  return null;
}

/** Map a wallet receipt to the create screen state. A missing receipt stays pending. */
export function receiptOutcome(transactionHash: string, receipt: unknown, launchId: string | null, factory?: string): CreateOutcome {
  const hash = transactionHash.toLowerCase();
  if (receipt == null) return pending(hash, launchId);
  if (typeof receipt !== "object" || !("status" in receipt)) return failure("The wallet returned a receipt without a status.", hash, launchId);
  if (factory && (!("transactionHash" in receipt) || typeof receipt.transactionHash !== "string" || receipt.transactionHash.toLowerCase() !== hash || !("to" in receipt) || typeof receipt.to !== "string" || receipt.to.toLowerCase() !== factory.toLowerCase())) return failure("Receipt identity differs from the create.", hash, launchId);
  const status = succeeded(receipt.status);
  if (status === false) return failure("The create transaction reverted.", hash, launchId);
  if (status !== true) return failure("The wallet returned an unknown receipt status.", hash, launchId);
  const tokenAddress = tokenFromLaunchReceipt(receipt, launchId, factory);
  if (!tokenAddress) return failure("The receipt did not include the new token.", hash, launchId);
  return {state: "success", transactionHash: hash, launchId, tokenAddress, reason: null};
}

/**
 * Ask the connected wallet to send the prepared create and wait for its receipt.
 * Does not call the Robinhood RPC from Grainpad. The wallet holds the key.
 */
export async function submitRobinhoodCreate(provider: EvmRequest, tx: RobinhoodCreateTransaction, from: string, wait?: ReceiptWait): Promise<CreateOutcome> {
  const call = robinhoodCreateCall(tx, from);
  let hash: unknown;
  try {
    hash = await submitTransaction(provider, call);
  } catch (error) {
    if (rejected(error)) return failure("The wallet rejected the create.", null, tx.launchId);
    return failure(error instanceof Error ? error.message : "The wallet did not send the create.", null, tx.launchId);
  }
  const normalized = normalizeHash(hash);
  if (!normalized) return failure("The wallet did not return a transaction hash.", null, tx.launchId);
  return readRobinhoodCreateReceipt(provider, normalized, {...wait, launchId: tx.launchId, factory: tx.to});
}

function normalizeHash(value: unknown): string | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/i.test(value)) return null;
  return value.toLowerCase();
}

export async function readRobinhoodCreateReceipt(provider: EvmRequest, transactionHash: string, wait?: ReceiptWait & {launchId?: string | null; factory?: string}): Promise<CreateOutcome> {
  const hash = normalizeHash(transactionHash);
  const launchId = wait?.launchId ?? null;
  if (!hash) return failure("Transaction hash must be 32 bytes.", null, launchId);
  if (wait?.factory) {
    try { await assertTestnet((method, params) => provider.request({method, params})); }
    catch { return failure("Switch back to Robinhood Chain testnet to check this receipt.", hash, launchId); }
  }
  const attempts = wait?.attempts ?? 15;
  const pause = wait?.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let receipt: unknown;
    try { receipt = await provider.request({method: "eth_getTransactionReceipt", params: [hash]}); }
    catch { return pending(hash, launchId); }
    const outcome = receiptOutcome(hash, receipt, launchId, wait?.factory);
    if (outcome.state !== "pending") return outcome;
    if (attempt < attempts - 1) await pause(400);
  }
  return pending(hash, launchId);
}
