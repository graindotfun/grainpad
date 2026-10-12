import './browser-buffer.mjs';
import { Keypair } from "@solana/web3.js";

import {MINT_SUFFIX,OFFICIAL_MINT_SUFFIX,type MintSuffix} from "./vanity-suffix";
export {MINT_SUFFIX} from "./vanity-suffix";

/** Import a newly generated mint-only signing key. Never an existing wallet key. */
function parseMint(text: string,suffix:MintSuffix): Keypair {
  if (text.length > 4096) throw Error("Mint key file is too large.");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw Error("Choose the generated mint key JSON file."); }
  if (!Array.isArray(raw) || raw.length !== 64 || !raw.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) {
    throw Error("Expected a 64-byte mint keypair. Do not import your Phantom wallet or seed.");
  }
  const bytes = Uint8Array.from(raw);
  raw.fill(0);
  let mint: Keypair;
  // web3.js retains the supplied array. Give the key its own copy before wiping the parser buffer.
  try { mint = Keypair.fromSecretKey(bytes.slice()); } catch { throw Error("Mint keypair failed signature-key validation."); }
  finally { bytes.fill(0); }
  if (!mint.publicKey.toBase58().endsWith(suffix)) {
    throw Error(`Mint address must end with lowercase ${suffix} exactly.`);
  }
  return mint;
}

export const parseVanityMint=(text:string):Keypair=>parseMint(text,MINT_SUFFIX);
export const parseOfficialVanityMint=(text:string):Keypair=>parseMint(text,OFFICIAL_MINT_SUFFIX);
