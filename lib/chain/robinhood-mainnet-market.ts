import {address, bytes32, assertRobinhoodChain, readMarket, prepareTrade, uintWord, type Rpc, type Market, type LaunchIdentity, type Transaction, type TradePlan} from "./robinhood-market.ts";
import {ROBINHOOD_CHAIN_MAINNET} from "./robinhood-mainnet.ts";
export const MAINNET_V3_ROUTER = "0xcaf681a66d020601342297493863e78c959e5cb2";
export const MAINNET_V3_QUOTER = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7";
export type MainnetMarket = Market & {networkId: "robinhood:mainnet"; graduated: boolean; graduationPending: boolean; locker: string | null; pool: string | null; maxBuy: bigint; lockedTokens: bigint};
const aWord = (value: string) => address(value).slice(2).padStart(64, "0");
function decode(value: unknown, count: number): bigint[] {
  if (typeof value !== "string" || !new RegExp("^0x[0-9a-f]{" + count * 64 + "}$", "i").test(value)) throw new Error("Invalid mainnet contract response.");
  return Array.from({length: count}, (_, i) => BigInt("0x" + value.slice(2 + i * 64, 66 + i * 64)));
}
export async function readMainnetMarket(rpc: Rpc, identity: LaunchIdentity): Promise<MainnetMarket> {
  const base = await readMarket(rpc, identity, ROBINHOOD_CHAIN_MAINNET.wethAddress, "robinhood:mainnet");
  const read = async (selector: string) => decode(await rpc("eth_call", [{to: base.curve, data: selector + bytes32(base.launchId).slice(2)}, base.block]), 1)[0];
  const done = await read("0xbce1cd0d"), pending = await read("0x4338af94");
  if (![0n, 1n].includes(done) || ![0n, 1n].includes(pending)) throw new Error("Invalid mainnet graduation state.");
  const lockerValue = await read("0x31d3c027"), poolValue = await read("0xba4a6bd4");
  const locker = lockerValue === 0n ? null : address("0x" + lockerValue.toString(16).padStart(40, "0"));
  const pool = poolValue === 0n ? null : address("0x" + poolValue.toString(16).padStart(40, "0"));
  if (done === 1n && (!locker || !pool)) throw new Error("Missing locked mainnet liquidity.");
  return {...base, networkId: "robinhood:mainnet", graduated: done === 1n, graduationPending: pending === 1n, locker, pool, maxBuy: await read("0x5b38c0df"), lockedTokens: await read("0xb215d99e")};
}
export type MainnetTradePlan = TradePlan & {venue: "curve" | "uniswap-v3"};
/** Exact-input quotes use the pinned RH router and quoter. No fees are added by the frontend. */
export async function prepareMainnetTrade(rpc: Rpc, market: MainnetMarket, owner: string, side: "buy" | "sell", amount: bigint, slippageBps: number): Promise<MainnetTradePlan> {
  if (!market.graduated) return {...await prepareTrade(rpc, market, owner, side, amount, slippageBps), venue: "curve"};
  await assertRobinhoodChain(rpc, "robinhood:mainnet");
  if (market.networkId !== "robinhood:mainnet" || market.quote !== ROBINHOOD_CHAIN_MAINNET.wethAddress || !market.pool || !market.locker) throw new Error("Wrong graduated market identity.");
  if (side !== "buy" && side !== "sell") throw new Error("Unknown trade side.");
  if (amount <= 0n || !Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 500) throw new Error("Invalid amount or slippage.");
  const tokenIn = side === "buy" ? market.quote : market.tokenAddress, tokenOut = side === "buy" ? market.tokenAddress : market.quote;
  const call = async (to: string, data: string, count: number) => decode(await rpc("eth_call", [{to: address(to), data}, market.block]), count);
  const [output] = await call(MAINNET_V3_QUOTER, "0xc6a5026a" + aWord(tokenIn) + aWord(tokenOut) + uintWord(amount) + uintWord(10000n) + uintWord(0n), 4);
  const minimum = output * BigInt(10000 - slippageBps) / 10000n;
  if (minimum <= 0n) throw new Error("Output is too small.");
  const [balance] = await call(tokenIn, "0x70a08231" + aWord(owner), 1);
  if (balance < amount) throw new Error("Insufficient token balance.");
  const [allowance] = await call(tokenIn, "0xdd62ed3e" + aWord(owner) + aWord(MAINNET_V3_ROUTER), 1);
  const tx = (to: string, data: string): Transaction => ({from: address(owner), to: address(to), data, value: "0x0", chainId: "0x1237"});
  const expiresAt = Date.now() + 60000;
  const inner = "04e45aaf" + aWord(tokenIn) + aWord(tokenOut) + uintWord(10000n) + aWord(owner) + uintWord(amount) + uintWord(minimum) + uintWord(0n);
  const data = "0x5ae401dc" + uintWord(BigInt(Math.floor(expiresAt / 1000))) + uintWord(64n) + uintWord(1n) + uintWord(32n) + uintWord(BigInt(inner.length / 2)) + inner.padEnd(Math.ceil(inner.length / 64) * 64, "0");
  return {market, side, amount, output, minimum, fees: {platform: 0n, creator: 0n, trade: 0n}, approval: allowance < amount ? tx(tokenIn, "0x095ea7b3" + aWord(MAINNET_V3_ROUTER) + uintWord(amount)) : null, transaction: tx(MAINNET_V3_ROUTER, data), expiresAt, venue: "uniswap-v3"};
}
export function prepareMainnetGraduationRetry(market: MainnetMarket, owner: string): Transaction {
  if (!market.graduationPending || market.graduated || market.networkId !== "robinhood:mainnet") throw new Error("No pending graduation.");
  return {from: address(owner), to: address(market.curve), data: "0x19692f89" + bytes32(market.launchId).slice(2), value: "0x0", chainId: "0x1237"};
}

/** Called from explicit submit handlers, including approval handlers. */
export function assertMainnetTradeFresh(plan: MainnetTradePlan, now = Date.now()) {
  if (!Number.isFinite(now) || now >= plan.expiresAt) throw new Error("Quote expired. Review a fresh quote.");
}
