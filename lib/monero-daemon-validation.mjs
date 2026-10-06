/** Shared trust/shape boundary. Daemon observations are not independent inclusion proofs. */
export const isMoneroHash=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
export function trustedDaemonResult(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.status!=='OK'||value.untrusted!==false)throw Error('Trusted successful Monero daemon response required.');
 for(const key of ['offline','busy_syncing'])if(value[key]!==undefined&&(typeof value[key]!=='boolean'||value[key]))throw Error('Monero daemon is unavailable or synchronizing.');
 return value;
}
export function synchronizedMainnetHeight(value){
 const info=trustedDaemonResult(value);
 if(info.mainnet!==true||info.nettype!=='mainnet'||info.synchronized!==true||!Number.isSafeInteger(info.height)||info.height<1||info.target_height!==undefined&&(!Number.isSafeInteger(info.target_height)||info.target_height<0||info.target_height>info.height))throw Error('A synchronized Monero mainnet daemon is required.');
 return info.height;
}
export function validatedTransactions(value,requested,chainHeight){
 const result=trustedDaemonResult(value);
 if(!Array.isArray(requested)||requested.length>100||requested.some(h=>!isMoneroHash(h))||new Set(requested).size!==requested.length||!Array.isArray(result.txs)||result.txs.length>requested.length)throw Error('Invalid Monero transaction response.');
 const map=new Map();
 for(const tx of result.txs){
  if(!tx||!requested.includes(tx.tx_hash)||map.has(tx.tx_hash)||typeof tx.in_pool!=='boolean')throw Error('Invalid Monero transaction shape.');
  if(tx.in_pool===false&&(!Number.isSafeInteger(tx.block_height)||tx.block_height<0||tx.block_height>=chainHeight))throw Error('Invalid mined Monero transaction height.');
  if(tx.in_pool===true&&tx.block_height!==undefined&&(!Number.isSafeInteger(tx.block_height)||tx.block_height<0))throw Error('Invalid mempool transaction height.');
  map.set(tx.tx_hash,tx);
 }
 return map;
}
export function validatedBlock(value,height,chainHeight){
 const block=trustedDaemonResult(value),h=block.block_header;
 if(!h||!Number.isSafeInteger(height)||height<0||height>=chainHeight||h.height!==height||!isMoneroHash(h.hash)||!isMoneroHash(h.prev_hash)||h.orphan_status===true||h.orphan_status!==undefined&&typeof h.orphan_status!=='boolean'||!Array.isArray(block.tx_hashes)||block.tx_hashes.length>4096||block.tx_hashes.some(t=>!isMoneroHash(t))||new Set(block.tx_hashes).size!==block.tx_hashes.length)throw Error('Invalid daemon block response.');
 return block;
}
