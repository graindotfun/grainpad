/** Read-only acceptance of a Grainpad record found in a Monero transaction. */
import {CONFIRMATIONS_REQUIRED,decodeExtraField,verifyRecord} from './monero-record.mjs';

export function confirmationsFor(height,chainHeight){
  if(!Number.isSafeInteger(height)||!Number.isSafeInteger(chainHeight)||height<0||chainHeight<=height)return 0;
  // monerod get_info.height counts blocks; block_height is zero-based.
  return chainHeight-height;
}
export function emptyIndex(){return {tx:new Set(),nonce:new Set(),mint:new Map()};}
function key(bytes){return Buffer.from(bytes).toString('hex');}

/**
 * Accept or reject one transaction's extra. The same tx hash is not applied twice.
 * A second transaction that repeats a nonce, or a mint that is already verified, is a duplicate.
 */
export function observeTransaction(index,tx){
  if(!tx?.txHash||!/^[0-9a-f]{64}$/.test(tx.txHash))throw Error('Monero transaction hash is required.');
  if(index.tx.has(tx.txHash))return {status:'duplicate',reason:'This Monero transaction was already observed.',txHash:tx.txHash};
  let records;
  try{records=decodeExtraField(tx.extra);}catch(error){return {status:'rejected',reason:error.message,txHash:tx.txHash};}
  if(records.length!==1)return {status:'rejected',reason:records.length?'A Grainpad transaction carries one launch record.':'No Grainpad launch record in this transaction.',txHash:tx.txHash};
  let fields;
  try{fields=verifyRecord(records[0]);}catch(error){return {status:'rejected',reason:error.message,txHash:tx.txHash};}
  const nonce=key(fields.nonce),mint=key(fields.mint);
  if(index.nonce.has(nonce)||index.mint.has(mint))return {status:'duplicate',reason:index.nonce.has(nonce)?'This record nonce was already published.':'This Solana mint already has a Monero record.',txHash:tx.txHash,fields};
  const mismatch=tx.expectedMint&&!fields.mint.equals(Buffer.from(tx.expectedMint))?'Solana mint does not match the Grainpad receipt.'
    :tx.expectedHash&&!fields.metadataHash.equals(Buffer.from(tx.expectedHash))?'Metadata hash does not match the Grainpad receipt.'
    :tx.expectedCreator&&!fields.creator.equals(Buffer.from(tx.expectedCreator))?'Creator does not match the Grainpad receipt.':null;
  if(mismatch)return {status:'rejected',reason:mismatch,txHash:tx.txHash,fields};
  const confirmations=tx.inBlock?confirmationsFor(tx.height,tx.chainHeight):0;
  const status=confirmations>=CONFIRMATIONS_REQUIRED?'verified':'pending';
  index.tx.add(tx.txHash);index.nonce.add(nonce);
  index.mint.set(mint,{status,txHash:tx.txHash,confirmations});
  return {status,reason:status==='verified'?'Ten Monero confirmations. The record matches the Grainpad receipt.':'Published. Waiting for 10 Monero confirmations.',txHash:tx.txHash,height:tx.inBlock?tx.height:null,confirmations,fields};
}
export function advance(index,txHash,height,chainHeight){
  for(const row of index.mint.values()){
    if(row.txHash!==txHash||row.status==='verified')continue;
    row.confirmations=confirmationsFor(height,chainHeight);
    if(row.confirmations>=CONFIRMATIONS_REQUIRED)row.status='verified';
    return {status:row.status,confirmations:row.confirmations,txHash};
  }
  return null;
}
/** @param {{status?:string,confirmations?:number,tx_hash?:string,height?:number|null,record?:string}|null} row
 * @param {{mintHex?:string|null,metadataHash?:string|null}|null} [expected] */
export function receiptMonero(row,expected=null){
  const unmatched={mint:null,metadataHash:null,matchesMint:false,matchesMetadataHash:false};
  if(!row)return {...proofFromObservation(null),...unmatched};
  const count=Number(row.confirmations),confirmations=Number.isSafeInteger(count)&&count>=0?count:0;
  const proof=proofFromObservation({status:row.status,confirmations,txHash:row.tx_hash,height:row.height,reason:'Monero record verification is pending.'});
  const invalid={...proof,...unmatched,status:'rejected',notice:'Stored Monero record is missing or invalid. Verification is withheld.'};
  if(!row.record)return invalid;
  try{
    const fields=verifyRecord(Buffer.from(row.record,'hex'));
    const mint=fields.mint.toString('hex'),metadataHash=fields.metadataHash.toString('hex');
    const binding={mint,metadataHash,matchesMint:expected?.mintHex===mint,matchesMetadataHash:expected?.metadataHash===metadataHash};
    if(!binding.matchesMint||!binding.matchesMetadataHash)return {...proof,...binding,status:'rejected',notice:'Monero record does not match this receipt\u2019s Solana mint and metadata hash.'};
    // A cached status cannot override the evidence. Rendering never promotes a pending index row.
    const status=row.status==='verified'&&confirmations<CONFIRMATIONS_REQUIRED?'pending':row.status;
    const notice=status==='verified'?'Ten Monero confirmations. The Monero record matches this Solana mint and metadata hash.'
      :status==='rejected'?'Monero record was rejected by the index.'
      :confirmations<CONFIRMATIONS_REQUIRED?'Published on Monero. Waiting for 10 confirmations before the receipt marks it verified.'
      :'Monero record is awaiting index verification.';
    return {...proof,...binding,status,notice};
  }catch{return invalid;}
}
export function proofFromObservation(observation){
  if(!observation)return {status:'not-published',confirmations:0,txHash:null,notice:'No Grainpad record has been published on Monero for this launch.'};
  return {status:observation.status,confirmations:observation.confirmations??0,txHash:observation.txHash,height:observation.height??null,notice:observation.reason,compatibleWith:'grainpad-monero-record-v1'};
}

const READ_METHODS=new Set(['get_transactions','get_block_header_by_height','get_info','get_fee_estimate']);
export async function readDaemon(rpcUrl,method,params){
  if(!READ_METHODS.has(method))throw Error('This daemon client is read-only.');
  const url=new URL(rpcUrl);
  if(!['http:','https:'].includes(url.protocol))throw Error('Invalid Monero daemon URL.');
  const base=url.pathname.replace(/\/(?:json_rpc|get_transactions)\/?$/,'').replace(/\/$/,'');
  const direct=method==='get_transactions';
  url.pathname=base+(direct?'/get_transactions':'/json_rpc');
  // get_transactions is an HTTP JSON endpoint, not a JSON-RPC method.
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(direct?params:{jsonrpc:'2.0',id:'0',method,params}),signal:AbortSignal.timeout(8000),redirect:'error'});
  if(!response.ok)throw Error('Monero daemon read failed.');
  const body=await response.json();
  const result=direct?body:body.result;
  if(body.error||!result||result.status!=='OK')throw Error('Monero daemon read failed.');
  return result;
}
export function extraFromDaemonTransaction(tx){
  const json=tx?.as_json?JSON.parse(tx.as_json):null;
  const extra=json?.extra??tx?.extra;
  if(Array.isArray(extra)&&extra.every(n=>Number.isInteger(n)&&n>=0&&n<=255))return Buffer.from(extra);
  if(typeof extra==='string'&&/^(?:[0-9a-fA-F]{2})*$/.test(extra))return Buffer.from(extra,'hex');
  throw Error('Daemon transaction has no valid extra field.');
}
