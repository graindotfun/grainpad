import {previewContinuousCreatorBuy} from './v3-launch-preview.ts';
/**
 * Chain-agnostic one-approval EVM launch foundation.
 * Pure functions only: no wallet, RPC, signing or storage access. Nothing here broadcasts a transaction.
 * A chain plugs in by supplying an `EvmLaunchProfile` (factory, chain id, quote policy, metadata origin).
 */
import {keccak_256} from "@noble/hashes/sha3";
import {assertMetadataText, metadataLink} from "../metadata-shared.ts";

const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) => "0x" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const fromHex = (value: string) => Uint8Array.from(value.replace(/^0x/, "").match(/../g) ?? [], b => parseInt(b, 16));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};
const word = (n: bigint) => {
  if (n < 0n || n >= 1n << 256n) throw new Error("ABI integer out of range.");
  return fromHex(n.toString(16).padStart(64, "0"));
};
const addressWord = (a: string) => concat(new Uint8Array(12), fromHex(assertAddress(a)));
export const keccakHex = (bytes: Uint8Array) => hex(keccak_256(bytes));

export function assertAddress(value: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("Invalid address.");
  return value.toLowerCase();
}
export function assertBytes32(value: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("Invalid bytes32.");
  return value.toLowerCase();
}

/** Everything a chain contributes. Adding a chain adds a profile, never new flow logic. */
export type EvmLaunchProfile = {
  marketModel?: "uniswap-v3-continuous";
  networkId: string;
  chainId: number;
  /** Exact deployed factory implementing `createAndLaunch`. */
  factory: string;
  /** Public HTTPS origin that serves the immutable metadata document. */
  metadataOrigin: string;
  /** Path template, `{launchId}` is replaced. Must not depend on the (not yet known) token address. */
  metadataPath: string;
  assetOrigin: string;
  registrationWindowSeconds: number;
};

// ---------------------------------------------------------------------------------------------------------------
// Metadata document: the single object whose keccak256 is bound on-chain.
// ---------------------------------------------------------------------------------------------------------------

export type TokenMetadataInput = {
  name: string; symbol: string; description: string;
  /** sha256 hex of the already-uploaded image bytes, or null. */
  imageSha256: string | null;
  website: string; twitter: string; telegram: string;
};

export type TokenMetadataDocument = {
  schema: "grainpad.token-metadata.v1";
  name: string; symbol: string; description: string;
  image: string | null;
  external_url: string;
  links: {website: string; twitter: string; telegram: string};
  chain: {networkId: string; chainId: number; factory: string; launchId: string};
};

export function buildTokenMetadata(profile: EvmLaunchProfile, launchId: string, input: TokenMetadataInput): TokenMetadataDocument {
  const description = input.description.trim().replace(/\r\n/g, "\n");
  if (description.length > 1000) throw new Error("Description is limited to 1000 characters.");
  assertMetadataText({name: input.name, symbol: input.symbol, description});
  assertMetadataText({name: input.symbol, symbol: input.symbol, description: ""});
  if (input.imageSha256 !== null && !/^[a-f0-9]{64}$/.test(input.imageSha256)) throw new Error("Invalid image hash.");
  const website = metadataLink(input.website, "website"), twitter = metadataLink(input.twitter, "twitter"), telegram = metadataLink(input.telegram, "telegram");
  const id = assertBytes32(launchId);
  return {
    schema: "grainpad.token-metadata.v1",
    name: input.name, symbol: input.symbol, description,
    image: input.imageSha256 ? profile.assetOrigin + "/api/assets/" + input.imageSha256 : null,
    external_url: website,
    links: {website, twitter, telegram},
    chain: {networkId: profile.networkId, chainId: profile.chainId, factory: assertAddress(profile.factory), launchId: id},
  };
}

/** Fixed key order, no whitespace: the byte string that is hashed is the byte string that is served. */
export function canonicalTokenMetadataBytes(doc: TokenMetadataDocument): Uint8Array {
  const ordered = {
    schema: doc.schema, name: doc.name, symbol: doc.symbol, description: doc.description, image: doc.image,
    external_url: doc.external_url, links: {website: doc.links.website, twitter: doc.links.twitter, telegram: doc.links.telegram},
    chain: {networkId: doc.chain.networkId, chainId: doc.chain.chainId, factory: doc.chain.factory, launchId: doc.chain.launchId},
  };
  return encoder.encode(JSON.stringify(ordered));
}
export const tokenMetadataHash = (doc: TokenMetadataDocument) => keccakHex(canonicalTokenMetadataBytes(doc));
export function tokenMetadataURI(profile: EvmLaunchProfile, launchId: string): string {
  const uri = profile.metadataOrigin + profile.metadataPath.replace("{launchId}", assertBytes32(launchId));
  if (!uri.startsWith("https://") || encoder.encode(uri).length > 256) throw new Error("Metadata URI must be HTTPS and at most 256 bytes.");
  return uri;
}

// ---------------------------------------------------------------------------------------------------------------
// Monero registration authorization digest. Must equal GrainMainnetFactoryV2.registrationDigest.
// ---------------------------------------------------------------------------------------------------------------

export const REGISTRATION_TYPE =
  "GrainpadMoneroRegistration(uint256 chainId,address factory,address creator,bytes32 launchId,bytes32 nameHash,bytes32 symbolHash,bytes32 metadataHash,uint64 expiresAt,uint32 sequence)";

export function registrationDigest(a: {chainId: number; factory: string; creator: string; launchId: string; name: string; symbol: string; metadataHash: string; expiresAt: bigint; sequence?: number}): string {
  if (a.expiresAt <= 0n || a.expiresAt >= 1n << 64n) throw new Error("Invalid registration expiry.");
  const sequence = a.sequence ?? 0;
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 0xffffffff) throw new Error("Invalid registration sequence.");
  return keccakHex(concat(
    keccak_256(encoder.encode(REGISTRATION_TYPE)), word(BigInt(a.chainId)), addressWord(a.factory), addressWord(a.creator),
    fromHex(assertBytes32(a.launchId)), keccak_256(encoder.encode(a.name)), keccak_256(encoder.encode(a.symbol)),
    fromHex(assertBytes32(a.metadataHash)), word(a.expiresAt), word(BigInt(sequence)),
  ));
}

// ---------------------------------------------------------------------------------------------------------------
// createAndLaunch calldata.
// ---------------------------------------------------------------------------------------------------------------

export const CREATE_AND_LAUNCH_SIGNATURE = "createAndLaunch((string,string,bytes32,string,bytes32,uint64,uint256,uint256))";
export const createAndLaunchSelector = () => hex(keccak_256(encoder.encode(CREATE_AND_LAUNCH_SIGNATURE)).slice(0, 4));

export type CreateAndLaunchArgs = {
  name: string; symbol: string; launchId: string; metadataURI: string; metadataHash: string;
  registrationExpiresAt: bigint; minTokensOut: bigint; deadline: bigint;
};
const abiString = (s: string) => {
  const bytes = encoder.encode(s), padded = new Uint8Array(Math.ceil(bytes.length / 32) * 32);
  padded.set(bytes);
  return concat(word(BigInt(bytes.length)), padded);
};

/** Header words of createAndLaunch calldata (selector, 0x20 offset, then the 8-word tuple head). Null for anything else. */
export function decodeCreateAndLaunchHeader(data: string): {launchId: string; metadataHash: string; registrationExpiresAt: bigint; minTokensOut: bigint; deadline: bigint} | null {
  if (typeof data !== "string" || !/^0x([0-9a-f]{2})+$/i.test(data)) return null;
  const lower = data.toLowerCase();
  if (lower.length < 2 + 2 * (4 + 32 + 8 * 32) || lower.slice(0, 10) !== createAndLaunchSelector()) return null;
  const w = (i: number) => "0x" + lower.slice(10 + i * 64, 10 + (i + 1) * 64);
  if (BigInt(w(0)) !== 32n) return null;
  return {launchId: w(3), metadataHash: w(5), registrationExpiresAt: BigInt(w(6)), minTokensOut: BigInt(w(7)), deadline: BigInt(w(8))};
}

export function encodeCreateAndLaunch(a: CreateAndLaunchArgs): string {
  const strings = [abiString(a.name), abiString(a.symbol), abiString(a.metadataURI)];
  // Tuple head: 8 words. Dynamic members (name, symbol, metadataURI) are offset from the start of the tuple.
  let offset = 8n * 32n;
  const offsets: bigint[] = [];
  for (const s of strings) { offsets.push(offset); offset += BigInt(s.length); }
  const tuple = concat(
    word(offsets[0]), word(offsets[1]), fromHex(assertBytes32(a.launchId)), word(offsets[2]), fromHex(assertBytes32(a.metadataHash)),
    word(a.registrationExpiresAt), word(a.minTokensOut), word(a.deadline), ...strings,
  );
  // Outer call: one dynamic argument, so its offset is 0x20.
  return hex(concat(fromHex(createAndLaunchSelector()), word(32n), tuple));
}

// ---------------------------------------------------------------------------------------------------------------
// Optional creator buy. Mirrors GrainMainnetCurve/GrainMainnetPolicy integer math at the deterministic empty state.
// ---------------------------------------------------------------------------------------------------------------

export type CurveEconomics = {
  virtualQuote: bigint; virtualToken: bigint; saleSupply: bigint; graduationQuote: bigint;
  platformBps: bigint; creatorBps: bigint;
};
export const RH_MAINNET_CURVE: CurveEconomics = {
  virtualQuote: 10n ** 18n, virtualToken: 200_000_000n * 10n ** 18n, saleSupply: 800_000_000n * 10n ** 18n,
  graduationQuote: 4n * 10n ** 18n, platformBps: 35n, creatorBps: 65n,
};
const fee = (amount: bigint, bps: bigint) => (amount / 10_000n) * bps + ((amount % 10_000n) * bps) / 10_000n;

export type CreatorBuyPreview = {
  quoteIn: bigint; platformFee: bigint; creatorFee: bigint; totalFee: bigint; net: bigint;
  tokensOut: bigint; slippageBps: number; minTokensOut: bigint; effectiveFeeBps: number;
  /** ETH the transaction carries: exactly quoteIn. Gas is separate and not included. */
  transactionValue: bigint;
};
export function previewCreatorBuy(quoteIn: bigint, slippageBps: number, e: CurveEconomics = RH_MAINNET_CURVE): CreatorBuyPreview {
  if (quoteIn <= 0n) throw new Error("Enter a positive amount, or leave the creator buy empty.");
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 500) throw new Error("Slippage must be 0 to 500 bps.");
  const platformFee = fee(quoteIn, e.platformBps), creatorFee = fee(quoteIn, e.creatorBps), net = quoteIn - platformFee - creatorFee;
  if (net <= 0n) throw new Error("Amount is too small.");
  if (net > e.graduationQuote) throw new Error("Amount exceeds the curve's graduation target.");
  const tokensOut = (e.virtualToken + e.saleSupply) * net / (e.virtualQuote + net);
  if (tokensOut === 0n) throw new Error("Amount is too small.");
  if (tokensOut > e.saleSupply) throw new Error("Amount exceeds the sale supply.");
  const minTokensOut = tokensOut * BigInt(10_000 - slippageBps) / 10_000n;
  return {quoteIn, platformFee, creatorFee, totalFee: platformFee + creatorFee, net, tokensOut, slippageBps, minTokensOut,
    effectiveFeeBps: Number((platformFee + creatorFee) * 10_000n / quoteIn), transactionValue: quoteIn};
}

// ---------------------------------------------------------------------------------------------------------------
// Whole-launch plan: what the single wallet request contains, shown before approval.
// ---------------------------------------------------------------------------------------------------------------

export type LaunchPlan = {
  to: string; data: string; value: string; chainId: string;
  launchId: string; metadataURI: string; metadataHash: string; registrationDigest: string; registrationExpiresAt: bigint;
  /** The factory reverts when block.timestamp > deadline, so past this instant no copy of `data` can ever create the launch. */
  deadline: bigint;
  /** keccak256 of `data`: lets a recovered transaction be matched to exactly what this launch asked the wallet to send. */
  dataHash: string;
  creatorBuy: CreatorBuyPreview | null;
  /** Human-readable, for the review screen. Every field here is also in `data`. */
  review: string[];
};

export function planOneApprovalLaunch(profile: EvmLaunchProfile, input: {
  creator: string; launchId: string; metadata: TokenMetadataInput; buyWei: bigint; slippageBps: number; nowSeconds: number; deadlineSeconds?: number;
}): {plan: LaunchPlan; metadata: TokenMetadataDocument} {
  const creator = assertAddress(input.creator), launchId = assertBytes32(input.launchId);
  if (launchId.slice(0, 42) !== creator) throw new Error("Launch id is bound to a different creator.");
  const metadata = buildTokenMetadata(profile, launchId, input.metadata);
  const metadataHash = tokenMetadataHash(metadata), metadataURI = tokenMetadataURI(profile, launchId);
  const expiresAt = BigInt(input.nowSeconds + profile.registrationWindowSeconds);
  const buy = input.buyWei > 0n ? (profile.marketModel === "uniswap-v3-continuous" ? previewContinuousCreatorBuy(input.buyWei, input.slippageBps) : previewCreatorBuy(input.buyWei, input.slippageBps)) : null;
  const deadline = BigInt(input.nowSeconds + (input.deadlineSeconds ?? 600));
  const data = encodeCreateAndLaunch({name: input.metadata.name, symbol: input.metadata.symbol, launchId, metadataURI, metadataHash,
    registrationExpiresAt: expiresAt, minTokensOut: buy ? buy.minTokensOut : 0n, deadline});
  const digest = registrationDigest({chainId: profile.chainId, factory: profile.factory, creator, launchId, name: input.metadata.name, symbol: input.metadata.symbol, metadataHash, expiresAt});
  const review = [
    `Create ${input.metadata.name} (${input.metadata.symbol}) on chain ${profile.chainId}`,
    `Bind metadata ${metadataURI} (keccak256 ${metadataHash})`,
    `Authorize Monero registration of this launch until ${new Date(Number(expiresAt) * 1000).toISOString()}`,
    ...(buy ? [
      `Creator buy: ${buy.quoteIn} wei in, fees ${buy.totalFee} wei (${buy.effectiveFeeBps / 100}%), net to ${profile.marketModel ? "pool" : "curve"} ${buy.net} wei`,
      `Expected tokens ${buy.tokensOut}, minimum ${buy.minTokensOut} at ${buy.slippageBps} bps slippage`,
    ] : ["No creator buy"]),
  ];
  return {metadata, plan: {to: assertAddress(profile.factory), data, value: "0x" + (buy?.transactionValue ?? 0n).toString(16), chainId: "0x" + profile.chainId.toString(16),
    launchId, metadataURI, metadataHash, registrationDigest: digest, registrationExpiresAt: expiresAt, deadline, dataHash: keccakHex(fromHex(data)), creatorBuy: buy, review}};
}

// ---------------------------------------------------------------------------------------------------------------
// Verify a mined receipt against the plan. The creator's own transaction is the Monero authorization.
// ---------------------------------------------------------------------------------------------------------------

const topic = (signature: string) => hex(keccak_256(encoder.encode(signature)));
export const TOPICS = {
  launchCreated: topic("LaunchCreated(bytes32,address,address,string,string)"),
  metadataBound: topic("LaunchMetadataBound(bytes32,address,address,string,bytes32)"),
  registrationAuthorized: topic("MoneroRegistrationAuthorized(bytes32,address,bytes32,uint64,uint32)"),
  creatorBuy: topic("CreatorBuy(bytes32,address,uint256,uint256)"),
};
type Log = {address: string; topics: string[]; data: string; removed?: boolean};

export type VerifiedOneApprovalReceipt = {
  tokenAddress: string; creator: string; launchId: string; metadataURI: string; metadataHash: string;
  registrationDigest: string; registrationExpiresAt: bigint; creatorBuy: {quoteIn: bigint; tokensOut: bigint} | null;
};
const readWord = (data: string, i: number) => BigInt("0x" + data.slice(2 + i * 64, 66 + i * 64));
function readString(data: string, offsetWord: number): string {
  const start = Number(readWord(data, offsetWord)) * 2 + 2, length = Number(BigInt("0x" + data.slice(start, start + 64)));
  return new TextDecoder("utf-8", {fatal: true}).decode(fromHex(data.slice(start + 64, start + 64 + length * 2)));
}

export function verifyOneApprovalReceipt(profile: EvmLaunchProfile, receipt: {status?: string; logs?: Log[]}, expected: {
  creator: string; launchId: string; metadataHash: string; metadataURI: string; registrationDigest: string; registrationExpiresAt: bigint;
}): VerifiedOneApprovalReceipt {
  if (receipt?.status !== "0x1" || !Array.isArray(receipt.logs)) throw new Error("Launch transaction did not succeed.");
  const factory = assertAddress(profile.factory);
  const own = receipt.logs.filter(l => !l.removed && l.address.toLowerCase() === factory);
  const one = (t: string) => { const m = own.filter(l => l.topics[0]?.toLowerCase() === t); if (m.length !== 1) throw new Error("Expected exactly one factory event."); return m[0]; };
  const created = one(TOPICS.launchCreated), bound = one(TOPICS.metadataBound), auth = one(TOPICS.registrationAuthorized);
  const creator = assertAddress(expected.creator), launchId = assertBytes32(expected.launchId);
  const addr = (t: string) => "0x" + t.slice(26).toLowerCase();
  const token = addr(created.topics[2]);
  if (created.topics[1].toLowerCase() !== launchId || addr(created.topics[3]) !== creator) throw new Error("Launch identity differs from the plan.");
  if (bound.topics[1].toLowerCase() !== launchId || addr(bound.topics[2]) !== token || addr(bound.topics[3]) !== creator) throw new Error("Metadata binding names a different launch.");
  if (readString(bound.data, 0) !== expected.metadataURI || ("0x" + bound.data.slice(66, 130)).toLowerCase() !== expected.metadataHash.toLowerCase()) throw new Error("Metadata binding differs from the uploaded document.");
  if (auth.topics[1].toLowerCase() !== launchId || addr(auth.topics[2]) !== creator) throw new Error("Authorization names a different launch.");
  const digest = "0x" + auth.data.slice(2, 66), expires = readWord(auth.data, 1);
  if (digest.toLowerCase() !== expected.registrationDigest.toLowerCase() || expires !== expected.registrationExpiresAt || readWord(auth.data, 2) !== 0n) throw new Error("Registration authorization differs from the plan.");
  const buys = own.filter(l => l.topics[0]?.toLowerCase() === TOPICS.creatorBuy);
  if (buys.length > 1) throw new Error("Unexpected duplicate creator buy.");
  const buy = buys[0] ? {quoteIn: readWord(buys[0].data, 0), tokensOut: readWord(buys[0].data, 1)} : null;
  return {tokenAddress: token, creator, launchId, metadataURI: expected.metadataURI, metadataHash: expected.metadataHash.toLowerCase(), registrationDigest: digest.toLowerCase(), registrationExpiresAt: expires, creatorBuy: buy};
}
