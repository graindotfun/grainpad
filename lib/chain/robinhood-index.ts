import {takeBudget} from '../shared-market-cache.mjs';
import {ROBINHOOD_CHAIN_TESTNET} from "./robinhood-testnet.ts";
import {describeRobinhoodReceipt, readRobinhoodLaunch, type RobinhoodLaunchRecord} from "./robinhood-registration.ts";

/** Registered Robinhood Chain launches live in R2 under `robinhood-launches/46630/{token}`, written by `/api/robinhood/register`.
 * The Solana directory reads D1 `launch_index`, so those records never appeared there. This module projects them into the same
 * index under network `robinhood:testnet` (platform_id = the verified factory), keyed by token address. R2 stays the source of truth. */
export const ROBINHOOD_NETWORK_ID = "robinhood:testnet";
const PREFIX = `robinhood-launches/${ROBINHOOD_CHAIN_TESTNET.chainId}/`;
const CURSOR_KEY = "robinhood-index-cursor:v1";

export type Db = {prepare(sql: string): {bind(...values: unknown[]): {run(): Promise<unknown>; first<T = unknown>(): Promise<T | null>; all<T = unknown>(): Promise<{results: T[]}>}}};
export type Store = {
  put(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<{text(): Promise<string>} | null>;
  list(options: {prefix: string; limit: number; cursor?: string}): Promise<{objects: {key: string; uploaded?: Date}[]; truncated: boolean; cursor?: string}>;
};
export type RobinhoodBlockTime = (record: RobinhoodLaunchRecord) => Promise<string | null>;

/** The directory record for a registered launch. `createdAt` is registration time (feed order only); `launchedAt` is the block time of the create transaction. */
export function robinhoodDirectoryRecord(record: RobinhoodLaunchRecord, createdAt: string, launchedAt: string | null) {
  return {
    ...record, mint: record.tokenAddress, network: ROBINHOOD_NETWORK_ID, platformId: record.factory, pool: record.launchId, platformName: "Grainpad",
    image: "", quoteAsset: "WETH", verification: "confirmed-on-chain" as const, createdAt, ...(launchedAt ? {launchedAt} : {}),
  };
}

export async function upsertRobinhoodRow(db: Db, record: RobinhoodLaunchRecord, createdAt: string, launchedAt: string | null, now = Date.now()) {
  const row = robinhoodDirectoryRecord(record, createdAt, launchedAt);
  // A launch time already proven stays; registration time never overwrites an existing row's order.
  await db.prepare(`INSERT INTO launch_index(network,mint,platform_id,creator,pool,created_at,record,indexed_at) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(network,mint) DO UPDATE SET record=CASE WHEN json_extract(excluded.record,'$.launchedAt') IS NULL AND json_extract(launch_index.record,'$.launchedAt') IS NOT NULL THEN json_set(excluded.record,'$.launchedAt',json_extract(launch_index.record,'$.launchedAt')) ELSE excluded.record END,indexed_at=excluded.indexed_at
    WHERE launch_index.platform_id=excluded.platform_id AND launch_index.creator=excluded.creator`)
    .bind(ROBINHOOD_NETWORK_ID, record.tokenAddress, record.factory, record.creator, record.launchId, createdAt, JSON.stringify(row), now).run();
}

/** Block time of the create transaction, verified against the same receipt checks registration uses. Null when the RPC cannot prove it. */
export function robinhoodBlockTimeReader(fetchImpl: typeof fetch = fetch): RobinhoodBlockTime {
  return async record => {
    const url = new URL(ROBINHOOD_CHAIN_TESTNET.rpcUrl);
    if (url.hostname !== "rpc.testnet.chain.robinhood.com") return null;
    const rpc = async (method: string, params: unknown[]) => {
      const response = await fetchImpl(url.href, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params}), signal: AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error("rpc");
      const body = await response.json() as {result?: unknown; error?: unknown};
      if (body.error || body.result == null) throw new Error("rpc");
      return body.result;
    };
    try {
      if (await rpc("eth_chainId", []) !== "0xb626") return null;
      const receipt = await rpc("eth_getTransactionReceipt", [record.transactionHash]) as {blockNumber?: string; blockHash?: string};
      const verified = describeRobinhoodReceipt(receipt, record.factory, record.transactionHash);
      if (verified.tokenAddress !== record.tokenAddress || verified.launchId !== record.launchId || !receipt.blockNumber) return null;
      const block = await rpc("eth_getBlockByNumber", [receipt.blockNumber, false]) as {hash?: string; timestamp?: string};
      if (block.hash !== receipt.blockHash || typeof block.timestamp !== "string" || !/^0x[0-9a-f]+$/i.test(block.timestamp)) return null;
      const seconds = Number(BigInt(block.timestamp));
      return Number.isSafeInteger(seconds) && seconds > 0 && seconds * 1000 <= Date.now() + 60_000 ? new Date(seconds * 1000).toISOString() : null;
    } catch { return null; }
  };
}

/** Index registered launches a few pages at a time, resuming from a stored cursor, and fill missing launch times (bounded RPC). */
export async function syncRobinhoodLaunches(input: {db: Db; storage: Store; factory: string; now?: number; blockTime?: RobinhoodBlockTime; maxPages?: number; maxRpc?: number}) {
  const {db, storage, factory} = input, now = input.now ?? Date.now(), blockTime = input.blockTime ?? robinhoodBlockTimeReader();
  if (!await takeBudget(db, `robinhood-directory-sync:v1:${factory.toLowerCase()}`, 1, 1, 30_000, now)) return {indexed: 0, nextCursor: null};
  let rpcLeft = input.maxRpc ?? 3, indexed = 0;
  const stored = await db.prepare("SELECT value FROM market_cache WHERE key=?").bind(CURSOR_KEY).first<{value: string | null}>();
  let cursor: string | undefined = stored?.value || undefined;
  for (let page = 0; page < (input.maxPages ?? 2); page++) {
    const listed = await storage.list({prefix: PREFIX, limit: 50, ...(cursor ? {cursor} : {})});
    for (const object of listed.objects) {
      if (!object.key.startsWith(PREFIX)) continue;
      let record: RobinhoodLaunchRecord | null = null;
      try { record = await readRobinhoodLaunch(storage, object.key.slice(PREFIX.length)); } catch { record = null; }
      if (!record || record.factory !== factory.toLowerCase()) continue;
      const existing = await db.prepare("SELECT json_extract(record,'$.launchedAt') AS launched, created_at FROM launch_index WHERE network=? AND mint=?").bind(ROBINHOOD_NETWORK_ID, record.tokenAddress).first<{launched: string | null; created_at: string}>();
      if (existing?.launched) continue;
      let launchedAt: string | null = null;
      if (rpcLeft > 0) { rpcLeft -= 1; launchedAt = await blockTime(record); }
      await upsertRobinhoodRow(db, record, existing?.created_at ?? (object.uploaded ?? new Date(now)).toISOString(), launchedAt, now);
      indexed += 1;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
    if (!cursor) break;
  }
  await db.prepare("INSERT INTO market_cache(key,value,updated_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(CURSOR_KEY, cursor ?? "", now, now).run();
  return {indexed, nextCursor: cursor ?? null};
}
