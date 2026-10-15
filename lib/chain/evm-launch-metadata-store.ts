/**
 * Stable public metadata for one-approval launches.
 * Documents are stored by (launchId, content hash). Only the document whose hash is bound on-chain is ever served,
 * so a stranger who uploads under someone else's launch id (the prefix is public) can never displace or be served
 * in place of the creator's document.
 */
import {assertBytes32, assertAddress, canonicalTokenMetadataBytes, keccakHex, tokenMetadataURI, type EvmLaunchProfile, type TokenMetadataDocument} from "./evm-one-approval-launch.ts";
import {keccak_256} from "@noble/hashes/sha3";

export type BlobStore = {
  get(key: string): Promise<{arrayBuffer(): Promise<ArrayBuffer>} | null>;
  put(key: string, value: Uint8Array, options: {onlyIf: {etagDoesNotMatch: "*"}; httpMetadata?: {contentType: string; cacheControl: string}}): Promise<unknown>;
};
export type EthRpc = (method: string, params: unknown[]) => Promise<unknown>;

export const tokenMetadataKey = (profile: EvmLaunchProfile, launchId: string, hash: string) => `evm-launch-metadata/${profile.chainId}/${assertBytes32(launchId)}/${assertBytes32(hash)}`;
const selector = (sig: string) => Array.from(keccak_256(new TextEncoder().encode(sig)).slice(0, 4), b => b.toString(16).padStart(2, "0")).join("");

/** Pre-approval upload. Idempotent: identical bytes succeed, the document is never overwritten. */
export async function storeTokenMetadata(store: BlobStore, profile: EvmLaunchProfile, doc: TokenMetadataDocument) {
  const bytes = canonicalTokenMetadataBytes(doc), hash = keccakHex(bytes);
  if (doc.chain.factory !== assertAddress(profile.factory) || doc.chain.chainId !== profile.chainId) throw new Error("Metadata names a different chain or factory.");
  await store.put(tokenMetadataKey(profile, doc.chain.launchId, hash), bytes, {onlyIf: {etagDoesNotMatch: "*"}, httpMetadata: {contentType: "application/json; charset=utf-8", cacheControl: "public, max-age=31536000, immutable"}});
  return {hash, bytes: bytes.length};
}

export type ServedMetadata = {body: Uint8Array; hash: string; token: string; document: TokenMetadataDocument};
export type ExpectedIdentity = {name: string; symbol: string};

function decodeAbiString(value: unknown, maxLength = 2048): string {
  if (typeof value !== "string" || !/^0x([0-9a-f]{2})*$/i.test(value) || value.length < 2 + 128) throw new Error("Invalid contract response.");
  const bytes = Uint8Array.from(value.slice(2).match(/../g) ?? [], b => parseInt(b, 16));
  const offset = Number(BigInt("0x" + value.slice(2, 66))), length = Number(BigInt("0x" + value.slice(2 + offset * 2, 2 + offset * 2 + 64)));
  if (offset !== 32 || !Number.isSafeInteger(length) || length > maxLength || 32 + 32 + length > bytes.length) throw new Error("Invalid contract response.");
  return new TextDecoder("utf-8", {fatal: true}).decode(bytes.slice(64, 64 + length));
}

/**
 * Resolves launchId -> token -> bound hash on-chain, then serves the stored bytes only if ALL of these hold:
 * keccak256(bytes) equals the token's metadataHash(); the token's contractURI() is exactly this launch's metadata URL;
 * the document names the same network, chain, factory and launch id; and its name and symbol equal the token's own name()
 * and symbol() (and `expected`, the finalized LaunchCreated values, when the caller has them). Null if not (yet) bound.
 */
export async function readBoundTokenMetadata(store: BlobStore, rpc: EthRpc, profile: EvmLaunchProfile, launchId: string, expected?: ExpectedIdentity): Promise<ServedMetadata | null> {
  const id = assertBytes32(launchId);
  const call = (to: string, data: string) => rpc("eth_call", [{to, data}, "latest"]);
  const word = async (to: string, data: string) => {
    const r = await call(to, data);
    if (typeof r !== "string" || !/^0x[0-9a-f]{64}$/i.test(r)) throw new Error("Invalid contract response.");
    return r;
  };
  const tokenWord = await word(assertAddress(profile.factory), "0x" + selector("tokenOf(bytes32)") + id.slice(2));
  if (/^0x0{64}$/.test(tokenWord)) return null;
  const token = "0x" + tokenWord.slice(26);
  const hash = (await word(token, "0x" + selector("metadataHash()"))).toLowerCase();
  const object = await store.get(tokenMetadataKey(profile, id, hash));
  let onChainURI: string | null = null;
  let body: Uint8Array;
  if (object) body = new Uint8Array(await object.arrayBuffer());
  else if (profile.metadataMode === "inline-direct") {
    // This generation carries the complete immutable document itself. Recovery must not require an earlier HTTP upload.
    onChainURI = decodeAbiString(await call(token, "0x" + selector("contractURI()")), 8192);
    const prefix = "data:application/json;base64,";
    if (!onChainURI.startsWith(prefix)) throw Error("Direct metadata URI is invalid.");
    const encoded = onChainURI.slice(prefix.length);
    if (!encoded.length || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw Error("Direct metadata encoding is invalid.");
    body = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  } else return null;
  if (keccakHex(body) !== hash) throw new Error("Stored metadata does not match the on-chain hash.");
  let document: TokenMetadataDocument;
  try { document = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(body)) as TokenMetadataDocument; } catch { throw new Error("Stored metadata is not valid JSON."); }
  // The hash binds bytes; identity binds meaning. A document for another launch, factory or token must never be served here.
  if (document.schema !== "grainpad.token-metadata.v1" || document.chain?.networkId !== profile.networkId || document.chain.chainId !== profile.chainId ||
      document.chain.factory !== assertAddress(profile.factory) || document.chain.launchId !== id) throw new Error("Metadata names a different network, factory or launch.");
  if ((onChainURI ?? decodeAbiString(await call(token, "0x" + selector("contractURI()")), profile.metadataMode === "inline-direct" ? 8192 : 2048)) !== tokenMetadataURI(profile, id, document)) throw new Error("Token contractURI is not this launch's metadata URL.");
  const onChainName = decodeAbiString(await call(token, "0x" + selector("name()"))), onChainSymbol = decodeAbiString(await call(token, "0x" + selector("symbol()")));
  if (document.name !== onChainName || document.symbol !== onChainSymbol) throw new Error("Metadata name or symbol differs from the token.");
  if (expected && (document.name !== expected.name || document.symbol !== expected.symbol)) throw new Error("Metadata name or symbol differs from the finalized launch.");
  return {body, hash, token, document};
}

/** What Grainpad can honestly claim. Third-party ingestion needs separate evidence and is never inferred. */
export type MetadataDiscoveryStatus = {
  savedByGrainpad: boolean;
  boundOnChain: boolean;
  servedHashMatches: boolean;
  /** Provider -> evidence URL or screenshot reference recorded by a person after observing the provider itself. */
  externalConfirmations: Record<string, {evidence: string; observedAt: string}>;
};
export function discoverySummary(s: MetadataDiscoveryStatus): string[] {
  const lines = [
    s.savedByGrainpad ? "Saved by Grainpad" : "Not saved",
    s.boundOnChain ? "Bound to the token on-chain" : "Not bound on-chain",
    s.servedHashMatches ? "Served bytes match the on-chain hash" : "Served bytes not verified",
  ];
  const providers = Object.keys(s.externalConfirmations);
  lines.push(providers.length ? "Confirmed by provider evidence: " + providers.join(", ") : "No external provider has been confirmed");
  return lines;
}
