import {buildRobinhoodCreateTransaction, receiptOutcome, type RobinhoodCreateInput, type CreateOutcome} from "./robinhood-create.ts";
import {describeMainnetReceipt} from "./robinhood-mainnet-registration.ts";
import {address, bytes32} from "./robinhood-market.ts";
import {ROBINHOOD_CHAIN_MAINNET, ROBINHOOD_MAINNET_FACTORY_ADDRESS} from "./robinhood-mainnet.ts";
import {assertRobinhoodMainnet} from "./robinhood-mainnet-wallet.ts";
import type {Eip1193Provider} from "./evm-wallet.ts";

export type MainnetCreateOutcome = CreateOutcome & {finalizedRevert?: boolean};

export type MainnetCreateTransaction = {
  networkId: "robinhood:mainnet"; chainId: 4663; to: string; data: string; value: "0x0"; launchId: string;
  name: string; symbol: string;
};

/** Random 96-bit salt prefixed by the creator, as enforced by the mainnet factory. */
export function newRobinhoodMainnetLaunchId(owner: string, entropy = crypto.getRandomValues(new Uint8Array(12))): string {
  if (!(entropy instanceof Uint8Array) || entropy.length !== 12) throw new Error("Mainnet launch salt must be 12 bytes.");
  return address(owner) + Array.from(entropy, byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Pure unsigned candidate construction. Does not certify a deployed factory. */
export function buildRobinhoodMainnetCreateTransaction(input: RobinhoodCreateInput): MainnetCreateTransaction {
  const encoded = buildRobinhoodCreateTransaction(input);
  return {...encoded, name: input.name, symbol: input.symbol, networkId: "robinhood:mainnet", chainId: ROBINHOOD_CHAIN_MAINNET.chainId};
}

/** No submission until the reviewed factory is configured; caller input cannot override it. */
export async function submitRobinhoodMainnetCreate(provider: Eip1193Provider, tx: MainnetCreateTransaction, owner: string): Promise<string> {
  const factory = ROBINHOOD_MAINNET_FACTORY_ADDRESS;
  if (!factory) throw new Error("Reviewed mainnet factory is not configured.");
  if (tx.networkId !== "robinhood:mainnet" || tx.chainId !== 4663 || tx.value !== "0x0" || address(tx.to) !== address(factory)) {
    throw new Error("Create transaction differs from the configured mainnet deployment.");
  }
  const canonical = buildRobinhoodMainnetCreateTransaction({factory, name: tx.name, symbol: tx.symbol, launchId: tx.launchId});
  if (tx.data !== canonical.data) throw new Error("Create calldata differs from the reviewed metadata.");
  const from = address(owner);
  if (tx.launchId.slice(0, 42).toLowerCase() !== from) throw new Error("Mainnet launch id is bound to a different creator.");
  const call = {from, to: address(factory), data: tx.data, value: tx.value, chainId: "0x1237"};
  const check = async () => {
    await assertRobinhoodMainnet(provider);
    const accounts = await provider.request({method: "eth_accounts"});
    if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || address(accounts[0]) !== from) {
      throw new Error("Wallet account changed. Reconnect and review again.");
    }
  };
  await check();
  await provider.request({method: "eth_call", params: [call, "latest"]});
  await check();
  return bytes32(await provider.request({method: "eth_sendTransaction", params: [call]}));
}

export async function readRobinhoodMainnetCreateReceipt(provider: Eip1193Provider, hash: string, launchId: string | null): Promise<MainnetCreateOutcome> {
  const factory = ROBINHOOD_MAINNET_FACTORY_ADDRESS;
  if (!factory) throw new Error("Reviewed mainnet factory is not configured.");
  await assertRobinhoodMainnet(provider);
  const transactionHash = bytes32(hash);
  if (launchId !== null) bytes32(launchId);
  const receipt = await provider.request({method: "eth_getTransactionReceipt", params: [transactionHash]});
  await assertRobinhoodMainnet(provider);
  const result = receiptOutcome(transactionHash, receipt, launchId, factory);
  if (result.state === "success") return {...result, launchId: describeMainnetReceipt(receipt, factory, transactionHash).launchId};
  if (result.state === "failure" && result.reason === "The create transaction reverted.") {
    return {...result, finalizedRevert: await mainnetReceiptIsFinalized(provider, receipt)};
  }
  return result;
}

/** A failed RPC read or reorg cannot grant permission to repeat a funded create. */
export async function mainnetReceiptIsFinalized(provider: Eip1193Provider, receipt: unknown): Promise<boolean> {
  if (!receipt || typeof receipt !== "object") return false;
  const mined = receipt as {blockNumber?: unknown; blockHash?: unknown};
  if (typeof mined.blockNumber !== "string" || !/^0x[0-9a-f]+$/i.test(mined.blockNumber) || typeof mined.blockHash !== "string" || !/^0x[0-9a-f]{64}$/i.test(mined.blockHash)) return false;
  try {
    await assertRobinhoodMainnet(provider);
    const finalized = await provider.request({method: "eth_getBlockByNumber", params: ["finalized", false]}) as {number?: unknown} | null;
    if (typeof finalized?.number !== "string" || !/^0x[0-9a-f]+$/i.test(finalized.number) || BigInt(finalized.number) < BigInt(mined.blockNumber)) return false;
    const canonical = await provider.request({method: "eth_getBlockByNumber", params: [mined.blockNumber, false]}) as {hash?: unknown} | null;
    await assertRobinhoodMainnet(provider);
    return typeof canonical?.hash === "string" && canonical.hash.toLowerCase() === mined.blockHash.toLowerCase();
  } catch {return false;}
}
