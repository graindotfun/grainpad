/** GRN1 v2 application authorization text; ordinary UTF-8, not an OCMS envelope. */
import {PublicKey} from '@solana/web3.js';
const address=value=>{if(typeof value!=='string'||new PublicKey(value).toBase58()!==value)throw Error('Canonical creator authorization address required.');return value;};
const hex=(value,length)=>{if(typeof value!=='string'||!new RegExp(`^[0-9a-f]{${length}}$`).test(value))throw Error('Canonical creator authorization hex required.');return value;};
export function creatorAuthorizationTextV2({mint,creator,metadataHash,nonce}){
 return [
  'GRAINPAD PROVENANCE AUTHORIZATION V2',
  'Domain: grainpad.fun',
  'Solana network: mainnet-beta',
  'Monero network: mainnet',
  'Record: GRN1 version 2',
  `Mint: ${address(mint)}`,
  `Metadata SHA-256: ${hex(metadataHash,64)}`,
  `Creator: ${address(creator)}`,
  `Nonce: ${hex(nonce,32)}`,
  'Flags: 0',
  'I attest this immutable token identity for a Monero provenance record.',
  'This message authorizes no transfer, delegation, wallet control, or financial approval.',
 ].join('\n');
}
export function creatorAuthorizationBytesV2(fields){return new TextEncoder().encode(creatorAuthorizationTextV2(fields));}
