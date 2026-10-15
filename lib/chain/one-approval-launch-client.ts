/**
 * Wallet side of the one-approval launch. The only wallet method that can prompt is `eth_sendTransaction`, called once.
 * EIP-5792 batching is deliberately not used: it needs per-chain EIP-7702 support that is not documented for
 * Robinhood Chain, and a single factory call already makes the whole launch atomic.
 */
import {assertAddress, type LaunchPlan} from "./evm-one-approval-launch.ts";
import {tokenOfCalldata} from "./launch-progress.ts";

export type Eip1193 = {request(args: {method: string; params?: unknown[]}): Promise<unknown>};
/** Durable write-ahead journal (localStorage + IndexedDB in the browser). Must resolve before the wallet is asked. */
export type SubmissionJournal = {
  markStarted(entry: {launchId: string; creator: string; digest: string; deadline?: bigint; dataHash?: string; chainId?: bigint; factory?: string}): Promise<void>;
  markSent(entry: {launchId: string; transactionHash: string}): Promise<void>;
  /** The wallet explicitly refused (EIP-1193 4001): nothing was sent, so the write-ahead entry is released. */
  markRejected?(entry: {launchId: string}): Promise<void>;
};

/** EIP-1193 userRejectedRequest is the numeric code 4001 and nothing else. Message text is never trusted: a provider timeout
 * or a hostile string must not release a journal entry for a transaction that may have been broadcast. */
export const userRejected = (error: unknown) => !!error && typeof error === "object" && "code" in error && (error as {code: unknown}).code === 4001;

export async function submitOneApprovalLaunch(provider: Eip1193, plan: LaunchPlan, creator: string, journal: SubmissionJournal): Promise<string> {
  const from = assertAddress(creator);
  if (plan.launchId.slice(0, 42) !== from) throw new Error("Launch id is bound to a different creator.");
  const check = async () => {
    if (BigInt(String(await provider.request({method: "eth_chainId"}))) !== BigInt(plan.chainId)) throw new Error("Switch to the launch network.");
    const accounts = await provider.request({method: "eth_accounts"});
    if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || accounts[0].toLowerCase() !== from) throw new Error("Wallet account changed. Reconnect and review again.");
  };
  const call = {from, to: plan.to, data: plan.data, value: plan.value, chainId: plan.chainId};
  await check();
  // A reverting launch (slippage, curve limit, duplicate id) is refused before the wallet shows a prompt.
  await provider.request({method: "eth_call", params: [call, "latest"]});
  await check();
  await journal.markStarted({launchId: plan.launchId, creator: from, digest: plan.registrationDigest, deadline: plan.deadline, dataHash: plan.dataHash, chainId: BigInt(plan.chainId), factory: plan.to});
  // The durable write can wait on IndexedDB or another tab. Recheck after it;
  // a failed session check preserves the intent and is not a wallet rejection.
  await check();
  let hash: unknown;
  try { hash = await provider.request({method: "eth_sendTransaction", params: [call]}); }
  catch (error) {
    // Only an explicit refusal releases the entry. A timeout or provider error may still have broadcast: keep it and recover by launch id.
    if (userRejected(error)) await journal.markRejected?.({launchId: plan.launchId});
    throw error;
  }
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Wallet returned no transaction hash. Recover by launch id; do not create again.");
  await journal.markSent({launchId: plan.launchId, transactionHash: hash.toLowerCase()});
  return hash.toLowerCase();
}

/** Survives a lost hash: the factory's launch-id mapping is the idempotency key. */
export async function probeLaunchId(rpc: (method: string, params: unknown[]) => Promise<unknown>, factory: string, launchId: string): Promise<string | null> {
  const word = await rpc("eth_call", [{to: assertAddress(factory), data: tokenOfCalldata(launchId)}, "latest"]);
  if (typeof word !== "string" || !/^0x[0-9a-f]{64}$/i.test(word)) throw new Error("Invalid contract response.");
  return /^0x0{64}$/.test(word) ? null : "0x" + word.slice(26).toLowerCase();
}
