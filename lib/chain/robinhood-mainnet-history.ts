import {address, bytes32, readTradeRange, type Rpc, type TradeEvent} from "./robinhood-market.ts";
import type {RobinhoodRecordStore} from "./robinhood-registration.ts";
import {describeMainnetReceipt, type MainnetLaunchRecord} from "./robinhood-mainnet-registration.ts";
import {readMainnetMarket, type MainnetMarket} from "./robinhood-mainnet-market.ts";

export type StoredTrade = Omit<TradeEvent, "blockNumber" | "logIndex" | "amountIn" | "amountOut"> & {
  blockNumber: string; logIndex: string; amountIn: string; amountOut: string;
};
export function storeTrade(event: TradeEvent): StoredTrade {
  return {...event, blockNumber: event.blockNumber.toString(), logIndex: event.logIndex.toString(), amountIn: event.amountIn.toString(), amountOut: event.amountOut.toString()};
}
export function restoreTrade(event: StoredTrade): TradeEvent {
  return {...event, blockNumber: BigInt(event.blockNumber), logIndex: BigInt(event.logIndex), amountIn: BigInt(event.amountIn), amountOut: BigInt(event.amountOut)};
}
const hex = (value: bigint) => "0x" + value.toString(16);
async function canonical(rpc: Rpc, number: bigint): Promise<string> {
  const block = await rpc("eth_getBlockByNumber", [hex(number), false]) as {hash?: unknown} | null;
  return bytes32(block?.hash);
}
/** Persist complete, confirmed 1,000-block shards. Recheck canonical hashes on every read. */
export async function readRobinhoodMainnetHistory(storage: RobinhoodRecordStore, rpc: Rpc, record: MainnetLaunchRecord, before?: string) {
  const market = await readMainnetMarket(rpc, record);
  const receipt = await rpc("eth_getTransactionReceipt", [record.transactionHash]) as {blockNumber?: string; blockHash?: string} | null;
  const verified = describeMainnetReceipt(receipt, record.factory, record.transactionHash);
  if (verified.tokenAddress !== address(record.tokenAddress) || verified.launchId !== record.launchId ||
      !receipt?.blockNumber || !/^0x[\da-f]+$/i.test(receipt.blockNumber)) throw new Error("Invalid launch history identity.");
  const first = BigInt(receipt.blockNumber);
  if (await canonical(rpc, first) !== receipt.blockHash) throw new Error("Launch receipt was reorganized.");
  const finalized = await rpc("eth_getBlockByNumber", ["finalized", false]) as {number?: unknown} | null;
  if (typeof finalized?.number !== "string" || !/^0x[\da-f]+$/i.test(finalized.number)) throw new Error("Finalized history is unavailable.");
  const latest = BigInt(finalized.number);
  if (latest > BigInt(market.block)) throw new Error("Finalized history is newer than the market snapshot. Retry.");
  if (latest < first) throw new Error("Waiting for launch confirmations.");
  if (before !== undefined && (!/^(0|[1-9]\d{0,19})$/.test(before) || BigInt(before) > latest)) throw new Error("Invalid history cursor.");
  let end = before === undefined ? latest : BigInt(before);
  if (end < first) throw new Error("History cursor precedes creation.");
  const trades: StoredTrade[] = [];
  const scannedTo = end;
  const anchorHash = await canonical(rpc, scannedTo);
  let scannedFrom = end;
  // Bounded request; continue backwards until events, creation, or ten shards.
  for (let page = 0; page < 10 && end >= first; page++) {
    const start = end - end % 1000n < first ? first : end - end % 1000n;
    const endHash = await canonical(rpc, end);
    const key = `robinhood-history/4663/${address(record.factory)}/${address(record.tokenAddress)}/${start}-${end}`;
    const durable = end % 1000n === 999n;
    const object = durable ? await storage.get(key) : null;
    const cached = object ? JSON.parse(await object.text()) as {endHash: string; trades: StoredTrade[]} : null;
    let events: StoredTrade[];
    if (cached?.endHash === endHash) events = cached.trades;
    else {
      const curveEvents = (await readTradeRange(rpc, market, start, end)).map(event => ({...storeTrade(event), venue: "curve" as const}));
      const poolEvents = market.pool ? await readMainnetPoolRange(rpc, market, start, end) : [];
      events = [...curveEvents, ...poolEvents].sort((a,b) => BigInt(a.blockNumber) === BigInt(b.blockNumber) ? (BigInt(a.logIndex) > BigInt(b.logIndex) ? -1 : 1) : (BigInt(a.blockNumber) > BigInt(b.blockNumber) ? -1 : 1));
      if (await canonical(rpc, end) !== endHash) throw new Error("History changed during indexing. Retry.");
      if (durable) await storage.put(key, JSON.stringify({endHash, trades: events}));
    }
    trades.push(...events);
    scannedFrom = start;
    end = start - 1n;
    if (trades.length) break;
  }
  if (await canonical(rpc, scannedTo) !== anchorHash) throw new Error("History changed during indexing. Retry.");
  return {networkId: "robinhood:mainnet", trades, nextCursor: end >= first ? end.toString() : null,
    scannedFrom: scannedFrom.toString(), scannedTo: scannedTo.toString(), creationBlock: first.toString(), confirmedThrough: latest.toString()};
}

const SWAP_TOPIC = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";
/** Pool event recipient is recorded, not assumed to be the original wallet behind an aggregator. */
export async function readMainnetPoolRange(rpc: Rpc, market: MainnetMarket, start: bigint, end: bigint): Promise<(StoredTrade & {venue: "uniswap-v3"})[]> {
  if (!market.pool || start < 0n || end < start || end - start > 999n) throw new Error("Invalid mainnet pool history range.");
  const logs = await rpc("eth_getLogs", [{address: market.pool, fromBlock: hex(start), toBlock: hex(end), topics: [SWAP_TOPIC]}]);
  if (!Array.isArray(logs) || logs.length > 10000) throw new Error("Pool history unavailable.");
  return logs.filter(log => !log.removed).flatMap(log => {
    if (address(log.address) !== market.pool || !Array.isArray(log.topics) || log.topics.length !== 3 || log.topics[0] !== SWAP_TOPIC ||
        typeof log.data !== "string" || !/^0x[0-9a-f]{320}$/i.test(log.data) || typeof log.blockNumber !== "string" || !/^0x[0-9a-f]+$/i.test(log.blockNumber) ||
        typeof log.logIndex !== "string" || !/^0x[0-9a-f]+$/i.test(log.logIndex)) throw new Error("Unexpected mainnet pool event.");
    const blockNumber = BigInt(log.blockNumber);
    if (blockNumber < start || blockNumber > end) throw new Error("Pool event is outside the requested range.");
    const amount0 = BigInt.asIntN(256, BigInt("0x" + log.data.slice(2,66)));
    const amount1 = BigInt.asIntN(256, BigInt("0x" + log.data.slice(66,130)));
    const quoteFirst = market.quote < market.tokenAddress;
    const quoteAmount = quoteFirst ? amount0 : amount1, tokenAmount = quoteFirst ? amount1 : amount0;
    // V3 fee rounding can consume a dust input without producing output.
    // A zero/zero Swap carries no executed trade and has no direction.
    if (quoteAmount === 0n && tokenAmount === 0n) return [];
    const buy = quoteAmount > 0n && tokenAmount <= 0n;
    if (!buy && !(quoteAmount <= 0n && tokenAmount > 0n)) throw new Error("Unsupported pool swap direction.");
    const recipient = address("0x" + bytes32(log.topics[2]).slice(-40));
    return [{...storeTrade({side: buy ? "buy" : "sell", transactionHash: bytes32(log.transactionHash), blockNumber,
      logIndex: BigInt(log.logIndex), trader: recipient, amountIn: buy ? quoteAmount : tokenAmount, amountOut: buy ? -tokenAmount : -quoteAmount}), venue: "uniswap-v3" as const}];
  });
}
