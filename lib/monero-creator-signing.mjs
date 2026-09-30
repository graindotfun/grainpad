/** Creator message only; no native construction/relay or spend authority. */
import nacl from 'tweetnacl';
import {PublicKey} from '@solana/web3.js';
import {canonicalCreatorMessage} from './monero-creator-message.mjs';
export const MONERO_CREATOR_SIGNING_ENABLED=false;
/** @param {any} intent @param {any} wallet @param {any} options */
export async function signReviewedCreatorIntent(intent,wallet,{acknowledged=false,expectedMint=intent?.mint,expectedCreator=null,expectedMetadataHash=null,freshIntent}={}){
 if(!MONERO_CREATOR_SIGNING_ENABLED)throw Error('Creator message signing remains locked.');
 if((expectedCreator!==null&&intent?.creator!==expectedCreator)||(expectedMetadataHash!==null&&intent?.metadataHash!==expectedMetadataHash))throw Error('Registered launch binding changed.');
 const creator=wallet?.publicKey?.toBase58();if(!intent||!acknowledged||creator!==intent.creator)throw Error('Matching creator wallet and review required.');
 const reviewed=canonicalCreatorMessage(intent,expectedMint,creator),fresh=await freshIntent(expectedMint);
 const bytes=canonicalCreatorMessage(fresh,expectedMint,creator);if(bytes.length!==reviewed.length||bytes.some((b,i)=>b!==reviewed[i]))throw Error('Publication intent changed. Review again.');
 const result=await wallet.signMessage(bytes),signature=result.signature??result;
 if(wallet.publicKey.toBase58()!==creator||!nacl.sign.detached.verify(bytes,signature,new PublicKey(creator).toBytes()))throw Error('Creator signature invalid.');
 return Array.from(signature,b=>b.toString(16).padStart(2,'0')).join('');
}
