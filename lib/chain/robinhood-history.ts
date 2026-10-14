import {address, bytes32, readMarket, readTradeRange, type Rpc, type TradeEvent} from "./robinhood-market.ts";
import {describeRobinhoodReceipt, type RobinhoodLaunchRecord, type RobinhoodRecordStore} from "./robinhood-registration.ts";

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
export async function readRobinhoodHistory(storage: RobinhoodRecordStore, rpc: Rpc, record: RobinhoodLaunchRecord, before?: string) {
  const market = await readMarket(rpc, record);
  const receipt = await rpc("eth_getTransactionReceipt", [record.transactionHash]) as {blockNumber?: string; blockHash?: string} | null;
  const verified = describeRobinhoodReceipt(receipt, record.factory, record.transactionHash);
  if (verified.tokenAddress !== address(record.tokenAddress) || verified.launchId !== record.launchId ||
      !receipt?.blockNumber || !/^0x[\da-f]+$/i.test(receipt.blockNumber)) throw new Error("Invalid launch history identity.");
  const first = BigInt(receipt.blockNumber);
  if (await canonical(rpc, first) !== receipt.blockHash) throw new Error("Launch receipt was reorganized.");
  const latest = BigInt(market.block) - 2n;
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
    const key = `robinhood-history/46630/${address(record.factory)}/${address(record.tokenAddress)}/${start}-${end}`;
    const durable = end % 1000n === 999n;
    const object = durable ? await storage.get(key) : null;
    const cached = object ? JSON.parse(await object.text()) as {endHash: string; trades: StoredTrade[]} : null;
    let events: StoredTrade[];
    if (cached?.endHash === endHash) events = cached.trades;
    else {
      events = (await readTradeRange(rpc, market, start, end)).map(storeTrade);
      if (await canonical(rpc, end) !== endHash) throw new Error("History changed during indexing. Retry.");
      if (durable) await storage.put(key, JSON.stringify({endHash, trades: events}));
    }
    trades.push(...events);
    scannedFrom = start;
    end = start - 1n;
    if (trades.length) break;
  }
  if (await canonical(rpc, scannedTo) !== anchorHash) throw new Error("History changed during indexing. Retry.");
  return {networkId: "robinhood:testnet", trades, nextCursor: end >= first ? end.toString() : null,
    scannedFrom: scannedFrom.toString(), scannedTo: scannedTo.toString(), creationBlock: first.toString(), confirmedThrough: latest.toString()};
}
