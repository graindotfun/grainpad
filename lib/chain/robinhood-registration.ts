import {tokenRef, transactionRef} from "./networks.ts";
import {ROBINHOOD_CHAIN_TESTNET} from "./robinhood-testnet.ts";
import {LAUNCH_CREATED_TOPIC, tokenFromLaunchReceipt} from "./robinhood-create.ts";

const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

export type RobinhoodLaunchRecord = {
  networkId: "robinhood:testnet";
  chainId: typeof ROBINHOOD_CHAIN_TESTNET.chainId;
  tokenAddress: string;
  launchId: string;
  transactionHash: string;
  name: string;
  symbol: string;
  creator: string;
  factory: string;
};

export type RobinhoodRecordStore = {
  get(key: string): Promise<{text(): Promise<string>} | null>;
  put(key: string, value: string): Promise<unknown>;
};

function normalizeAddress(value: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/i.test(value)) throw new Error("EVM token address must be a 20-byte hex address.");
  return tokenRef("robinhood:testnet", value.toLowerCase()).tokenAddress;
}

export function robinhoodLaunchRecordKey(tokenAddress: string): string {
  return `robinhood-launches/${ROBINHOOD_CHAIN_TESTNET.chainId}/${normalizeAddress(tokenAddress)}`;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function hexWord(data: string, byteOffset: number): bigint {
  const start = byteOffset * 2;
  const word = data.slice(start, start + 64);
  if (!/^[0-9a-fA-F]{64}$/.test(word)) throw new Error("The launch receipt data is not decodable.");
  return BigInt(`0x${word}`);
}

/** Decode the non-indexed name and symbol from `LaunchCreated`. */
export function decodeLaunchCreatedData(data: string): {name: string; symbol: string} {
  if (!/^0x[0-9a-fA-F]*$/.test(data) || data.length < 2 + 64 * 2) throw new Error("The launch receipt data is not decodable.");
  const body = data.slice(2);
  const name = readAbiString(body, Number(hexWord(body, 0)));
  const symbol = readAbiString(body, Number(hexWord(body, 32)));
  if (utf8Length(name) < 1 || utf8Length(name) > 32 || utf8Length(symbol) < 1 || utf8Length(symbol) > 10) {
    throw new Error("The launch receipt has a name or symbol the factory would reject.");
  }
  return {name, symbol};
}

function readAbiString(body: string, byteOffset: number): string {
  if (!Number.isSafeInteger(byteOffset) || byteOffset < 0) throw new Error("The launch receipt data is not decodable.");
  const length = Number(hexWord(body, byteOffset));
  if (!Number.isSafeInteger(length) || length < 0 || length > 32) throw new Error("The launch receipt data is not decodable.");
  const start = (byteOffset + 32) * 2;
  const hex = body.slice(start, start + length * 2);
  if (hex.length !== length * 2) throw new Error("The launch receipt data is not decodable.");
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return new TextDecoder("utf-8", {fatal: true}).decode(bytes);
}

function sameAddress(value: unknown, expected: string): boolean {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/i.test(value) && normalizeAddress(value) === expected;
}

function topicAddress(topic: unknown): string {
  if (typeof topic !== "string" || !/^0x[0-9a-fA-F]{64}$/i.test(topic)) throw new Error("The launch receipt is missing the creator.");
  return normalizeAddress(`0x${topic.slice(-40)}`);
}

type LaunchLog = {address?: unknown; topics?: unknown; data?: unknown};

function launchLog(receipt: unknown, factory: string): LaunchLog {
  if (!receipt || typeof receipt !== "object") throw new Error("The create receipt is not available yet.");
  const value = receipt as {to?: unknown; logs?: unknown; status?: unknown};
  if (!sameAddress(value.to, factory)) throw new Error("The receipt was not sent to the configured factory.");
  if (!Array.isArray(value.logs)) throw new Error("The receipt did not include the new token.");
  const logs = value.logs.filter((log): log is LaunchLog => {
    if (!log || typeof log !== "object" || !("topics" in log) || !Array.isArray(log.topics)) return false;
    return typeof log.topics[0] === "string" && log.topics[0].toLowerCase() === LAUNCH_CREATED_TOPIC;
  });
  if (logs.length !== 1) throw new Error("The receipt did not include one launch.");
  const log = logs[0];
  if (typeof log.address !== "string" || !sameAddress(log.address, factory) || log.address.toLowerCase() === ZERO_ADDRESS) {
    throw new Error("The launch event was not emitted by the configured factory.");
  }
  return log;
}

export function describeRobinhoodReceipt(receipt: unknown, factory: string, transactionHash: string): RobinhoodLaunchRecord {
  const factoryAddress = tokenRef("robinhood:testnet", factory).tokenAddress;
  if (factoryAddress === ZERO_ADDRESS) throw new Error("The factory address is not configured.");
  const hash = transactionRef("robinhood:testnet", transactionHash).transactionHash;
  const checked = receipt as {status?: unknown; transactionHash?: unknown} | null;
  if (!checked || checked.status !== "0x1") throw new Error("The create receipt is not successful.");
  if (typeof checked.transactionHash !== "string" || checked.transactionHash.toLowerCase() !== hash) throw new Error("The create receipt hash differs.");
  const tokenAddress = tokenFromLaunchReceipt(receipt, null);
  if (!tokenAddress) throw new Error("The receipt did not include the new token.");
  const log = launchLog(receipt, factoryAddress);
  const topics = log.topics as unknown[];
  const launchId = typeof topics[1] === "string" ? topics[1].toLowerCase() : "";
  if (!/^0x[0-9a-f]{64}$/.test(launchId)) throw new Error("The receipt did not include the launch id.");
  if (tokenFromLaunchReceipt(receipt, launchId) !== tokenAddress) throw new Error("The receipt did not include the new token.");
  if (typeof log.data !== "string") throw new Error("The launch receipt data is not decodable.");
  const {name, symbol} = decodeLaunchCreatedData(log.data);
  return {
    networkId: "robinhood:testnet",
    chainId: ROBINHOOD_CHAIN_TESTNET.chainId,
    tokenAddress,
    launchId,
    transactionHash: hash,
    name,
    symbol,
    creator: topicAddress(topics[3]),
    factory: factoryAddress,
  };
}

async function readStored(storage: RobinhoodRecordStore, key: string): Promise<RobinhoodLaunchRecord | null> {
  const stored = await storage.get(key);
  if (!stored) return null;
  const parsed = JSON.parse(await stored.text()) as RobinhoodLaunchRecord;
  if (!parsed || parsed.networkId !== "robinhood:testnet" || parsed.chainId !== ROBINHOOD_CHAIN_TESTNET.chainId) return null;
  if (robinhoodLaunchRecordKey(parsed.tokenAddress) !== key) return null;
  return parsed;
}

export async function readRobinhoodLaunch(storage: RobinhoodRecordStore, tokenAddress: string): Promise<RobinhoodLaunchRecord | null> {
  return readStored(storage, robinhoodLaunchRecordKey(tokenAddress));
}

/**
 * Verify a create receipt on Robinhood Chain testnet and store one record.
 * The key is `(networkId, tokenAddress)` under `robinhood-launches/`, not a Solana launch key.
 */
function normalizeTransactionHash(value: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/i.test(value)) throw new Error("EVM transaction hash must be a 32-byte hex hash.");
  return transactionRef("robinhood:testnet", value.toLowerCase()).transactionHash;
}

export async function registerRobinhoodLaunch(
  input: {transactionHash: string; factory: string},
  deps: {storage: RobinhoodRecordStore; fetchReceipt?: (transactionHash: string) => Promise<unknown>},
): Promise<RobinhoodLaunchRecord> {
  const hash = normalizeTransactionHash(input.transactionHash);
  const receipt = await (deps.fetchReceipt ?? fetchRobinhoodReceipt)(hash);
  const record = describeRobinhoodReceipt(receipt, input.factory, hash);
  const key = robinhoodLaunchRecordKey(record.tokenAddress);
  if (key.startsWith("launches/")) throw new Error("Robinhood registration cannot use a Solana launch key.");
  const existing = await readStored(deps.storage, key);
  if (existing) {
    if (existing.transactionHash === record.transactionHash && existing.launchId === record.launchId) return existing;
    throw new Error("This token is already registered.");
  }
  await deps.storage.put(key, JSON.stringify(record));
  return record;
}

/** Read one receipt from the published testnet RPC. Tests pass their own reader. */
export async function fetchRobinhoodReceipt(transactionHash: string, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const url = new URL(ROBINHOOD_CHAIN_TESTNET.rpcUrl);
  if (url.hostname !== "rpc.testnet.chain.robinhood.com") throw new Error("Robinhood registration only reads the published testnet RPC.");
  const hash = normalizeTransactionHash(transactionHash);
  const rpc = async (method: string, params: unknown[]) => {
    const response = await fetchImpl(url.href, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params}),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Robinhood Chain testnet did not return a receipt.");
    const payload = await response.json() as {result?: unknown; error?: unknown};
    if (payload.error || payload.result == null) throw new Error("The create receipt is not available yet.");
    return payload.result;
  };
  if (await rpc("eth_chainId", []) !== "0xb626") throw new Error("Registration RPC is not testnet.");
  const receipt = await rpc("eth_getTransactionReceipt", [hash]) as {blockNumber?: unknown; blockHash?: unknown};
  if (typeof receipt.blockNumber !== "string" || !/^0x[0-9a-f]+$/i.test(receipt.blockNumber)) throw new Error("Receipt is not mined.");
  const head = await rpc("eth_blockNumber", []);
  if (typeof head !== "string" || !/^0x[0-9a-f]+$/i.test(head) || BigInt(head) < BigInt(receipt.blockNumber) + 2n) throw new Error("Wait for two testnet confirmations, then retry registration.");
  const block = await rpc("eth_getBlockByNumber", [receipt.blockNumber, false]) as {hash?: unknown};
  if (typeof receipt.blockHash !== "string" || block.hash !== receipt.blockHash) throw new Error("Receipt block is no longer canonical.");
  return receipt;
}

export async function listRobinhoodLaunches(
  storage: RobinhoodRecordStore & {list(options: {prefix: string; limit: number; cursor?: string}): Promise<{objects: {key: string}[]; truncated: boolean; cursor?: string}>},
  factory: string, cursor?: string,
): Promise<{records: RobinhoodLaunchRecord[]; nextCursor: string | null}> {
  if (cursor !== undefined && (cursor.length === 0 || cursor.length > 2000)) throw new Error("Invalid discovery cursor.");
  const prefix = `robinhood-launches/${ROBINHOOD_CHAIN_TESTNET.chainId}/`;
  const page = await storage.list({prefix, limit: 50, ...(cursor ? {cursor} : {})});
  const records = await Promise.all(page.objects.filter(object => object.key.startsWith(prefix)).map(async object => {
    try { return await readStored(storage, object.key); } catch { return null; }
  }));
  return {records: records.filter((record): record is RobinhoodLaunchRecord => !!record && record.factory === normalizeAddress(factory)),
    nextCursor: page.truncated ? page.cursor ?? null : null};
}
