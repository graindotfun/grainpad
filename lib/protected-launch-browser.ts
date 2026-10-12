import {inspectTransactionStatus} from './transaction-status.mjs';
import './browser-buffer.mjs';
import {Buffer} from 'buffer';
import {Keypair,VersionedTransaction} from '@solana/web3.js';
import bs58 from 'bs58';
import {buildProtectedCreate,PROTECTED_LOCAL_PROGRAM,protectedProgramAddresses} from './protected-launch-program.mjs';
import {buildMetadataPublication,contentHash} from './metadata-publication.mjs';
import {parseTokenUnits} from './quote-assets.mjs';
import {metadataPayload,metadataMessage,type MetadataDraft} from './metadata-shared';
import {signWalletFirst} from './wallet-signing.mjs';
import {verifyProtectedSubmission} from './protected-launch-review.mjs';
import {assertProtectedFundingReview} from './protected-funding-review.mjs';
export type ProtectedFundingExpectation={asset:string;amount:string;programId:string};
import {rpc,assertNetwork} from './launch';
import type {Wallet} from './wallet';
export type ProtectedDraft={name:string;symbol:string;description:string;imageBase64:string;imageType:string;nonce:string;opensAt:number;closesAt:number;deadline:number;cap:string;minimumTokens:string;taxBps:number};
export type ProtectedReview={id:string;version:string;wire:string;messageHash:string;owner:string;summary:Record<string,unknown>;requiredLocalSigners:string[];blockhash:string;lastValidBlockHeight:number;createdAt:number;expiresAt:number;maxDebitLamports:number;networkFeeLamports:number};
const signers=new WeakMap<object,Keypair[]>();
export async function protectedJSON<T>(path:string,body?:unknown):Promise<T>{if(body||path.includes('?creator=')){const session=await fetch('/api/rpc-session',{method:'POST',credentials:'same-origin'});if(!session.ok)throw Error('Wallet connection is temporarily unavailable.');}const r=await fetch(path,{credentials:'same-origin',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),value=await r.json() as T & {error?:string};if(!r.ok)throw Error(value.error||'Protected Launch request failed.');return value;}
export async function draftProtectedLaunch(owner:string,draft:ProtectedDraft,programId=PROTECTED_LOCAL_PROGRAM){
 const a=protectedProgramAddresses({creator:owner,nonce:draft.nonce,programId});
 const metadata:MetadataDraft={name:draft.name,symbol:draft.symbol,description:draft.description,imageBase64:draft.imageBase64,imageType:draft.imageType,owner,mint:String(a.mint),expires:Date.now()+600000};
 const image=Buffer.from(draft.imageBase64,'base64'),publication=await buildMetadataPublication(metadata,image,'https://grainpad.fun');
 const terms={nonce:draft.nonce,opensAt:draft.opensAt,closesAt:draft.closesAt,deadline:draft.deadline,capRaw:String(parseTokenUnits(draft.cap,12)),minimumTokenRaw:String(parseTokenUnits(draft.minimumTokens,6)),taxBps:draft.taxBps,metadataHash:publication.metadataHash,name:metadata.name.trim(),symbol:metadata.symbol.trim(),uri:publication.uri};
 const built=buildProtectedCreate({creator:owner,terms,programId});return {terms,metadata,publication,commitment:built.commitment,mint:String(a.mint),launch:String(a.launch)};
}
export async function publishProtectedMetadata(wallet:Wallet,draft:Awaited<ReturnType<typeof draftProtectedLaunch>>){
 const owner=draft.metadata.owner;if(wallet.publicKey?.toBase58()!==owner)throw Error('Creator wallet changed.');
 const message=metadataMessage(window.location.origin,await contentHash(new TextEncoder().encode(metadataPayload(draft.metadata))));
 const signed=await wallet.signMessage(new TextEncoder().encode(message),'utf8');if(wallet.publicKey?.toBase58()!==owner)throw Error('Creator wallet changed.');
 const result=await protectedJSON<{uri:string;metadataHash:string}>('/api/protected-launch/metadata',{nonce:draft.terms.nonce,draft:draft.metadata,signature:bs58.encode(signed instanceof Uint8Array?signed:signed.signature)});
 if(result.uri!==draft.terms.uri||result.metadataHash!==draft.terms.metadataHash)throw Error('Published metadata differs from this reviewed draft.');
}
export async function requestProtectedReview(input:Record<string,unknown>,expected?:ProtectedFundingExpectation){
 const temporary:Keypair[]=[];if(input.action==='fund'||input.action==='lookup'){
  if(input.asset!=='wXMR'){const output=Keypair.generate();temporary.push(output);input={...input,intermediate:String(output.publicKey)};
   const wsol=Keypair.generate();temporary.push(wsol);input={...input,...(input.asset==='SOL'?{source:String(wsol.publicKey)}:{wsolIntermediate:String(wsol.publicKey)})};}
 }
 const result=await protectedJSON<{reviews:ProtectedReview[];lookup:string|null;setupId?:string;nextStep?:number|null}>('/api/protected-launch',input);
 for(const review of result.reviews){if(review.owner!==input.owner)throw Error('Review owner changed.');if(review.summary.action==='fund'){if(!expected)throw Error('Contribution approval details are required.');assertProtectedFundingReview(review,{owner:String(input.owner),...expected});}const needed=review.requiredLocalSigners.map(id=>{const signer=temporary.find(s=>String(s.publicKey)===id);if(!signer)throw Error('Unexpected local signer.');return signer;});signers.set(review,needed);}
 return result;
}
export async function submitProtectedReview(review:ProtectedReview,wallet:Wallet,onSigned:(receipt:{id:string;signature:string;wire:string;lastValidBlockHeight:number})=>void,expected?:ProtectedFundingExpectation){
 // The bytes about to be signed still carry the approved currency, exact input and conversion minimum.
 if(review.summary.action==='fund'){if(!expected)throw Error('Contribution approval details are required.');assertProtectedFundingReview(review,{owner:review.owner,...expected});}
 const availability=await protectedJSON<{availability:{enabled:boolean}}>('/api/protected-launch');if(!availability.availability.enabled)throw Error('Protected Launch deposits are not open.');
 const connection=rpc('mainnet-beta');await assertNetwork(connection,'mainnet-beta');const height=await connection.getBlockHeight('confirmed');
 if(Date.now()>=review.expiresAt||height>review.lastValidBlockHeight-10||wallet.publicKey?.toBase58()!==review.owner)throw Error('Review expired or wallet changed. Prepare a new review.');
 const local=signers.get(review);if(!local)throw Error('Prepare a fresh review in this tab.');
 const transaction=VersionedTransaction.deserialize(Buffer.from(review.wire,'base64'));
 const signed=await signWalletFirst({transaction,wallet,owner:review.owner,additionalSignerPublicKeys:local.map(s=>s.publicKey),...(local.length?{cosign:(tx:VersionedTransaction)=>tx.sign(local)}:{})});
 const wire=Buffer.from(signed.serialize()).toString('base64'),verified=verifyProtectedSubmission(review,wire,{height:await connection.getBlockHeight('confirmed')});
 const receipt={id:review.id,signature:verified.signature,wire,lastValidBlockHeight:review.lastValidBlockHeight};
 // Receipt is durably stored by the caller before the first network submission.
 onSigned(receipt);signers.delete(review);return protectedJSON<{signature:string}>('/api/protected-launch/submit',{id:review.id,wire});
}

export async function recoverProtectedReceipt(receipt:{signature:string;lastValidBlockHeight:number}){
 const connection=rpc('mainnet-beta',undefined,receipt.signature);await assertNetwork(connection,'mainnet-beta');
 return inspectTransactionStatus(connection,receipt.signature,{expiry:receipt.lastValidBlockHeight});
}
