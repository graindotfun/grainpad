/**
 * Durable, write-ahead journal for the one-approval launch. Two independent stores (localStorage and IndexedDB, injected
 * so the logic is testable). The entry is written BEFORE the wallet is asked; it survives refresh, tab closure,
 * timeouts and an unknown transaction outcome, and it is never cleared by anything but an explicit finished-launch action.
 * Keys are distinct from the existing launch drafts, so existing drafts, receipts and the launch picker are untouched.
 */
import {assertAddress, assertBytes32, decodeCreateAndLaunchHeader, keccakHex} from "./evm-one-approval-launch.ts";
import type {SubmissionJournal} from "./one-approval-launch-client.ts";

export type KeyValueStore = {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
};
export type V2JournalEntry = {
  version: 1; launchId: string; creator: string; digest: string; startBlock: string | null; startedAt: number;
  /** The chain this launch was submitted on; recovery and clearing are only ever evaluated against it. */
  chainId: string | null;
  /** Absent on legacy entries; absence never authorizes a factory-specific clear. */
  factory?: string | null;
  transactionHash: string | null;
  /** Latest block timestamp (seconds) at which this launch's transaction can still execute; null for entries that predate it. */
  deadline: string | null;
  /** keccak256 of the exact calldata the wallet was asked to send; null for adopted or older entries. */
  dataHash: string | null;
};
export const v2JournalKey = (account: string) => `grainpad:rh-v2:launch:${assertAddress(account)}`;

function parse(value: unknown): V2JournalEntry | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<V2JournalEntry>;
  try {
    if (v.version !== 1 || typeof v.startedAt !== "number") return null;
    return {version: 1, launchId: assertBytes32(String(v.launchId)), creator: assertAddress(String(v.creator)), digest: assertBytes32(String(v.digest)),
      startBlock: typeof v.startBlock === "string" && /^\d+$/.test(v.startBlock) ? v.startBlock : null, startedAt: v.startedAt,
      chainId: typeof v.chainId === "string" && /^\d+$/.test(v.chainId) ? v.chainId : null,
      factory: v.factory ? assertAddress(String(v.factory)) : null,
      transactionHash: v.transactionHash ? assertBytes32(String(v.transactionHash)) : null,
      deadline: typeof v.deadline === "string" && /^\d+$/.test(v.deadline) ? v.deadline : null,
      dataHash: typeof v.dataHash === "string" && /^0x[0-9a-f]{64}$/.test(v.dataHash) ? v.dataHash : null};
  } catch { return null; }
}

export type JournalRead = {entry: V2JournalEntry | null; conflict: boolean};

export type JournalLock = <T>(name: string, job: () => Promise<T>) => Promise<T>;
type Locks = {request<T>(name: string, cb: () => Promise<T>): Promise<T>};
/**
 * Exclusive across every tab of the same browser profile via the Web Locks API. Fails CLOSED without it: a read-then-write
 * journal cannot exclude a second tab on its own (a stale read in one tab can interleave with the other's complete
 * start-and-verify), so a browser that cannot lock is not allowed to launch rather than risk two launches from one wallet.
 */
export const makeJournalLock = (locks: () => Locks | undefined): JournalLock => (name, job) => {
  const l = locks();
  if (!l) return Promise.reject(new Error("This browser cannot guard against a second open tab. Use a current browser to launch."));
  return l.request(name, job);
};
export const browserJournalLock: JournalLock = makeJournalLock(() => (globalThis as {navigator?: {locks?: Locks}}).navigator?.locks);
const unlocked: JournalLock = (_name, job) => job();

export function createLaunchJournal(stores: readonly KeyValueStore[], account: string, options: {startBlock?: () => Promise<string | null>; now?: () => number; lock?: JournalLock} = {}) {
  const lock = options.lock ?? unlocked;
  const key = v2JournalKey(account);
  const writeAll = async (entry: V2JournalEntry) => {
    const results = await Promise.allSettled(stores.map(store => store.set(key, entry)));
    if (!results.some(r => r.status === "fulfilled")) throw new Error("Browser recovery storage is unavailable. Nothing was sent to your wallet.");
  };
  async function read(): Promise<JournalRead> {
    const entries = (await Promise.all(stores.map(async store => { try { return parse(await store.get(key)); } catch { return null; } }))).filter((e): e is V2JournalEntry => !!e);
    if (entries.length === 0) return {entry: null, conflict: false};
    // Stores that disagree about WHICH launch, or about the transaction recorded for the same launch, are a conflict: every record
    // is kept untouched and nothing is cleared or overwritten automatically. (A hash in one store and none in the other is just
    // an interrupted write and resolves to the hash.)
    const ids = new Set(entries.map(e => e.launchId));
    const hashes = new Set(entries.map(e => e.transactionHash).filter((h): h is string => !!h));
    const chains = new Set(entries.map(e => e.chainId).filter((c): c is string => !!c));
    const factories = new Set(entries.map(e => e.factory ?? "legacy"));
    const best = entries.find(e => e.transactionHash) ?? entries[0];
    return {entry: best, conflict: ids.size > 1 || hashes.size > 1 || chains.size > 1 || factories.size > 1};
  }
  const journal: SubmissionJournal & {read: typeof read; clear: (entry: {launchId: string; transactionHash: string | null}) => Promise<boolean>; markRejected: (entry: {launchId: string}) => Promise<void>} = {
    markStarted: ({launchId, creator, digest, deadline, dataHash, chainId, factory}) => lock(key, async () => {
      const existing = await read();
      if (existing.entry) throw new Error("A launch from this wallet is already in progress or unresolved. Recover it; do not create again.");
      let startBlock: string | null = null;
      try { startBlock = (await options.startBlock?.()) ?? null; } catch { startBlock = null; }
      await writeAll({version: 1, launchId: assertBytes32(launchId), creator: assertAddress(creator), digest: assertBytes32(digest), startBlock, startedAt: (options.now ?? Date.now)(), transactionHash: null, factory: factory ? assertAddress(factory) : null, chainId: chainId === undefined ? null : chainId.toString(),
        deadline: deadline === undefined ? null : deadline.toString(), dataHash: dataHash ? assertBytes32(dataHash) : null});
      // Defense in depth behind the lock: verify our own write; a rival's entry is never removed.
      const check = await read();
      if (check.conflict || check.entry?.launchId !== assertBytes32(launchId)) throw new Error("Another tab started a launch for this wallet. Use that tab, or recover it; do not create again.");
    }),
    markSent: ({launchId, transactionHash}) => lock(key, async () => {
      const {entry: current, conflict} = await read();
      if (conflict) throw new Error("Conflicting launch records are preserved. Nothing was changed.");
      if (!current || current.launchId !== assertBytes32(launchId)) throw new Error("Launch journal is missing. Record the transaction hash manually.");
      const next = assertBytes32(transactionHash);
      // A recorded hash is never replaced by a different one; the same hash is an idempotent no-op.
      if (current.transactionHash && current.transactionHash !== next) throw new Error("This launch already has a different transaction hash recorded. It was not overwritten.");
      if (current.transactionHash === next) return;
      await writeAll({...current, transactionHash: next});
    }),
    markRejected: ({launchId}) => lock(key, async () => {
      const {entry: current, conflict} = await read();
      // Never release an entry that already has a transaction hash, or any record while the stores disagree.
      if (!conflict && current && current.launchId === assertBytes32(launchId) && current.transactionHash === null) await Promise.allSettled(stores.map(store => store.remove(key)));
    }),
    read,
    /**
     * Compare-and-delete under the lock: removes the entry only if it is still EXACTLY this launch id and transaction hash
     * (null matches a hash-less entry). A different launch, a hash recorded meanwhile, or disagreeing stores leave it untouched.
     */
    clear: entry => lock(key, async () => {
      const {entry: current, conflict} = await read();
      if (conflict || !current || current.launchId !== assertBytes32(entry.launchId) || current.transactionHash !== (entry.transactionHash ? assertBytes32(entry.transactionHash) : null)) return false;
      await Promise.allSettled(stores.map(store => store.remove(key)));
      return true;
    }),
  };
  return journal;
}

/** A hash the wallet never returned: find the creation transaction from the launch id, using the wallet's own RPC. */
export async function recoverCreationTransaction(rpc: (method: string, params: unknown[]) => Promise<unknown>, factory: string, launchId: string, topic: string, fromBlock: string | null): Promise<string | null> {
  const logs = await rpc("eth_getLogs", [{address: assertAddress(factory), fromBlock: fromBlock ? "0x" + BigInt(fromBlock).toString(16) : "earliest", toBlock: "latest", topics: [topic, assertBytes32(launchId)]}]);
  if (!Array.isArray(logs) || logs.length === 0) return null;
  if (logs.length > 1) throw new Error("More than one creation found for this launch id.");
  const hash = (logs[0] as {transactionHash?: unknown}).transactionHash;
  return typeof hash === "string" ? assertBytes32(hash) : null;
}

/**
 * Launches this wallet created recently, found on-chain. Guards the one case a browser journal cannot: storage cleared
 * or a different browser. The caller treats a hit as "recover this first", never as permission to create again silently.
 */
export async function recentCreatorLaunches(rpc: (method: string, params: unknown[]) => Promise<unknown>, factory: string | readonly string[], creator: string, topic: string, lookbackBlocks = 200_000n, deploymentBlock = 0n): Promise<Array<{launchId: string; transactionHash: string}>> {
  const factories = typeof factory === "string" ? [assertAddress(factory)] : [...new Set(factory.map(assertAddress))];
  if (!factories.length || factories.length > 8) throw Error("Recent launches unavailable.");
  const filterAddress = typeof factory === "string" ? factories[0] : factories;
  const latest = await rpc("eth_blockNumber", []);
  if (typeof latest !== "string" || !/^0x[0-9a-f]+$/i.test(latest)) throw new Error("Block number unavailable.");
  const head = BigInt(latest);
  if (lookbackBlocks < 0n || lookbackBlocks > 200_000n || deploymentBlock < 0n || deploymentBlock > head) throw new Error("Recent launches unavailable.");
  const lookbackStart = head > lookbackBlocks ? head - lookbackBlocks : 0n;
  const from = deploymentBlock > lookbackStart ? deploymentBlock : lookbackStart;
  const padded = "0x" + assertAddress(creator).slice(2).padStart(64, "0");
  const found: Array<{launchId: string; transactionHash: string}> = [];
  // Keep the entire prior lookback, but never ask a wallet RPC for a huge range.
  // Pin every page to the captured head. Any failed page aborts the launch check.
  for (let next = from; next <= head; next += 2000n) {
    const to = next + 1999n < head ? next + 1999n : head;
    let logs: unknown;
    try {
      logs = await rpc("eth_getLogs", [{address: filterAddress, fromBlock: "0x" + next.toString(16), toBlock: "0x" + to.toString(16), topics: [topic, null, null, padded]}]);
    } catch {
      throw new Error("Recent-launch history could not be checked. No new wallet transaction was requested by this launch attempt. Keep your form and check your wallet activity before retrying.");
    }
    if (!Array.isArray(logs) || found.length + logs.length > 50) throw new Error("Recent launches unavailable.");
    if (typeof factory !== "string" && logs.some(l => !factories.includes(assertAddress(String((l as {address?: string}).address))))) throw Error("Recent launches unavailable.");
    found.push(...logs.map(l => ({launchId: assertBytes32(String((l as {topics?: string[]}).topics?.[1])), transactionHash: assertBytes32(String((l as {transactionHash?: string}).transactionHash))})));
  }
  return found;
}

export type NothingSentProof = {safe: boolean; reason: string};
type Rpc = (method: string, params: unknown[]) => Promise<unknown>;
/** Throws unless the RPC answers for exactly the expected chain. */
export async function assertChain(rpc: Rpc, expected: bigint): Promise<void> {
  const id = await rpc("eth_chainId", []);
  let actual: bigint | null = null;
  try { actual = typeof id === "string" || typeof id === "number" || typeof id === "bigint" ? BigInt(id) : null; } catch { actual = null; }
  if (actual === null) throw new Error("Network unavailable.");
  if (actual !== expected) throw new Error("The wallet is on a different network. Switch back to the launch network; nothing was cleared.");
}
const hexNumber = (value: unknown, what: string): bigint => {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) throw new Error(`${what} unavailable.`);
  return BigInt(value);
};
/**
 * May an entry WITHOUT a transaction hash be released? Neither `tokenOf(launchId) == 0` nor a node's pending nonce is proof: a
 * transaction can sit in another node's mempool or be broadcast by the wallet after a lost response. The factory rejects any
 * call after the signed `deadline`, so the proof is: a FINALIZED block is already past that deadline and, up to that block, the
 * factory emitted no creation for this launch id. After that, no copy of the transaction can ever create it. Entries without a
 * recorded deadline, or whose deadline has not finalized, are preserved.
 */
export async function proveNothingSent(rpc: Rpc, entry: V2JournalEntry, factory: string, creationTopic: string, expectedChainId: bigint): Promise<NothingSentProof> {
  if (!entry.factory || assertAddress(entry.factory) !== assertAddress(factory)) return {safe: false, reason: "The original launch contract is not bound to this proof. Preserve this launch and recover by transaction hash."};
  if (entry.transactionHash) return {safe: false, reason: "This launch has a transaction hash; it cannot be cleared as unsent."};
  if (entry.deadline === null) return {safe: false, reason: "This launch has no recorded deadline, so Grainpad cannot prove nothing was sent. Recover it by transaction hash."};
  if (entry.chainId !== null && BigInt(entry.chainId) !== expectedChainId) return {safe: false, reason: "This launch belongs to a different network than the one being checked. Nothing was cleared."};
  // Every read below must come from the expected chain: a wallet switched to another network would otherwise return an
  // expired timestamp and empty logs and "prove" that an unresolved launch on this chain never happened.
  await assertChain(rpc, expectedChainId);
  const block = await rpc("eth_getBlockByNumber", ["finalized", false]) as {number?: unknown; timestamp?: unknown} | null;
  if (!block) throw new Error("Finalized block unavailable.");
  const finalizedNumber = hexNumber(block.number, "Finalized block"), finalizedTime = hexNumber(block.timestamp, "Finalized block time");
  if (finalizedTime <= BigInt(entry.deadline)) {
    return {safe: false, reason: `The launch request can still execute until ${new Date(Number(entry.deadline) * 1000).toISOString()} and that time has not finalized. Wait, then check again.`};
  }
  const from = entry.startBlock ? BigInt(entry.startBlock) : 0n;
  const logs = await rpc("eth_getLogs", [{address: assertAddress(factory), fromBlock: "0x" + from.toString(16), toBlock: "0x" + finalizedNumber.toString(16), topics: [creationTopic, assertBytes32(entry.launchId)]}]);
  if (!Array.isArray(logs)) throw new Error("Launch history unavailable.");
  await assertChain(rpc, expectedChainId);                      // still the same chain after the reads
  if (logs.length) return {safe: false, reason: "This launch exists on-chain. It cannot be cleared; it is being registered."};
  return {safe: true, reason: "The launch request expired on-chain without creating this launch."};
}

export type TransactionVerdict = {ok: true; hash: string} | {ok: false; reason: string};
/**
 * Before any recovered, adopted or pasted hash is recorded: the node must know the transaction, it must be sent by this
 * creator to this factory, its calldata must be a createAndLaunch for exactly this launch id (and, when the journal recorded
 * the calldata hash, byte-identical), and it must be on this chain.
 */
export async function verifyCreationTransaction(rpc: Rpc, expected: {hash: string; creator: string; factory: string; launchId: string; chainId: bigint; dataHash?: string | null}): Promise<TransactionVerdict> {
  const hash = assertBytes32(expected.hash);
  await assertChain(rpc, expected.chainId);
  const tx = await rpc("eth_getTransactionByHash", [hash]) as {hash?: string; from?: string; to?: string | null; input?: string; chainId?: string} | null;
  if (!tx) return {ok: false, reason: "The network does not know that transaction yet. Check the hash, or try again shortly."};
  if (String(tx.hash).toLowerCase() !== hash) return {ok: false, reason: "The network returned a different transaction."};
  if (String(tx.from).toLowerCase() !== assertAddress(expected.creator)) return {ok: false, reason: "That transaction was not sent by this wallet."};
  if (String(tx.to).toLowerCase() !== assertAddress(expected.factory)) return {ok: false, reason: "That transaction was not sent to the Grainpad launch contract."};
  if (tx.chainId !== undefined && BigInt(tx.chainId) !== expected.chainId) return {ok: false, reason: "That transaction is on a different network."};
  const input = String(tx.input ?? "").toLowerCase();
  const header = decodeCreateAndLaunchHeader(input);
  if (!header) return {ok: false, reason: "That transaction is not a Grainpad launch."};
  if (header.launchId !== assertBytes32(expected.launchId)) return {ok: false, reason: "That transaction is for a different launch."};
  if (expected.dataHash && keccakHex(Uint8Array.from(input.slice(2).match(/../g) ?? [], b => parseInt(b, 16))) !== expected.dataHash) return {ok: false, reason: "That transaction's contents differ from the launch you reviewed."};
  return {ok: true, hash};
}
