import bs58 from 'bs58';
const initializers=new Set(['67,153,175,39,218,16,38,32','37,190,126,222,44,154,171,17']);
/** A zero reserve is not proof of zero historical trades. Require creation-only history. */
export function creationOnly(transaction,program,pool){
 if(!transaction||transaction.meta?.err||!transaction.meta||!Array.isArray(transaction.meta.innerInstructions))return false;
 const message=transaction.transaction?.message;if(!message)return false;
 const keys=[...(message.accountKeys||[]),...(transaction.meta.loadedAddresses?.writable||[]),...(transaction.meta.loadedAddresses?.readonly||[])];
 const all=[...(message.instructions||[]),...transaction.meta.innerInstructions.flatMap(g=>g.instructions||[])];
 const relevant=all.filter(i=>keys[i.programIdIndex]===program&&(i.accounts||[]).some(n=>keys[n]===pool));
 try{return relevant.length===1&&initializers.has(Array.from(bs58.decode(relevant[0].data).slice(0,8)).join(','));}catch{return false;}
}
