import {ROBINHOOD_CHAIN_TESTNET, robinhoodChainIdHex} from "./robinhood-testnet.ts";
import {ROBINHOOD_CHAIN_MAINNET, ROBINHOOD_MAINNET_FACTORY_ADDRESS} from "./robinhood-mainnet.ts";
import {assertRobinhoodMainnetFees, splitRobinhoodMainnetFees} from "./robinhood-mainnet-fees.ts";
import type {EvmRequest} from "./robinhood-create.ts";

export const TESTNET_WETH = "0x7943e237c7f95da44e0301572d358911207852fa";
export type Rpc = (method: string, params: unknown[]) => Promise<unknown>;
export type LaunchIdentity = {factory: string; tokenAddress: string; launchId: string};
export type RobinhoodMarketNetwork = "robinhood:testnet" | "robinhood:mainnet";
export type Market = LaunchIdentity & {
  networkId?: RobinhoodMarketNetwork;
  curve: string; vault: string; quote: string; creator: string; platform: string;
  realQuote: bigint; inventory: bigint; supply: bigint; block: string;
  platformFeeBps: bigint; creatorFeeBps: bigint; tradeFeeBps: bigint;
};
export type Transaction = {from: string; to: string; data: string; value: string; chainId: string};
export type TradePlan = {
  market: Market; side: "buy" | "sell"; amount: bigint; output: bigint; minimum: bigint;
  fees: {platform: bigint; creator: bigint; trade: bigint};
  approval: Transaction | null; transaction: Transaction; expiresAt: number;
};
const MAX_UINT = (1n << 256n) - 1n;

export function address(value: unknown): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value) || BigInt(value) === 0n) throw new Error("A nonzero EVM address is required.");
  return value.toLowerCase();
}
export function bytes32(value: unknown): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("A 32-byte identifier is required.");
  return value.toLowerCase();
}
export function uintWord(value: bigint): string {
  if (value < 0n || value > MAX_UINT) throw new Error("Amount is outside uint256.");
  return value.toString(16).padStart(64, "0");
}
function addressWord(value: string) { return address(value).slice(2).padStart(64, "0"); }
function words(value: unknown, count: number): bigint[] {
  if (typeof value !== "string" || !new RegExp("^0x[0-9a-fA-F]{" + count * 64 + "}$").test(value)) throw new Error("Invalid contract response.");
  return Array.from({length: count}, (_, i) => BigInt("0x" + value.slice(2 + i * 64, 66 + i * 64)));
}
function decodeAddress(value: bigint): string { return address("0x" + value.toString(16).padStart(40, "0")); }
export function parseUnits18(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(value)) throw new Error("Use a positive decimal amount with at most 18 decimals.");
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
  if (amount <= 0n || amount > MAX_UINT) throw new Error("Amount is outside uint256.");
  return amount;
}
export function formatUnits18(amount: bigint): string {
  return (amount / 10n ** 18n).toString() + "." + (amount % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "").padEnd(1, "0");
}
export const publicTestnetRpc: Rpc = async (method, params) => {
  const allowed = ["eth_getLogs", "eth_chainId", "eth_blockNumber", "eth_getCode", "eth_call", "eth_getTransactionReceipt", "eth_getBlockByNumber"];
  if (!allowed.includes(method)) throw new Error("Only testnet reads are available.");
  const response = await fetch(ROBINHOOD_CHAIN_TESTNET.rpcUrl, {
    method: "POST", headers: {"content-type": "application/json"}, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params}),
  });
  if (!response.ok) throw new Error("Testnet RPC unavailable.");
  const body = await response.json() as {error?: unknown; result?: unknown};
  if (body.error || !("result" in body)) throw new Error("Testnet RPC rejected the read.");
  return body.result;
};
export async function assertRobinhoodChain(rpc: Rpc, networkId: RobinhoodMarketNetwork = "robinhood:testnet") {
  if (networkId !== "robinhood:mainnet" && networkId !== "robinhood:testnet") throw new Error("Unknown Robinhood market network.");
  const chain = await rpc("eth_chainId", []);
  const expected = networkId === "robinhood:mainnet" ? 4663n : 46630n;
  if (typeof chain !== "string" || !/^0x[\da-f]+$/i.test(chain) || BigInt(chain) !== expected) throw new Error("Wallet or RPC is not on Robinhood Chain " + (networkId === "robinhood:mainnet" ? "mainnet." : "testnet."));
}
export async function assertTestnet(rpc: Rpc) { return assertRobinhoodChain(rpc); }
function networkOf(market: Market): RobinhoodMarketNetwork {
  if (market.networkId !== undefined && market.networkId !== "robinhood:mainnet" && market.networkId !== "robinhood:testnet") throw new Error("Unknown Robinhood market network.");
  return market.networkId ?? "robinhood:testnet";
}
function call(rpc: Rpc, to: string, data: string, block: string) { return rpc("eth_call", [{to, data}, block]); }

/** Read one consistent block and bind the registered token to the configured factory. */
export async function readMarket(rpc: Rpc, identity: LaunchIdentity, expectedQuote = TESTNET_WETH, networkId: RobinhoodMarketNetwork = "robinhood:testnet"): Promise<Market> {
  await assertRobinhoodChain(rpc, networkId);
  if (networkId === "robinhood:mainnet" && address(expectedQuote) !== ROBINHOOD_CHAIN_MAINNET.wethAddress) throw new Error("Wrong mainnet quote asset.");
  const factory = address(identity.factory), tokenAddress = address(identity.tokenAddress), launchId = bytes32(identity.launchId);
  const block = await rpc("eth_blockNumber", []);
  if (typeof block !== "string" || !/^0x[\da-f]+$/i.test(block)) throw new Error("Missing Robinhood block.");
  const read = async (to: string, data: string) => words(await call(rpc, to, data, block), 1)[0];
  const curve = decodeAddress(await read(factory, "0x7165485d"));
  const vault = decodeAddress(await read(factory, "0xfbfa77cf"));
  if (decodeAddress(await read(factory, "0xbae667bc" + launchId.slice(2))) !== tokenAddress) throw new Error("Token is not registered at this factory.");
  const [token, creator, realQuote, inventory, exists] = words(await call(rpc, curve, "0xad091230" + launchId.slice(2), block), 5);
  if (exists !== 1n || decodeAddress(token) !== tokenAddress) throw new Error("Unknown curve launch.");
  const quote = decodeAddress(await read(curve, "0x999b93af"));
  if (quote !== address(expectedQuote)) throw new Error("Unexpected Robinhood quote.");
  if (decodeAddress(await read(curve, "0xc45a0155")) !== factory ||
      decodeAddress(await read(curve, "0xfbfa77cf")) !== vault ||
      decodeAddress(await read(vault, "0xc45a0155")) !== factory ||
      decodeAddress(await read(vault, "0x7165485d")) !== curve ||
      decodeAddress(await read(vault, "0x999b93af")) !== quote ||
      decodeAddress(await read(vault, "0xff94e4f3" + launchId.slice(2))) !== decodeAddress(creator)) throw new Error("Invalid factory wiring.");
  const market: Market = {
    networkId, factory, tokenAddress, launchId, curve, vault, quote, creator: decodeAddress(creator), realQuote, inventory, block,
    platform: decodeAddress(await read(vault, "0x4bde38c8")),
    supply: await read(factory, "0xa96af0f4"),
    platformFeeBps: await read(curve, "0x22dcd13e"), creatorFeeBps: await read(curve, "0x17773ebb"), tradeFeeBps: await read(curve, "0x5faad8c5"),
  };
  if (networkId === "robinhood:mainnet") assertRobinhoodMainnetFees({platformFeeBps: Number(market.platformFeeBps), creatorFeeBps: Number(market.creatorFeeBps), tradeFeeBps: Number(market.tradeFeeBps)});
  return market;
}
function transaction(owner: string, to: string, data: string, value = "0x0", networkId: RobinhoodMarketNetwork = "robinhood:testnet"): Transaction {
  if (networkId !== "robinhood:mainnet" && networkId !== "robinhood:testnet") throw new Error("Unknown Robinhood market network.");
  return {from: address(owner), to: address(to), data, value, chainId: networkId === "robinhood:mainnet" ? "0x1237" : robinhoodChainIdHex()};
}
/** Amount is in base units. Slippage is integer basis points, capped at 5%. */
export async function prepareTrade(rpc: Rpc, market: Market, owner: string, side: "buy" | "sell", amount: bigint, slippageBps: number): Promise<TradePlan> {
  const networkId = networkOf(market);
  await assertRobinhoodChain(rpc, networkId);
  address(owner);
  if (side !== "buy" && side !== "sell") throw new Error("Unknown trade side.");
  if (amount <= 0n) throw new Error("Amount must be positive.");
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 500) throw new Error("Slippage must be 0 to 500 basis points.");
  const args = bytes32(market.launchId).slice(2) + uintWord(amount);
  const result = words(await call(rpc, market.curve, (side === "buy" ? "0xedd6ea76" : "0xf2c963fd") + args, market.block), 5);
  if (networkId === "robinhood:mainnet") {
    if (address(market.quote) !== ROBINHOOD_CHAIN_MAINNET.wethAddress) throw new Error("Wrong mainnet quote asset.");
    const expected = splitRobinhoodMainnetFees(side === "buy" ? amount : result[0]);
    if (result[1] !== expected.platformFee || result[2] !== expected.creatorFee || result[3] !== 0n || result[4] !== expected.net) {
      throw new Error("Mainnet quote differs from the approved fee policy.");
    }
  }
  const output = side === "buy" ? result[0] : result[4];
  const minimum = output * BigInt(10000 - slippageBps) / 10000n;
  if (minimum <= 0n) throw new Error("Output is too small.");
  const inputToken = side === "buy" ? market.quote : market.tokenAddress;
  const balance = words(await call(rpc, inputToken, "0x70a08231" + addressWord(owner), market.block), 1)[0];
  if (balance < amount) throw new Error(side === "buy" ? "Insufficient WETH. Wrap " + (networkId === "robinhood:mainnet" ? "mainnet" : "testnet") + " ETH first." : "Insufficient token balance.");
  const allowance = words(await call(rpc, inputToken, "0xdd62ed3e" + addressWord(owner) + addressWord(market.curve), market.block), 1)[0];
  const expiresAt = Date.now() + 60000;
  const selector = networkId === "robinhood:mainnet" ? (side === "buy" ? "0x2c45df99" : "0x30876e18") : (side === "buy" ? "0xfc18d034" : "0x7f8f0641");
  const deadline = networkId === "robinhood:mainnet" ? uintWord(BigInt(Math.floor(expiresAt / 1000))) : "";
  return {
    market, side, amount, output, minimum, fees: {platform: result[1], creator: result[2], trade: result[3]},
    approval: allowance < amount ? transaction(owner, inputToken, "0x095ea7b3" + addressWord(market.curve) + uintWord(amount), "0x0", networkId) : null,
    transaction: transaction(owner, market.curve, selector + args + uintWord(minimum) + deadline, "0x0", networkId),
    expiresAt,
  };
}
export async function readFees(rpc: Rpc, market: Market) {
  await assertRobinhoodChain(rpc, networkOf(market));
  const amounts = await Promise.all([0n, 1n, 2n].map(async kind =>
    words(await call(rpc, market.vault, "0x866d16bf" + market.launchId.slice(2) + uintWord(kind), "latest"), 1)[0]));
  return {platform: amounts[0], creator: amounts[1], trade: amounts[2]};
}
export async function prepareClaim(rpc: Rpc, market: Market, owner: string, kind: 0 | 1 | 2): Promise<Transaction> {
  if (![0, 1, 2].includes(kind)) throw new Error("Unknown fee bucket.");
  if (address(owner) !== (kind === 1 ? market.creator : market.platform)) throw new Error("Only this bucket's payee can claim.");
  const fees = await readFees(rpc, market);
  if ([fees.platform, fees.creator, fees.trade][kind] === 0n) throw new Error("No accrued fees.");
  return transaction(owner, market.vault, "0x1c5c123f" + market.launchId.slice(2) + uintWord(BigInt(kind)), "0x0", networkOf(market));
}
export function prepareWrap(owner: string, amount: bigint, networkId: RobinhoodMarketNetwork = "robinhood:testnet"): Transaction {
  if (amount <= 0n) throw new Error("Amount must be positive.");
  uintWord(amount);
  return transaction(owner, networkId === "robinhood:mainnet" ? ROBINHOOD_CHAIN_MAINNET.wethAddress : TESTNET_WETH, "0xd0e30db0", "0x" + amount.toString(16), networkId);
}

/** Every signature rechecks the selected chain/account. A known hash is never lost on RPC failure. */
export async function submitTransaction(provider: EvmRequest, tx: Transaction): Promise<string> {
  const networkId: RobinhoodMarketNetwork = tx.chainId === "0x1237" ? "robinhood:mainnet" : "robinhood:testnet";
  if (tx.chainId !== robinhoodChainIdHex() && tx.chainId !== "0x1237") throw new Error("Wrong transaction chain.");
  if (networkId === "robinhood:mainnet" && !ROBINHOOD_MAINNET_FACTORY_ADDRESS) throw new Error("Reviewed mainnet factory is not configured.");
  address(tx.to); address(tx.from);
  await assertRobinhoodChain((method, params) => provider.request({method, params}), networkId);
  const accounts = await provider.request({method: "eth_accounts"});
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || address(accounts[0]) !== tx.from) throw new Error("Wallet account changed. Reconnect and review again.");
  await provider.request({method: "eth_call", params: [tx, "latest"]});
  // Repeat after simulation, before presenting the signature request.
  await assertRobinhoodChain((method, params) => provider.request({method, params}), networkId);
  const current = await provider.request({method: "eth_accounts"});
  if (!Array.isArray(current) || typeof current[0] !== "string" || address(current[0]) !== tx.from) throw new Error("Wallet account changed. Reconnect and review again.");
  const hash = await provider.request({method: "eth_sendTransaction", params: [tx]});
  return bytes32(typeof hash === "string" ? hash.toLowerCase() : hash);
}
export async function transactionStatus(rpc: Rpc, hash: string, networkId: RobinhoodMarketNetwork = "robinhood:testnet"): Promise<"pending" | "success" | "reverted"> {
  await assertRobinhoodChain(rpc, networkId);
  const receipt = await rpc("eth_getTransactionReceipt", [bytes32(hash)]) as {transactionHash?: unknown; status?: unknown} | null;
  if (!receipt) return "pending";
  if (receipt.transactionHash !== hash.toLowerCase()) throw new Error("Receipt hash differs.");
  if (receipt.status === "0x1") return "success";
  if (receipt.status === "0x0") return "reverted";
  throw new Error("Invalid receipt status.");
}

const BOUGHT_TOPIC = "0x1425213da0cb1c09c9763adf9297d47fa65b00e4d96bc5e98fcfd4f9b9750255";
const SOLD_TOPIC = "0x383b92a01a6edee565344b5d38a1984c424aab65c628d06f13e2fcc68ba5ba35";
export type TradeEvent = {side: "buy" | "sell"; transactionHash: string; blockNumber: bigint; logIndex: bigint; trader: string; amountIn: bigint; amountOut: bigint};
/** Bounded on-demand history, never described as a complete historical index. */
export async function readRecentTrades(rpc: Rpc, market: Market): Promise<TradeEvent[]> {
  await assertRobinhoodChain(rpc, networkOf(market));
  const end = BigInt(market.block), start = end > 999n ? end - 999n : 0n;
  return readTradeRange(rpc, market, start, end, 50);
}

/** Strict decoder shared by browser reads and durable server history. */
export async function readTradeRange(rpc: Rpc, market: Market, start: bigint, end: bigint, limit = 10000): Promise<TradeEvent[]> {
  if (start < 0n || end < start || end - start > 999n) throw new Error("Trade range must span at most 1,000 blocks.");
  const logs = await rpc("eth_getLogs", [{
    address: market.curve, fromBlock: "0x" + start.toString(16), toBlock: "0x" + end.toString(16),
    topics: [[BOUGHT_TOPIC, SOLD_TOPIC], market.launchId],
  }]);
  if (!Array.isArray(logs) || logs.length > 10000) throw new Error("Recent trade history unavailable.");
  return logs.filter(log => !log.removed).map(log => {
    if (address(log.address) !== market.curve || !Array.isArray(log.topics) || log.topics.length !== 4 ||
        log.topics[1] !== market.launchId || decodeAddress(BigInt(bytes32(log.topics[3]))) !== market.tokenAddress) throw new Error("Unexpected market event.");
    const buy = log.topics[0] === BOUGHT_TOPIC;
    if (!buy && log.topics[0] !== SOLD_TOPIC) throw new Error("Unknown market event.");
    const data = words(log.data, buy ? 7 : 8);
    if (!/^0x[\da-f]+$/i.test(log.blockNumber) || BigInt(log.blockNumber) < start || BigInt(log.blockNumber) > end || !/^0x[\da-f]+$/i.test(log.logIndex)) throw new Error("Invalid event position.");
    return {side: buy ? "buy" as const : "sell" as const, transactionHash: bytes32(log.transactionHash),
      blockNumber: BigInt(log.blockNumber), logIndex: BigInt(log.logIndex),
      trader: decodeAddress(BigInt(bytes32(log.topics[2]))), amountIn: data[0], amountOut: data[buy ? 4 : 5]};
  }).sort((a, b) => a.blockNumber === b.blockNumber ? (a.logIndex > b.logIndex ? -1 : 1) : (a.blockNumber > b.blockNumber ? -1 : 1)).slice(0, limit);
}
