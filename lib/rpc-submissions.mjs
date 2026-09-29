import {Buffer} from 'buffer';
import {VersionedTransaction} from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
export function submittedSignature(encoded){
 const tx=VersionedTransaction.deserialize(Buffer.from(encoded,'base64')),count=tx.message.header.numRequiredSignatures;
 if(count<1||tx.signatures.length!==count)throw Error('Invalid transaction signatures.');
 const message=tx.message.serialize();
 for(let i=0;i<count;i++)if(!nacl.sign.detached.verify(message,tx.signatures[i],tx.message.staticAccountKeys[i].toBytes()))throw Error('Invalid transaction signature. Nothing was sent.');
 return bs58.encode(tx.signatures[0]);
}
export function validSignature(value){try{return typeof value==='string'&&value.length<=88&&bs58.decode(value).length===64;}catch{return false;}}
const remembered=new WeakMap();
function local(db){let map=remembered.get(db);if(!map){map=new Map();remembered.set(db,map);}return map;}
export async function isSubmitted(db,network,signature,now=Date.now()){
 if(!validSignature(signature))return false;
 const map=local(db),key=network+':'+signature;
 if((map.get(key)||0)>now)return true;
 const row=await db.prepare('SELECT expires_at FROM rpc_submissions WHERE signature=? AND network=? AND expires_at>?').bind(signature,network,now).first();
 if(row){if(map.size>=2000)map.clear();map.set(key,row.expires_at);return true;}return false;
}
/** Before forwarding: a lost RPC response must still permit confirmation checks. */
export async function rememberSubmission(db,network,signature,now=Date.now()){
 if(!validSignature(signature))throw Error('Invalid submitted signature.');
 if(await isSubmitted(db,network,signature,now))return;
 const expires=now+86_400_000;
 await db.prepare('INSERT INTO rpc_submissions (signature,network,created_at,expires_at) VALUES (?,?,?,?) ON CONFLICT(signature) DO UPDATE SET expires_at=excluded.expires_at WHERE rpc_submissions.expires_at<=?').bind(signature,network,now,expires,now).run();
 const map=local(db);if(map.size>=2000)map.clear();map.set(network+':'+signature,expires);
 await db.prepare('DELETE FROM rpc_submissions WHERE signature IN (SELECT signature FROM rpc_submissions WHERE expires_at<=? LIMIT 100)').bind(now).run();
}
/** Legitimate confirmation loops check one signature per call; a small bound keeps
 * each request to a few receipt lookups. */
export const MAX_EXEMPT_SIGNATURES=8;
/** Only signatures recorded by this relay before forwarding their send skip the
 * daily budget. A signature-shaped string alone is not evidence of a submission. */
export async function dailyExemption(db,network,body,signatureHint,now=Date.now()){
 if(body.method==='sendTransaction')return true;
 const sigs=body.method==='getSignatureStatuses'?body.params?.[0]:body.method==='getTransaction'?[body.params?.[0]]:null;
 if(sigs){
  if(!Array.isArray(sigs)||sigs.length<1||sigs.length>MAX_EXEMPT_SIGNATURES||!sigs.every(validSignature))return false;
  for(const signature of sigs)if(!await isSubmitted(db,network,signature,now))return false;
  return true;
 }
 // Recovery needs network/expiry/target reads for the recorded submission it names.
 if(['getGenesisHash','getBlockHeight','getAccountInfo'].includes(body.method))return isSubmitted(db,network,signatureHint,now);
 return false;
}
