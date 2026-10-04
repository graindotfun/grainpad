/** Server-only official generation identity. Browser components must not import this module. */
import {PublicKey} from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {OFFICIAL_GENERATION} from './official-launch-policy.mjs';
import {assertNotPreviousOfficialMint} from './previous-official-mints.mjs';
import {PLATFORM_SETTINGS} from './platform-settings.mjs';
import {assertMintSuffix} from './vanity-suffix.ts';
const hex=/^[a-f0-9]{64}$/;
export async function readOfficialGenerationIdentity(db,generation=OFFICIAL_GENERATION){
 return db.prepare('SELECT generation,mint,metadata_hash,metadata_uri,registered_at FROM official_generation_identity WHERE generation=?').bind(generation).first();
}
/** Stores the public key and metadata hash after the admin signs the review. The secret never arrives. */
export async function registerOfficialGenerationIdentity(db,{generation=OFFICIAL_GENERATION,mint,metadataHash,metadataUri,message,signature}){
 if(generation!==OFFICIAL_GENERATION)throw Error('Official identity generation is not the current relaunch.');
 assertNotPreviousOfficialMint(mint);
 const key=new PublicKey(mint);
 if(key.toBase58()!==mint)throw Error('Official mint must be canonical.');
 assertMintSuffix(mint);
 if(!hex.test(metadataHash)||metadataUri!==`https://grainpad.fun/api/assets/${metadataHash}`)throw Error('Official metadata hash does not match its URI.');
 if(typeof message!=='string'||!message.includes(`Mint: ${mint}`)||!message.includes(`Metadata-Hash: ${metadataHash}`))throw Error('Identity approval does not name this mint.');
 const bytes=new TextEncoder().encode(message),sig=bs58.decode(signature);
 if(!nacl.sign.detached.verify(bytes,sig,bs58.decode(PLATFORM_SETTINGS.admin)))throw Error('Admin identity approval is not valid.');
 const existing=await readOfficialGenerationIdentity(db,generation);
 if(existing&&(existing.mint!==mint||existing.metadata_hash!==metadataHash))throw Error('Official generation identity is already registered.');
 if(existing)return existing;
 await db.prepare('INSERT INTO official_generation_identity (generation,mint,metadata_hash,metadata_uri,approval_message,approval_signature,registered_at) VALUES (?,?,?,?,?,?,?)').bind(generation,mint,metadataHash,metadataUri,message,signature,Date.now()).run();
 const saved=await readOfficialGenerationIdentity(db,generation);
 if(saved?.mint!==mint||saved.metadata_hash!==metadataHash)throw Error('Official generation identity was not recorded.');
 return saved;
}
