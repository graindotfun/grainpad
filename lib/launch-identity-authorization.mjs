/** Exact metadata/banner/community consent. It is NOT a GRN1 signature. */
import {PublicKey} from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
export const LAUNCH_IDENTITY_AUTHORIZATION='grainpad.launch-identity.authorization.v1';
const fields=['schema','origin','network','creator','mint','metadataPayloadHash','metadataHash','imageHash','headerHash','xCommunity','expires'];
const encoder=new TextEncoder();
function address(value){
 if(typeof value!=='string'||new PublicKey(value).toBase58()!==value||!PublicKey.isOnCurve(new PublicKey(value).toBytes()))throw Error('Canonical launch address required.');
 return value;
}
function hash(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw Error('Canonical launch SHA-256 required.');return value;}
export function canonicalLaunchIdentityAuthorization(input){
 if(!input||Object.keys(input).sort().join(',')!==[...fields].sort().join(','))throw Error('Exact launch identity authorization fields required.');
 if(input.schema!==LAUNCH_IDENTITY_AUTHORIZATION||input.origin!=='https://grainpad.fun'||input.network!=='mainnet-beta')throw Error('Launch identity authorization domain changed.');
 if(input.headerHash!==null)hash(input.headerHash);
 if(input.xCommunity!==null&&(typeof input.xCommunity!=='string'||!/^https:\/\/x\.com\/i\/communities\/\d{1,20}$/.test(input.xCommunity)))throw Error('Canonical X Community required.');
 if(!Number.isSafeInteger(input.expires)||input.expires<=0)throw Error('Launch identity expiry required.');
 return Object.freeze({schema:input.schema,origin:input.origin,network:input.network,creator:address(input.creator),mint:address(input.mint),metadataPayloadHash:hash(input.metadataPayloadHash),metadataHash:hash(input.metadataHash),imageHash:hash(input.imageHash),headerHash:input.headerHash,xCommunity:input.xCommunity,expires:input.expires});
}
export function launchIdentityAuthorizationMessage(input){
 const p=canonicalLaunchIdentityAuthorization(input);
 return ['GRAINPAD LAUNCH IDENTITY AUTHORIZATION V1',`Origin: ${p.origin}`,`Network: ${p.network}`,`Creator: ${p.creator}`,`Mint: ${p.mint}`,`Signed metadata draft SHA-256: ${p.metadataPayloadHash}`,`Published metadata SHA-256: ${p.metadataHash}`,`Image SHA-256: ${p.imageHash}`,`Banner SHA-256: ${p.headerHash??'None'}`,`X Community: ${p.xCommunity??'None'}`,`Expires: ${p.expires}`,'I authorize publishing this exact token metadata, banner and X Community.','This message authorizes no transfer, delegation, wallet control, Monero record or financial approval.'].join('\n');
}
/** Expected fields must be reconstructed from validated upload bytes and the
 * deterministic publication, never copied from the submitted proof. */
export function verifyLaunchIdentityAuthorization(proof,expected,{now=Date.now(),historical=false}={}){
 if(!proof||Object.keys(proof).sort().join(',')!=='payload,signature')throw Error('Exact signed identity proof required.');
 const payload=canonicalLaunchIdentityAuthorization(proof.payload),binding=canonicalLaunchIdentityAuthorization(expected);
 if(JSON.stringify(payload)!==JSON.stringify(binding))throw Error('Signed launch identity differs from validated publication.');
 if(!historical&&(!Number.isSafeInteger(now)||payload.expires<=now||payload.expires>now+900000))throw Error('Launch identity authorization expired or too far in the future.');
 let signature;
 try{if(typeof proof.signature!=='string'||proof.signature.length>100)throw Error();signature=bs58.decode(proof.signature);}catch{throw Error('Creator must sign this exact launch identity.');}
 if(signature.length!==64||!nacl.sign.detached.verify(encoder.encode(launchIdentityAuthorizationMessage(payload)),signature,new PublicKey(payload.creator).toBytes()))throw Error('Creator must sign this exact launch identity.');
 return payload;
}
/** Optional client primitive. Caller still owns wallet UI and cancellation. */
export async function signLaunchIdentityAuthorization(wallet,input,{now=Date.now()}={}){
 const payload=canonicalLaunchIdentityAuthorization(input),creator=payload.creator;
 if(wallet?.publicKey?.toBase58()!==creator||typeof wallet.signMessage!=='function')throw Error('Matching creator wallet required.');
 // Validate freshness before requesting a wallet, then again when it returns.
 if(!Number.isSafeInteger(now)||payload.expires<=now||payload.expires>now+900000)throw Error('Launch identity authorization expired.');
 const result=await wallet.signMessage(encoder.encode(launchIdentityAuthorizationMessage(payload)),'utf8');
 if(wallet.publicKey?.toBase58()!==creator)throw Error('Creator wallet changed during identity approval.');
 const proof={payload,signature:bs58.encode(result instanceof Uint8Array?result:result.signature)};
 verifyLaunchIdentityAuthorization(proof,payload);
 return proof;
}

/** Historical projections supply every independently known identity field.
 * Remaining signed fields stay in the preserved full envelope, never discarded. */
export function verifyScopedLaunchIdentityAuthorization(proof,scope,{historical=true,now=Date.now()}={}){
 const required=['creator','mint','metadataHash','imageHash'];
 if(!scope||required.some(k=>!Object.hasOwn(scope,k))||Object.keys(scope).some(k=>!fields.includes(k)))throw Error('Complete independently reconstructed launch scope required.');
 return verifyLaunchIdentityAuthorization(proof,{...proof?.payload,...scope},{historical,now});
}
