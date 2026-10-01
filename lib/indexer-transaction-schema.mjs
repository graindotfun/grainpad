import bs58 from 'bs58';
/** Read-only JSON indexer schema. No wire decoder, fee estimate, signer or builder. */
export function assertIndexerTransactionSchema(tx,expectedSignature){
 if(!tx?.transaction||!tx?.meta||!Number.isSafeInteger(tx.slot)||tx.slot<0)throw Error('Finalized transaction receipt unavailable.');
 if(tx.meta.err)return tx;
 if(tx.version===1){
  const msg=tx.transaction.message,loaded=tx.meta.loadedAddresses;
  if(!msg||!msg.transactionConfig||typeof msg.transactionConfig!=='object'||Array.isArray(msg.transactionConfig))throw Error('V1 transaction config receipt unavailable.');
  if((loaded?.writable?.length||0)||(loaded?.readonly?.length||0)||(msg.addressTableLookups?.length||0))throw Error('V1 receipt cannot contain lookup-table addresses.');
  const keys=msg.accountKeys;
  if(!Array.isArray(keys)||keys.length<1||keys.length>64||keys.some(k=>typeof k!=='string'||bs58.decode(k).length!==32))throw Error('Invalid V1 inline account keys.');
  if(!Array.isArray(tx.transaction.signatures)||tx.transaction.signatures[0]!==expectedSignature)throw Error('V1 transaction signature mismatch.');
  if(!Array.isArray(msg.instructions)||msg.instructions.length>64)throw Error('Invalid V1 instruction count.');
  const instruction=ix=>{
   if(!Number.isInteger(ix?.programIdIndex)||ix.programIdIndex<0||ix.programIdIndex>=keys.length||!Array.isArray(ix.accounts)||ix.accounts.some(i=>!Number.isInteger(i)||i<0||i>=keys.length)||typeof ix.data!=='string'||bs58.decode(ix.data).length>4096)throw Error('Invalid V1 compiled instruction indices or data.');
  };
  msg.instructions.forEach(instruction);
  if(!Array.isArray(tx.meta.innerInstructions))throw Error('V1 CPI receipt unavailable.');
  for(const group of tx.meta.innerInstructions){if(!Number.isInteger(group.index)||group.index<0||group.index>=msg.instructions.length||!Array.isArray(group.instructions))throw Error('Invalid V1 CPI instruction group.');group.instructions.forEach(instruction);}
  for(const balances of [tx.meta.preTokenBalances,tx.meta.postTokenBalances]){if(!Array.isArray(balances))throw Error('V1 token balance receipt unavailable.');for(const balance of balances){if(!Number.isInteger(balance.accountIndex)||balance.accountIndex<0||balance.accountIndex>=keys.length||typeof balance.uiTokenAmount?.amount!=='string'||!/^\d{1,20}$/.test(balance.uiTokenAmount.amount)||BigInt(balance.uiTokenAmount.amount)>18446744073709551615n)throw Error('Invalid V1 raw token balance.');}}
 }
 else if(tx.version!==0&&tx.version!=='legacy'&&tx.version!==undefined)throw Error('Indexer transaction version is unsupported.');
 return tx;
}
