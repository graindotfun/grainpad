import {PublicKey} from '@solana/web3.js';
import {GRN1_MAGIC_TEXT,GRN1_VERSION,GRN1_DOMAIN_TEXT} from './monero-record-format.mjs';
const unhex=(s,n)=>{if(typeof s!=='string'||!new RegExp(`^[0-9a-f]{${n*2}}$`).test(s))throw Error('Invalid canonical message field.');return Uint8Array.from(s.match(/../g),v=>parseInt(v,16));};
const address=s=>{const key=new PublicKey(s);if(typeof s!=='string'||key.toBase58()!==s)throw Error('Invalid canonical address.');return key.toBytes();};
const hex=b=>Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');
/** Derive every byte from the values presented to the creator; never sign a server blob.
 * @param {any} intent
 * @param {string} expectedMint
 * @param {string|null} expectedCreator */
export function canonicalCreatorMessage(intent,expectedMint,expectedCreator=null){
 if(!intent||intent.mint!==expectedMint||(expectedCreator!==null&&intent.creator!==expectedCreator))throw Error('Publication identity changed.');
 const parts=[new TextEncoder().encode(GRN1_DOMAIN_TEXT),new TextEncoder().encode(GRN1_MAGIC_TEXT),Uint8Array.of(GRN1_VERSION,0),address(intent.mint),unhex(intent.metadataHash,32),address(intent.creator),unhex(intent.nonce,16),Uint8Array.of(0)];
 const bytes=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 if(intent.messageHex!==hex(bytes))throw Error('Server message differs from the reviewed GRN1 identity.');
 return bytes;
}
