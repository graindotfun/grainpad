/** The first official burn is a successful finalized buy-and-burn of the pinned mint.
 * Caller-supplied transaction JSON is not release evidence. Only a transaction fetched
 * from primary mainnet RPC, and marked here, can satisfy the check. This module never submits. */
import {Buffer} from 'buffer';
import bs58 from 'bs58';
import {FINALIZED_OFFICIAL_INVENTORY} from './finalized-official-inventory-identity.mjs';
const MAINNET='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const LAUNCH='LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';
const CPMM='CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const GRAINU_REHEARSAL_MINT='FGrHB6tEqXNfMBXZ4xNoa6hKwjWCjjxwijeB5uKLvgrn';
const CALLER_JSON='Caller-supplied transaction JSON cannot establish release evidence. Fetch the successful finalized transaction from primary mainnet RPC.';
const fetchedBurns=new WeakSet();
/** web3.js getTransaction returns PublicKey keys; raw RPC json returns strings; jsonParsed returns {pubkey}. */
function keyList(value){
 if(typeof value==='string')return value;
 if(value&&typeof value.pubkey==='string')return value.pubkey;
 if(value&&typeof value.toBase58==='function')return value.toBase58();
 return '';
}
function accountKeys(tx){
 const message=tx?.transaction?.message??{};
 const staticKeys=message.staticAccountKeys??message.accountKeys??[];
 const loaded=[...(tx?.meta?.loadedAddresses?.writable??[]),...(tx?.meta?.loadedAddresses?.readonly??[])];
 return [...staticKeys,...loaded].map(keyList);
}
/** Outer instructions from a web3.js message (compiledInstructions, bytes) or RPC json (instructions, base58). */
function compiled(tx){
 const message=tx?.transaction?.message??{};
 const outer=Array.isArray(message.compiledInstructions)?message.compiledInstructions:message.instructions??[];
 const inner=(tx?.meta?.innerInstructions??[]).flatMap(group=>group?.instructions??[]);
 return [...outer,...inner];
}
function instruction(ix,keys){
 const program=keys[ix?.programIdIndex]??'';
 const accounts=[...(ix?.accountKeyIndexes??ix?.accounts??[])].map(index=>keys[index]??'');
 let data=Buffer.alloc(0);
 // RPC json encoding and web3.js inner instructions carry base58 strings; compiled instructions carry bytes.
 try{data=ix?.data instanceof Uint8Array?Buffer.from(ix.data):typeof ix?.data==='string'?Buffer.from(bs58.decode(ix.data)):Buffer.alloc(0);}catch{data=Buffer.alloc(0);}
 return {program,accounts,data};
}
function burnedRaw(instructions,mint){
 let amount=0n;
 for(const ix of instructions){
  if(![TOKEN,TOKEN_2022].includes(ix.program))continue;
  if((ix.data[0]!==8&&ix.data[0]!==15)||ix.data.length<9||ix.accounts[1]!==mint)continue;
  const value=ix.data.readBigUInt64LE(1);if(value>0n)amount+=value;
 }
 return amount;
}
function rehearsal(burn){
 return burn?.class==='grainu-rehearsal'||burn?.class==='prelaunch-rehearsal'||burn?.rehearsal===true||burn?.mint===GRAINU_REHEARSAL_MINT;
}
/** Fetch one successful finalized transaction from the supplied primary mainnet connection. */
export async function fetchOfficialBurnEvidence(connection,{signature,pinnedMint}={}){
 if(typeof connection?.getGenesisHash!=='function'||typeof connection?.getTransaction!=='function')throw Error('Primary mainnet RPC is required to fetch the first official burn.');
 if(await connection.getGenesisHash()!==MAINNET)throw Error('The first official burn must be fetched from primary mainnet RPC.');
 if(typeof pinnedMint!=='string'||!pinnedMint||pinnedMint===GRAINU_REHEARSAL_MINT)throw Error('grainBuybackBurnFinalized requires the pinned official mint. A class label is not that pin.');
 if(typeof signature!=='string'||signature.length<64||signature.length>128)throw Error('The burn requires a successful finalized transaction. A signature string is not enough.');
 const tx=await connection.getTransaction(signature,{commitment:'finalized',maxSupportedTransactionVersion:0});
 if(!tx||tx.meta?.err!=null||(tx.confirmationStatus&&tx.confirmationStatus!=='finalized'))throw Error('The burn requires a successful finalized transaction. A signature string is not enough.');
 const signatures=tx.transaction?.signatures??[];
 if(!signatures.includes(signature))throw Error('The fetched transaction does not match the requested signature.');
 const keys=accountKeys(tx),instructions=compiled(tx).map(ix=>instruction(ix,keys));
 const bought=instructions.some(ix=>(ix.program===LAUNCH||ix.program===CPMM)&&ix.accounts.includes(pinnedMint));
 const burned=burnedRaw(instructions,pinnedMint);
 if(!bought||burned<=0n)throw Error('The finalized transaction must buy and burn the pinned official mint.');
 const chainBurn={mint:pinnedMint,signature,burnedRaw:burned.toString(),source:'primary-mainnet-rpc'};
 fetchedBurns.add(chainBurn);
 return chainBurn;
}
/** Returns an error string, or null when fetched chain evidence may satisfy the check. */
export function officialBurnEvidenceError(evidence,{pinnedMint=FINALIZED_OFFICIAL_INVENTORY.mint}={}){
 if(evidence?.checks?.grainBuybackBurnFinalized!==true)return null;
 const burn=evidence?.officialBurn??{};
 if(rehearsal(burn))return 'GRAINU rehearsal evidence cannot satisfy grainBuybackBurnFinalized. The first burn must be the official GRAIN token.';
 if(typeof pinnedMint!=='string'||!pinnedMint||pinnedMint===GRAINU_REHEARSAL_MINT)return 'grainBuybackBurnFinalized requires the pinned official mint. A class label is not that pin.';
 if(!fetchedBurns.has(burn))return CALLER_JSON;
 if(burn.mint!==pinnedMint||typeof burn.burnedRaw!=='string'||!/^\d+$/.test(burn.burnedRaw)||BigInt(burn.burnedRaw)<=0n||burn.signature.length<64)return 'Burn evidence does not name the pinned official mint.';
 return null;
}
/** Replace a claimed burn with the primary-mainnet fetch. A JSON transaction body is discarded. */
export async function attachFetchedOfficialBurn(connection,holderRewards){
 if(holderRewards?.checks?.grainBuybackBurnFinalized!==true)return holderRewards;
 const signature=holderRewards?.officialBurn?.signature;
 const pinnedMint=holderRewards?.officialBurn?.mint;
 delete holderRewards.officialBurn?.finalizedTransaction;
 try{holderRewards.officialBurn=await fetchOfficialBurnEvidence(connection,{signature,pinnedMint});}
 catch{holderRewards.officialBurn={mint:pinnedMint,signature,source:'fetch-failed'};}
 return holderRewards;
}
