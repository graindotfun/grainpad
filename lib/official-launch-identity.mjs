/** Server-only official generation identity. Browser components must not import this module. */
import {PublicKey} from '@solana/web3.js';
import {OFFICIAL_GENERATION,OFFICIAL_LAUNCH_CREATOR} from './official-launch-policy.mjs';
import {assertNotPreviousOfficialMint} from './previous-official-mints.mjs';
import {assertMintSuffix} from './vanity-suffix.ts';
const hex=/^[a-f0-9]{64}$/;
export async function readOfficialGenerationIdentity(db,generation=OFFICIAL_GENERATION){
 return db.prepare('SELECT generation,mint,metadata_hash,metadata_uri,registered_at FROM official_generation_identity WHERE generation=?').bind(generation).first();
}
/** Stores the public key only after the creation transaction is finalized. The secret never arrives. */
export async function registerConfirmedOfficialIdentity(db,reservation){
 if(!reservation||reservation.state!=='registered'||(reservation.generation!==undefined&&reservation.generation!==OFFICIAL_GENERATION))throw Error('Official generation identity is recorded only after the creation transaction is finalized.');
 if(reservation.creator!==OFFICIAL_LAUNCH_CREATOR)throw Error('Official identity creator does not match the locked creator.');
 const mint=reservation.mint,metadataHash=reservation.metadata_hash,metadataUri=`https://grainpad.fun/api/assets/${metadataHash}`;
 const existing=await readOfficialGenerationIdentity(db);
 if(existing&&(existing.mint!==mint||existing.metadata_hash!==metadataHash))throw Error('Official generation identity is already registered.');
 if(existing)return existing;
 assertNotPreviousOfficialMint(mint);
 const key=new PublicKey(mint);
 if(key.toBase58()!==mint)throw Error('Official mint must be canonical.');
 assertMintSuffix(mint);
 if(!hex.test(metadataHash))throw Error('Official metadata hash does not match its URI.');
 const message=`Confirmed official creation\nMint: ${mint}\nMetadata-Hash: ${metadataHash}\nSignature: ${reservation.signature}`;
 await db.prepare('INSERT INTO official_generation_identity (generation,mint,metadata_hash,metadata_uri,approval_message,approval_signature,registered_at) VALUES (?,?,?,?,?,?,?)').bind(OFFICIAL_GENERATION,mint,metadataHash,metadataUri,message,reservation.signature,Date.now()).run();
 const saved=await readOfficialGenerationIdentity(db);
 if(saved?.mint!==mint||saved.metadata_hash!==metadataHash)throw Error('Official generation identity was not recorded.');
 return saved;
}
/** Refused before confirmation. An early admin signature cannot write the immutable row. */
export async function registerOfficialGenerationIdentity(){
 throw Error('Official generation identity is recorded only after the creation transaction is finalized.');
}
