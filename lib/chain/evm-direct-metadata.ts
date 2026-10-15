/** Pure encoding for the exact immutable interface exercised by GMETA. No RPC, wallet or activation. */
import {keccak_256} from "@noble/hashes/sha3";
import type {CreateAndLaunchArgs, TokenMetadataDocument} from "./evm-one-approval-launch.ts";

const encoder = new TextEncoder();
const hex = (b: Uint8Array) => "0x" + Array.from(b, n => n.toString(16).padStart(2, "0")).join("");
const bytes = (h: string) => Uint8Array.from(h.replace(/^0x/, "").match(/../g) ?? [], n => parseInt(n, 16));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0; for (const p of parts) { out.set(p, offset); offset += p.length; } return out;
};
const word = (n: bigint) => {
  if (n < 0n || n >= 1n << 256n) throw Error("ABI integer out of range.");
  return bytes(n.toString(16).padStart(64, "0"));
};
const bytes32 = (s: string) => { if (!/^0x[0-9a-f]{64}$/i.test(s)) throw Error("Invalid bytes32."); return bytes(s); };
const string = (s: string) => {
  const b = encoder.encode(s), padded = new Uint8Array(Math.ceil(b.length / 32) * 32); padded.set(b);
  return concat(word(BigInt(b.length)), padded);
};
/** Tuple whose members are all dynamic. Offsets are relative to this tuple, including nested tuples. */
const dynamicTuple = (parts: Uint8Array[]) => {
  let offset = BigInt(parts.length * 32);
  const head = parts.map(p => { const w = word(offset); offset += BigInt(p.length); return w; });
  return concat(...head, ...parts);
};
export const DIRECT_METADATA_CREATE_SIGNATURE = "createAndLaunch((string,string,bytes32,string,bytes32,uint64,uint256,uint256,(string,string,(string,string,string,string,string))))";
export const directMetadataSelector = () => hex(keccak_256(encoder.encode(DIRECT_METADATA_CREATE_SIGNATURE)).slice(0, 4));

export type DirectTokenDisplay = {image: string; description: string; socials: {twitter: string; telegram: string; discord: string; website: string; farcaster: string}};
function text(value: unknown, max: number, required = false): asserts value is string {
  if (typeof value !== "string" || encoder.encode(value).length > max || required && !value.length ||
      new TextDecoder("utf-8", {fatal: true}).decode(encoder.encode(value)) !== value) throw Error("Direct metadata text is invalid or exceeds its byte limit.");
}
function link(value: unknown, required = false): asserts value is string {
  text(value, 256, required);
  if (value && (!/^(https:\/\/.+|ipfs:\/\/.+)$/.test(value) || /[\x00-\x20@\\]/.test(value))) throw Error("Direct metadata link is invalid.");
}
export function directMetadataDisplay(doc: TokenMetadataDocument): DirectTokenDisplay {
  text(doc.name, 32, true); text(doc.symbol, 10, true); text(doc.description, 1000);
  link(doc.image, true); link(doc.links.website); link(doc.links.twitter); link(doc.links.telegram);
  if (doc.schema !== "grainpad.token-metadata.v1" || doc.chain.networkId !== "robinhood:mainnet" || doc.chain.chainId !== 4663 ||
      !/^0x[0-9a-f]{40}$/.test(doc.chain.factory) || !/^0x[0-9a-f]{64}$/.test(doc.chain.launchId) || doc.external_url !== doc.links.website) throw Error("Direct metadata identity differs.");
  return {image: doc.image, description: doc.description, socials: {twitter: doc.links.twitter, telegram: doc.links.telegram, discord: "", website: doc.links.website, farcaster: ""}};
}
export function inlineMetadataURI(body: Uint8Array): string {
  const uri = "data:application/json;base64," + btoa(Array.from(body, n => String.fromCharCode(n)).join(""));
  if (uri.length > 8192) throw Error("Direct metadata URI exceeds its byte limit.");
  return uri;
}
export function encodeDirectMetadataCreate(a: CreateAndLaunchArgs, doc: TokenMetadataDocument): string {
  const d = directMetadataDisplay(doc);
  if (a.name !== doc.name || a.symbol !== doc.symbol || a.launchId !== doc.chain.launchId) throw Error("Direct metadata launch differs.");
  const canonical = encoder.encode(JSON.stringify({schema: doc.schema, name: doc.name, symbol: doc.symbol, description: doc.description,
    image: doc.image, external_url: doc.external_url, links: {website: doc.links.website, twitter: doc.links.twitter, telegram: doc.links.telegram},
    chain: {networkId: doc.chain.networkId, chainId: doc.chain.chainId, factory: doc.chain.factory, launchId: doc.chain.launchId}}));
  if (a.metadataURI !== inlineMetadataURI(canonical) || a.metadataHash !== hex(keccak_256(canonical))) throw Error("Direct metadata commitment differs.");
  const display = dynamicTuple([string(d.image), string(d.description), dynamicTuple([d.socials.twitter, d.socials.telegram, d.socials.discord, d.socials.website, d.socials.farcaster].map(string))]);
  const tails = [string(a.name), string(a.symbol), string(a.metadataURI), display];
  let offset = 9n * 32n;
  const offsets = tails.map(p => { const w = word(offset); offset += BigInt(p.length); return w; });
  const tuple = concat(offsets[0], offsets[1], bytes32(a.launchId), offsets[2], bytes32(a.metadataHash), word(a.registrationExpiresAt), word(a.minTokensOut), word(a.deadline), offsets[3], ...tails);
  return hex(concat(bytes(directMetadataSelector()), word(32n), tuple));
}
