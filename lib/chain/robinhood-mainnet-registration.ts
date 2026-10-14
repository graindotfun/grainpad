import {mainnetCoreRecord,verifyMainnetDisplay,canonicalMainnetDisplayJSON,type MainnetDisplayAuthorization} from './robinhood-mainnet-display.ts';
import {describeRobinhoodReceipt, type RobinhoodRecordStore} from "./robinhood-registration.ts";
import {address, bytes32, type Rpc} from "./robinhood-market.ts";
import {ROBINHOOD_CHAIN_MAINNET} from "./robinhood-mainnet.ts";

export type MainnetLaunchRecord = {
  networkId: "robinhood:mainnet"; chainId: 4663; tokenAddress: string; launchId: string;
  transactionHash: string; name: string; symbol: string; creator: string; factory: string;
  display?:MainnetDisplayAuthorization;
};
export const mainnetLaunchRecordKey = (token: string) => `robinhood-launches/4663/${address(token)}`;
const quantity = (value: unknown): bigint => {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) throw new Error("Invalid mainnet block number.");
  return BigInt(value);
};
export async function assertMainnetRpc(rpc: Rpc) {
  if (quantity(await rpc("eth_chainId", [])) !== 4663n) throw new Error("Registration RPC is not Robinhood mainnet.");
}
export function describeMainnetReceipt(receipt: unknown, factory: string, hash: string): MainnetLaunchRecord {
  // The event ABI is chain-independent. No testnet storage or RPC is accessed.
  const record = describeRobinhoodReceipt(receipt, address(factory), bytes32(hash));
  if (record.launchId.slice(0, 42) !== record.creator) throw new Error("Mainnet launch id differs from its creator binding.");
  return {...record, networkId: "robinhood:mainnet", chainId: ROBINHOOD_CHAIN_MAINNET.chainId};
}

/** Trust only finalized, canonical receipts at the source-configured factory. */
export async function registerRobinhoodMainnetLaunch(input: {transactionHash: string; factory: string}, deps: {storage: RobinhoodRecordStore; rpc: Rpc}): Promise<MainnetLaunchRecord> {
  const hash = bytes32(input.transactionHash), factory = address(input.factory);
  await assertMainnetRpc(deps.rpc);
  const receipt = await deps.rpc("eth_getTransactionReceipt", [hash]) as {blockNumber?: unknown; blockHash?: unknown} | null;
  const record = describeMainnetReceipt(receipt, factory, hash);
  const number = quantity(receipt?.blockNumber), blockHash = bytes32(receipt?.blockHash);
  const finalized = await deps.rpc("eth_getBlockByNumber", ["finalized", false]) as {number?: unknown} | null;
  if (quantity(finalized?.number) < number) throw new Error("Wait for mainnet finalization, then retry registration.");
  const canonical = await deps.rpc("eth_getBlockByNumber", ["0x" + number.toString(16), false]) as {hash?: unknown} | null;
  if (bytes32(canonical?.hash) !== blockHash) throw new Error("Mainnet create receipt was reorganized.");
  await assertMainnetRpc(deps.rpc);
  const key = mainnetLaunchRecordKey(record.tokenAddress);
  const existing = await readRobinhoodMainnetLaunch(deps.storage, record.tokenAddress, factory);
  if (existing) {
    if (JSON.stringify(mainnetCoreRecord(existing)) !== JSON.stringify(mainnetCoreRecord(record))) throw new Error("This mainnet token is already registered with different launch data.");
    return existing;
  }
  await deps.storage.put(key, JSON.stringify(record));
  return record;
}

export async function readRobinhoodMainnetLaunch(storage: RobinhoodRecordStore, token: string, factory: string): Promise<MainnetLaunchRecord | null> {
  const key = mainnetLaunchRecordKey(token), object = await storage.get(key);
  if (!object) return null;
  const record = JSON.parse(await object.text()) as MainnetLaunchRecord;
  if (!record || record.networkId !== "robinhood:mainnet" || record.chainId !== 4663 ||
      mainnetLaunchRecordKey(record.tokenAddress) !== key || address(record.factory) !== address(factory)) return null;
  bytes32(record.launchId); bytes32(record.transactionHash); address(record.creator);
  if (record.launchId.slice(0,42) !== record.creator) return null;
  if (typeof record.name !== "string" || typeof record.symbol !== "string" ||
      new TextEncoder().encode(record.name).length < 1 || new TextEncoder().encode(record.name).length > 32 ||
      new TextEncoder().encode(record.symbol).length < 1 || new TextEncoder().encode(record.symbol).length > 10) return null;
  const display=await storage.get(mainnetDisplayRecordKey(record.tokenAddress));
  if(!display)return mainnetCoreRecord(record);
  const signed=JSON.parse(await display.text()) as {displayMetadata?:unknown;displaySignature?:unknown};
  if(!signed||Object.keys(signed).length!==2||!Object.hasOwn(signed,'displayMetadata')||!Object.hasOwn(signed,'displaySignature'))throw Error('Stored creator display record is invalid.');
  return {...mainnetCoreRecord(record),display:{metadata:verifyMainnetDisplay(record,signed.displayMetadata,signed.displaySignature),signature:signed.displaySignature as string}};
}

export const mainnetDisplayRecordKey=(token:string)=>`robinhood-display/4663/${address(token)}`;
export type MainnetDisplayStore=RobinhoodRecordStore & {put(key:string,value:string,options:{onlyIf:{etagDoesNotMatch:'*'}}):Promise<unknown>};
/** Separately stored creator authorization, first writer immutable; never rewrites the financial identity. */
export async function attachRobinhoodMainnetDisplay(record:MainnetLaunchRecord,display:unknown,signature:unknown,storage:MainnetDisplayStore):Promise<MainnetLaunchRecord>{
 const metadata=verifyMainnetDisplay(record,display,signature),key=mainnetDisplayRecordKey(record.tokenAddress);
 const compare=async()=>{const existing=await readRobinhoodMainnetLaunch(storage,record.tokenAddress,record.factory);if(!existing||JSON.stringify(mainnetCoreRecord(existing))!==JSON.stringify(mainnetCoreRecord(record)))throw Error('Registered source identity changed.');if(existing.display?.metadata){if(canonicalMainnetDisplayJSON(existing.display?.metadata)!==canonicalMainnetDisplayJSON(metadata))throw Error('This launch already has different creator-signed display details.');return existing;}return null;};
 const prior=await compare();if(prior)return prior;
 await storage.put(key,JSON.stringify({displayMetadata:metadata,displaySignature:signature}),{onlyIf:{etagDoesNotMatch:'*'}});
 const winner=await compare();if(!winner)throw Error('Display publication unavailable. Retry the same signature and draft.');return winner;
}

export async function listRobinhoodMainnetLaunches(storage: RobinhoodRecordStore & {list(options: {prefix: string; limit: number; cursor?: string}): Promise<{objects: {key: string}[]; truncated: boolean; cursor?: string}>}, factory: string, cursor?: string) {
  if (cursor !== undefined && (!cursor || cursor.length > 2000)) throw new Error("Invalid token directory cursor.");
  const prefix = "robinhood-launches/4663/";
  const page = await storage.list({prefix, limit: 10, ...(cursor ? {cursor} : {})});
  const records = await Promise.all(page.objects.filter(object => object.key.startsWith(prefix)).map(async object => {
    try { return await readRobinhoodMainnetLaunch(storage, object.key.slice(prefix.length), factory); } catch { return null; }
  }));
  return {records: records.filter((record): record is MainnetLaunchRecord => !!record), nextCursor: page.truncated ? page.cursor ?? null : null};
}
