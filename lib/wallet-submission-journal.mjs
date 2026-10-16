const hashPattern=/^0x[0-9a-f]{64}$/;
export function readWalletSubmission(storage,key){
 const raw=storage.getItem(key);if(!raw)return null;
 if(hashPattern.test(raw))return {hash:raw,transaction:null};
 const item=JSON.parse(raw);
 if(item?.version!==1||!(item.hash===null||hashPattern.test(item.hash))||!item.transaction)throw Error('Existing transaction recovery record is unreadable. Do not submit again.');
 return item;
}
/** Journal before the provider can broadcast. Unknown outcomes remain locked across reloads. */
export async function journalWalletRequest({storage,key,transaction,request,onChange}){
 if(readWalletSubmission(storage,key))throw Error('Check the existing transaction before another action.');
 const item={version:1,hash:null,transaction};
 storage.setItem(key,JSON.stringify(item));onChange(item);
 try{
  const hash=await request();
  if(typeof hash!=='string'||!hashPattern.test(hash.toLowerCase()))throw Error('Wallet returned no valid transaction hash. Check wallet activity before retrying.');
  item.hash=hash.toLowerCase();onChange(item);
  try{storage.setItem(key,JSON.stringify(item));}catch{throw Error('Transaction submitted, but its hash could not be saved. Preserve this hash and check it in your wallet: '+item.hash);}
  return item.hash;
 }catch(error){
  // EIP-1193 rejection explicitly means the user refused this request. Transport errors do not.
  if(error?.code===4001){storage.removeItem(key);onChange(null);}
  throw error;
 }
}
export function assertRecoveredSubmission(item,transaction){
 if(!item?.transaction)return;
 const expected=item.transaction;
 if(!item.hash)throw Error('The wallet did not return a transaction hash for this request. A past receipt cannot prove its outcome. Automatic retry remains blocked; check wallet activity and ask for recovery assistance.');
 if(!transaction||String(transaction.from).toLowerCase()!==expected.from||String(transaction.to).toLowerCase()!==expected.to||String(transaction.input??transaction.data).toLowerCase()!==expected.data.toLowerCase()||BigInt(transaction.value??-1)!==BigInt(expected.value)||BigInt(transaction.chainId??-1)!==BigInt(expected.chainId))throw Error('This receipt does not match the pending wallet request. Check the original transaction in your wallet.');
}
