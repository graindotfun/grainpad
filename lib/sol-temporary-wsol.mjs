/** A seeded WSOL account used only for the route. The owner's existing WSOL associated
 * account is never closed and its starting balance is not the swap input. */
import {PublicKey,SystemProgram} from '@solana/web3.js';
import {ACCOUNT_SIZE,NATIVE_MINT,TOKEN_PROGRAM_ID,createCloseAccountInstruction,createInitializeAccountInstruction,getAssociatedTokenAddressSync,unpackAccount} from '@solana/spl-token';
export const TEMPORARY_WSOL_SEED='grainpad-wsol';
export const TOKEN_ACCOUNT_BYTES=ACCOUNT_SIZE;
export function canonicalWsolAddress(owner){return getAssociatedTokenAddressSync(NATIVE_MINT,new PublicKey(owner));}
export function temporaryWsolAddress(owner){return PublicKey.createWithSeed(new PublicKey(owner),TEMPORARY_WSOL_SEED,TOKEN_PROGRAM_ID);}
function asWsol(owner,address,account,label){
 if(!account)return null;
 if(!account.owner?.equals?.(TOKEN_PROGRAM_ID))throw Error(`${label} is not the owner wrapped SOL balance.`);
 let token;try{token=unpackAccount(address,account,TOKEN_PROGRAM_ID);}catch{throw Error(`${label} is not the owner wrapped SOL balance.`);}
 const payer=new PublicKey(owner);
 if(!token.mint.equals(NATIVE_MINT)||!token.owner.equals(payer)||!token.isInitialized||token.isFrozen)throw Error(`${label} is not the owner wrapped SOL balance.`);
 return token;
}
/** Null when the owner has no WSOL associated account. */
export function readCanonicalWsol(owner,account){
 const address=canonicalWsolAddress(owner),token=asWsol(owner,address,account,'Existing WSOL account');
 return token?{account:address.toBase58(),amount:String(token.amount)}:null;
}
export function assertTemporaryWsol(owner,address,account){asWsol(owner,address,account,'Temporary WSOL account');}
/** Create instructions only. The exact buy transfer and SyncNative stay in the reviewed route. */
export function temporaryWsolCreate({owner,address,rentLamports,existing=null}){
 if(!Number.isSafeInteger(rentLamports)||rentLamports<1)throw Error('Temporary WSOL rent is not a chain exemption.');
 const payer=new PublicKey(owner),account=new PublicKey(address);
 const instructions=[];
 if(existing){
  assertTemporaryWsol(owner,account,existing);
  instructions.push(createCloseAccountInstruction(account,payer,payer,[],TOKEN_PROGRAM_ID));
 }
 instructions.push(SystemProgram.createAccountWithSeed({fromPubkey:payer,basePubkey:payer,seed:TEMPORARY_WSOL_SEED,newAccountPubkey:account,lamports:rentLamports,space:TOKEN_ACCOUNT_BYTES,programId:TOKEN_PROGRAM_ID}));
 // InitializeAccount keeps the owner in the account list. InitializeAccount3 repeats that pubkey in the instruction data and overruns the guarded packet. The rent sysvar is a pre-creation lookup address.
 instructions.push(createInitializeAccountInstruction(account,NATIVE_MINT,payer,TOKEN_PROGRAM_ID));
 return instructions;
}
/** Rewrite a router packet so the route WSOL account is the temporary address. */
export function retargetRouteWsol(built,from,to){
 if(from===to)return built;
 for(const ix of [...(built.setupInstructions||[]),built.swapInstruction,built.cleanupInstruction]){
  if(!ix?.accounts)continue;
  for(const account of ix.accounts)if(account.pubkey===from)account.pubkey=to;
 }
 return built;
}
