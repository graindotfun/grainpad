import './browser-buffer.mjs';
import {Keypair} from '@solana/web3.js';
import bs58 from 'bs58';
import {assertMintSuffix} from './vanity-suffix';
import {MINT_ALLOCATION_REVISION,MINT_ALLOCATION_ORIGIN,mintAllocationMessage} from './mint-allocation-protocol.mjs';
import type {Wallet} from './launch';
const base64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
/** Only the creator's tab can decrypt the mint-only key. The ephemeral key is
 * never persisted; recovery requires a new signature from the same wallet. */
export async function allocateInventoryMint(wallet:Wallet,{mint=null,signal,fetchImpl=fetch}:{mint?:string|null;signal?:AbortSignal;fetchImpl?:typeof fetch}={}):Promise<Keypair>{
 if(!wallet.publicKey||!wallet.signMessage)throw Error('Connect a wallet that supports readable message approval.');
 const owner=wallet.publicKey.toBase58(),ephemeral=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},false,['encrypt','decrypt']);
 const spki=new Uint8Array(await crypto.subtle.exportKey('spki',ephemeral.publicKey)),nonce=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join(''),issuedAt=Date.now();
 const payload={revision:MINT_ALLOCATION_REVISION,origin:MINT_ALLOCATION_ORIGIN,action:mint?'recover':'allocate',wallet:owner,mint,nonce,issuedAt,expiresAt:issuedAt+300000,encryptionKey:base64(spki)};
 const approved=await wallet.signMessage(new TextEncoder().encode(mintAllocationMessage(payload)));
 const signature=approved instanceof Uint8Array?approved:approved.signature;
 if(wallet.publicKey?.toBase58()!==owner)throw Error('Wallet changed during address approval. Recover with the originally assigned wallet.');
 const r=await fetchImpl('/api/mint-allocation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature:bs58.encode(signature)}),signal});
 const response=await r.json() as {error?:string;revision?:string;wallet?:string;nonce?:string;mint?:string;algorithm?:string;encryptedKey?:string};if(!r.ok)throw Error(response.error||'Secure grain address inventory is temporarily unavailable.');
 if(response.revision!==MINT_ALLOCATION_REVISION||response.wallet!==owner||response.nonce!==nonce||typeof response.mint!=='string'||mint&&response.mint!==mint||response.algorithm!=='RSA-OAEP-SHA256'||typeof response.encryptedKey!=='string'||response.encryptedKey.length>400)throw Error('Mint allocation does not match this wallet approval.');
 assertMintSuffix(response.mint);
 const ciphertext=Uint8Array.from(atob(response.encryptedKey),char=>char.charCodeAt(0)),bytes=new Uint8Array(await crypto.subtle.decrypt({name:'RSA-OAEP'},ephemeral.privateKey,ciphertext));
 try{if(bytes.length!==64)throw Error('Invalid encrypted mint key.');const key=Keypair.fromSecretKey(bytes.slice());if(key.publicKey.toBase58()!==response.mint)throw Error('Decrypted mint does not match its permanent allocation.');if(wallet.publicKey?.toBase58()!==owner)throw Error('Wallet changed; recover this allocation with its original creator.');return key;}finally{bytes.fill(0);}
}
