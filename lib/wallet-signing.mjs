import nacl from 'tweetnacl';
import {decodeReviewedTransaction,assertWalletTransaction} from './wallet-transaction-policy.mjs';

/**
 * @typedef {import('@solana/web3.js').VersionedTransaction} VersionedTransaction
 * @typedef {import('@solana/web3.js').PublicKey} PublicKey
 * @typedef {{publicKey:PublicKey|null, signTransaction:(transaction:VersionedTransaction)=>Promise<VersionedTransaction>}} SigningWallet
 * @typedef {{transaction:VersionedTransaction, wallet:SigningWallet, owner:string, additionalSignerPublicKeys?:PublicKey[], cosign?:(transaction:VersionedTransaction)=>void|Promise<void>}} WalletFirstRequest
 * @typedef {(message:Uint8Array, signature:Uint8Array, publicKey:Uint8Array)=>boolean} SignatureVerifier
 */

const equalBytes=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
const address=key=>key?.toBase58?.();

function signatureSlots(transaction,count){
 if(!Array.isArray(transaction?.signatures)||transaction.signatures.length!==count||transaction.signatures.some(signature=>!(signature instanceof Uint8Array)||signature.length!==64))throw Error('Unexpected transaction signature slots. Nothing was sent.');
 return transaction.signatures;
}

function assertMessage(transaction,original){
 const current=transaction?.message?.serialize?.();
 if(!(current instanceof Uint8Array)||!equalBytes(current,original))throw Error('Wallet returned a different transaction. Nothing was sent.');
}

function assertWallet(wallet,owner){
 if(address(wallet.publicKey)!==owner)throw Error('Wallet changed. Nothing was sent.');
}

// The production export below always uses TweetNaCl verification. Tests create a
// separate function with an explicit fake verifier; no signing or keys are needed.
/**
 * @param {SignatureVerifier} verifySignature
 * @returns {(request:WalletFirstRequest)=>Promise<VersionedTransaction>}
 */
export function createWalletFirstSigner(verifySignature){
 if(typeof verifySignature!=='function')throw TypeError('A signature verifier is required.');
 return async function({transaction,wallet,owner,additionalSignerPublicKeys=[],cosign}){
  assertWallet(wallet,owner);
  const count=transaction?.message?.header?.numRequiredSignatures;
  const keys=transaction?.message?.staticAccountKeys;
  if(!Number.isSafeInteger(count)||count<1||!Array.isArray(keys)||keys.length<count)throw Error('Unexpected transaction signer layout. Nothing was sent.');
  const expected=[owner,...additionalSignerPublicKeys.map(address)];
  const actual=keys.slice(0,count).map(address);
  if(expected.some(value=>typeof value!=='string'||!value)||new Set(expected).size!==expected.length||count!==expected.length||actual[0]!==owner||new Set(actual).size!==count||actual.some(value=>!expected.includes(value)))throw Error('Transaction signers or fee payer differ from the reviewed launch. Nothing was sent.');
  const publicKeys=keys.slice(0,count).map(key=>{
   const bytes=key.toBytes?.();
   if(!(bytes instanceof Uint8Array)||bytes.length!==32)throw Error('Invalid signer public key. Nothing was sent.');
   return Uint8Array.from(bytes);
  });
  if(signatureSlots(transaction,count).some(signature=>signature.some(Boolean)))throw Error('Wallet must sign first: this transaction is already partially signed. Nothing was sent.');
  if((count>1&&typeof cosign!=='function')||(count===1&&cosign!==undefined))throw Error('Unexpected mint signing callback. Nothing was sent.');
  const serialized=transaction.message.serialize();
  if(!(serialized instanceof Uint8Array))throw Error('Invalid transaction message. Nothing was sent.');
  const original=Uint8Array.from(serialized);
  // Capture the review before the wallet can mutate its argument in place.
  // Other message formats keep the existing exact-byte-only path.
  const reviewed=transaction.message.version===0?decodeReviewedTransaction(transaction):null;

  // This is the only wallet request. No mint signature exists until it succeeds.
  const signed=await wallet.signTransaction(transaction);
  assertWallet(wallet,owner);
  const returned=signed?.message?.serialize?.();
  if(!(returned instanceof Uint8Array))throw Error('Invalid wallet transaction message. Nothing was sent.');
  if(!equalBytes(returned,original)){
   if(!reviewed)assertMessage(signed,original);
   try{assertWalletTransaction(reviewed,signed);}catch(error){error.code='WALLET_STRUCTURE_REJECTED';throw error;}
  }
  // The owner authorized these accepted bytes, including permitted wallet guards.
  // Mint signing cannot change them or substitute the original message.
  const accepted=Uint8Array.from(returned);
  const walletSignatures=signatureSlots(signed,count);
  if(!walletSignatures[0].some(Boolean)||!verifySignature(accepted,walletSignatures[0],publicKeys[0]))throw Object.assign(Error('Wallet did not return a valid owner signature for its returned message. Nothing was sent.'),{code:'WALLET_OWNER_SIGNATURE_INVALID'});
  if(walletSignatures.slice(1).some(signature=>signature.some(Boolean)))throw Error('Wallet returned an unexpected additional signature. Nothing was sent.');
  const ownerSignature=Uint8Array.from(walletSignatures[0]);

  if(count>1)await cosign(signed);
  assertWallet(wallet,owner);
  assertMessage(signed,accepted);
  const complete=signatureSlots(signed,count);
  if(!equalBytes(complete[0],ownerSignature))throw Error('Mint signing changed the owner signature. Nothing was sent.');
  if(complete.some((signature,index)=>!signature.some(Boolean)||!verifySignature(accepted,signature,publicKeys[index])))throw Error('Transaction is missing a valid required signature. Nothing was sent.');
  return signed;
 };
}

export const signWalletFirst=createWalletFirstSigner((message,signature,publicKey)=>nacl.sign.detached.verify(message,signature,publicKey));
