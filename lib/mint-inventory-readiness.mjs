import {PublicKey,VersionedTransaction} from '@solana/web3.js';
import {Buffer} from 'buffer';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {resolveTransactionAddresses} from './transaction-addresses.mjs';
import {decodeReviewedTransaction} from './wallet-transaction-policy.mjs';
import {contentHash} from './metadata-publication.mjs';
import {OFFICIAL_LAUNCH_CREATOR} from './official-launch-policy.mjs';
import {PLATFORM_SETTINGS} from './platform-settings.mjs';
import {POLICY} from './platform-policy.mjs';
import {MINT_ALLOCATION_REVISION} from './mint-allocation-protocol.mjs';
/** A mutable stock check is a launch gate, never a claim that search capacity is unlimited. */
export function mintInventoryReadinessErrors(value,now,{officialInventoryProof}={}){
 const errors=[];
 if(!value||value.revision!==MINT_ALLOCATION_REVISION||value.publicSuffix!=='grn'||value.officialSuffix!=='grain')errors.push('Review the exact encrypted public grn / official grain inventory revision.');
 if(!Number.isSafeInteger(value?.availableMintCount)||value.availableMintCount<1||value.serviceReady!==true)errors.push('At least one unused public grn mint and its configured live allocation service must be ready.');
 let official=false;try{official=typeof value?.officialMint==='string'&&value.officialMint.endsWith('grain')&&new PublicKey(value.officialMint).toBase58()===value.officialMint&&PublicKey.isOnCurve(new PublicKey(value.officialMint).toBytes());}catch{}
 if(value?.officialPhase==='finalized-published'){
  const proof=officialInventoryProof;
  if(!official||!postLaunchFieldsMatch(value)||value.officialMintUnused!==false||!verifiedProofs.has(proof)||!Number.isSafeInteger(proof?.verifiedAt)||proof.verifiedAt>now+10000||now-proof.verifiedAt>300000)errors.push('Independently verify the exact finalized official launch and published CA within five minutes.');
 }else if(!official||value?.officialMint===FINALIZED_OFFICIAL_INVENTORY.mint||value?.officialMintUnused!==true||(value?.officialPhase!=null&&value.officialPhase!=='unused'))errors.push('Independently prepare the exact unused lowercase grain official mint.');
 const checkedAt=Date.parse(value?.checkedAt);if(!Number.isFinite(checkedAt)||checkedAt>now+10000||now-checkedAt>300000)errors.push('Recheck mutable inventory and service within five minutes of opening.');
 if(value?.creatorBindingVerified!==true||value?.neverReissuedVerified!==true||value?.encryptedDeliveryVerified!==true||value?.restartRecoveryVerified!==true)errors.push('Verify creator binding, encrypted delivery, permanent assignment and restart recovery.');
 if(typeof value?.evidence!=='string'||!value.evidence.trim())errors.push('Attach the actual independently reviewed inventory/official preparation evidence.');
 return errors;
}

/** Exact immutable public launch receipt; this never grants signing authority. */
export const FINALIZED_OFFICIAL_INVENTORY=Object.freeze({
 mint:'FCN2KLyUGT9EddKf8MZYjPce8CWxUid7nWpAx9ograin',
 metadataHash:'9734421a0d11cd50e6d4aa40e88fa6e177f15d09322703492eab7c713b42b86e',
 signature:'42BifJNgrqV61nrNJfXSqiQgHQ3DBLF55M6sCfrvwCRtDJ85ouMCmqWHzfoL7yfBX5yaw5yXtVxv1wJB9jqHHKZz',
 slot:453744080,sourceCommit:'15a7c2bd27190be85aa84732f0bc63e04b64b929',
});
const verifiedProofs=new WeakSet();
function postLaunchFieldsMatch(v){const p=FINALIZED_OFFICIAL_INVENTORY;return v?.officialMint===p.mint&&v.officialMetadataHash===p.metadataHash&&v.officialLaunchSignature===p.signature&&v.officialLaunchSlot===p.slot&&v.officialLaunchSourceCommit===p.sourceCommit;}
function assertDecodedOfficial(view){
 const p=FINALIZED_OFFICIAL_INVENTORY;
 if(view.payer!==OFFICIAL_LAUNCH_CREATOR||view.signers.length!==3||!view.signers.includes(PLATFORM_SETTINGS.admin)||!view.signers.includes(p.mint))throw Error('Finalized official signer identities differ.');
 const instructions=view.instructions.filter(i=>i.programId===POLICY.program),launches=instructions.filter(i=>i.dataHex.startsWith('25be7ede2c9aab11'));
 if(launches.length!==1||instructions.filter(i=>i.dataHex.startsWith('4547a807d6fa6b66')).length!==1||launches[0].accounts[6]?.key!==p.mint)throw Error('Finalized official launch or atomic admission differs.');
 const data=Buffer.from(launches[0].dataHex,'hex');let offset=9;
 const text=max=>{if(offset+4>data.length)throw Error('Truncated official launch text.');const size=data.readUInt32LE(offset);offset+=4;if(size<1||size>max||offset+size>data.length)throw Error('Invalid official launch text.');const value=new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(offset,offset+size));offset+=size;return value;};
 if(text(32)!=='Grainpad'||text(10)!=='GRAIN'||text(200)!==`https://grainpad.fun/api/assets/${p.metadataHash}`)throw Error('Finalized official metadata identity differs.');
 return launches[0].accounts[5]?.key;
}
/** Primary chain reads plus the site's verified registered publication. Only this
 * module can brand the result; serialized booleans/objects are never proof. No sends. */
export async function verifyFinalizedOfficialInventory(value,{connection,fetchImpl=fetch}={}){
 if(value?.officialPhase!=='finalized-published'||value.officialMintUnused!==false||!postLaunchFieldsMatch(value)||typeof connection?._rpcRequest!=='function')throw Error('Exact postlaunch inventory identity and primary connection required.');
 const p=FINALIZED_OFFICIAL_INVENTORY;
 const read=async(method,params)=>{const result=await connection._rpcRequest(method,params);if(!result||result.error||!Object.hasOwn(result,'result'))throw Error('Primary official inventory proof unavailable.');return result.result;};
 if(await read('getGenesisHash',[])!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('Official inventory proof requires Solana mainnet.');
 const statuses=await read('getSignatureStatuses',[[p.signature],{searchTransactionHistory:true}]),status=statuses?.value?.[0];
 if(!Number.isSafeInteger(statuses?.context?.slot)||statuses.context.slot<p.slot||!Array.isArray(statuses?.value)||statuses.value.length!==1||status?.confirmationStatus!=='finalized'||status.err!==null||status.slot!==p.slot)throw Error('Exact official receipt is not finalized.');
 const receipt=await read('getTransaction',[p.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);
 if(receipt?.slot!==p.slot||receipt?.meta?.err!==null||!Array.isArray(receipt.transaction)||receipt.transaction[1]!=='base64'||typeof receipt.transaction[0]!=='string')throw Error('Exact finalized official transaction unavailable.');
 const tx=VersionedTransaction.deserialize(Buffer.from(receipt.transaction[0],'base64'));
 if(tx.signatures.length!==3||bs58.encode(tx.signatures[0])!==p.signature||tx.signatures.some((signature,i)=>!nacl.sign.detached.verify(tx.message.serialize(),signature,tx.message.staticAccountKeys[i].toBytes())))throw Error('Finalized official transaction signatures differ.');
 const context=tx.message.addressTableLookups.length?await resolveTransactionAddresses(connection,tx,{minContextSlot:p.slot}):undefined;
 if(JSON.stringify(receipt.meta.loadedAddresses?.writable)!==JSON.stringify(context?.loadedWritable??[])||JSON.stringify(receipt.meta.loadedAddresses?.readonly)!==JSON.stringify(context?.loadedReadonly??[]))throw Error('Finalized receipt lookup mapping differs.');
 const launchPool=assertDecodedOfficial(decodeReviewedTransaction(tx,context));
 const get=async(path)=>{const response=await fetchImpl(`https://grainpad.fun${path}`,{method:'GET',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Official publication proof unavailable.');return response.json();};
 const row=(await get('/api/owner/official-launch'))?.pending;
 if(row?.generation!==2||row.state!=='registered'||row.signature!==p.signature||row.mint!==p.mint||row.creator!==OFFICIAL_LAUNCH_CREATOR||row.metadata_hash!==p.metadataHash||row.message_hash!==await contentHash(tx.message.serialize()))throw Error('Registered official receipt does not match the finalized message.');
 const ca=await get('/api/token'),token=ca?.token;
 if(ca?.network!=='mainnet-beta'||ca.generation!==2||token?.generation!==2||token.mint!==p.mint||token.token_program!=='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'||typeof token.pool!=='string'||token.pool!==launchPool||new PublicKey(token.pool).toBase58()!==token.pool||!Number.isFinite(Date.parse(token.published_at)))throw Error('Verified official CA publication differs.');
 const proof=Object.freeze({...p,verifiedAt:Date.now()});verifiedProofs.add(proof);return proof;
}
