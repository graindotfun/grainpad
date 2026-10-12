/** Mandatory readable creator authorization precedes any financial launch wallet prompt. */
import nacl from 'tweetnacl';
import {MONERO_PRELAUNCH_AUTHORIZATION_ENABLED} from './monero-prelaunch-policy.mjs';
import {mintProvenanceProofMessage} from './monero-prelaunch-identity.mjs';
import {createCreatorIntentSignerForPolicy} from './monero-creator-signing.mjs';
import {canonicalCreatorMessage} from './monero-creator-message.mjs';
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
function createAuthorizer({enabled=false,request}={},replacement=false){
 const sign=createCreatorIntentSignerForPolicy({enabled});
 return async function authorize(prepared,wallet,mintSigner){
  if(!enabled)return {authorized:false,reason:'Mandatory provenance policy is not active.'};
  if(prepared.network!=='mainnet-beta'||wallet?.publicKey?.toBase58()!==prepared.owner||mintSigner?.publicKey?.toBase58()!==prepared.mint||typeof request!=='function')throw Error('Matching launch creator and fresh mint signer required.');
  const fields={mint:prepared.mint,creator:prepared.owner,metadataHash:prepared.metadataHash,platformId:prepared.platformId};
  const mintProof=hex(nacl.sign.detached(mintProvenanceProofMessage(fields),mintSigner.secretKey));
  const fresh=()=>request({action:replacement?'replacement-intent':'intent',...fields,mintProof});
  const intent=await fresh();canonicalCreatorMessage(intent,fields.mint,fields.creator);
  if(intent.metadataHash!==fields.metadataHash||intent.creatorAuthorizationVersion!==2)throw Error('Planned launch provenance identity changed.');
  if(intent.state!=='creator-authorized'){
   if(intent.state!=='awaiting-creator-signature')throw Error('Planned creator state changed.');
   const signature=await sign(intent,wallet,{acknowledged:true,expectedMint:fields.mint,expectedCreator:fields.creator,expectedMetadataHash:fields.metadataHash,freshIntent:fresh});
   const saved=await request({action:replacement?'replacement-signature':'signature',...fields,mintProof,nonce:intent.nonce,signature});
   if(saved.nonce!==intent.nonce||saved.state!=='creator-authorized')throw Error('Planned creator signature was not persisted. No launch can be signed.');
  }
  const checked=await request({action:'check',...fields,mintProof});
  canonicalCreatorMessage(checked,fields.mint,fields.creator);
  if(checked.creatorAuthorizationVersion!==2||checked.state!=='creator-authorized'||checked.nonce!==intent.nonce||checked.mint!==fields.mint||checked.creator!==fields.creator||checked.metadataHash!==fields.metadataHash||wallet.publicKey?.toBase58()!==fields.creator)throw Error('Persisted creator authorization changed. No launch can be signed.');
  return {authorized:true,nonce:checked.nonce};
 };
}
export function createPrelaunchAuthorizer(options={}){return createAuthorizer(options);}
/** An explicit replacement approval only. The normal authorizer never falls back
 * to this action after a conflict; the server retains prior signed authorizations. */
export function createPrelaunchReplacementAuthorizer(options={}){return createAuthorizer(options,true);}
async function request(body){const response=await fetch('/api/monero-prelaunch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error||'Prelaunch creator authorization unavailable.');return data;}
export const authorizePlannedLaunch=createPrelaunchAuthorizer({enabled:MONERO_PRELAUNCH_AUTHORIZATION_ENABLED,request});
export const replacePlannedLaunchAuthorization=createPrelaunchReplacementAuthorizer({enabled:MONERO_PRELAUNCH_AUTHORIZATION_ENABLED,request});
