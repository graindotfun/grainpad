/** Read one canonical mainnet transaction using a user-selected daemon. Never signs or relays. */
import {PublicKey} from '@solana/web3.js';
import {readDaemon,extraFromDaemonTransaction,confirmationsFor} from './monero-index.mjs';
import {decodeExtraField,verifyRecord,CONFIRMATIONS_REQUIRED} from './monero-record.mjs';
import {isMoneroHash,synchronizedMainnetHeight,validatedTransactions,validatedBlock} from './monero-daemon-validation.mjs';
const address=value=>{if(typeof value!=='string'||new PublicKey(value).toBase58()!==value)throw Error('Canonical Solana address required.');return value;};
export async function readRecord({daemonUrl,txHash,expected},read=null){
 if(!isMoneroHash(txHash))throw Error('A lowercase 64-hex Monero transaction hash is required.');
 if(expected){address(expected.mint);address(expected.creator);if(typeof expected.metadataHash!=='string'||!/^[a-f0-9]{64}$/.test(expected.metadataHash))throw Error('A lowercase 64-hex metadata hash is required.');}
 if(!read){
  const url=new URL(daemonUrl);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Use a plain HTTP(S) daemon URL without embedded credentials.');
  read=(method,params)=>readDaemon(url.href,method,params);
 }
 const height=synchronizedMainnetHeight(await read('get_info',{}));
 const result=await read('get_transactions',{txs_hashes:[txHash],decode_as_json:true});
 const tx=validatedTransactions(result,[txHash],height).get(txHash);
 if(!tx)throw Error('Requested transaction is unavailable.');
 if(tx.in_pool)throw Error('Transaction has no canonical mined block yet.');
 const block=validatedBlock(await read('get_block',{height:tx.block_height}),tx.block_height,height);
 if(!block.tx_hashes.includes(txHash))throw Error('Transaction is absent from its daemon-reported block.');
 const records=decodeExtraField(extraFromDaemonTransaction(tx));
 if(records.length!==1)throw Error('Expected exactly one GRN1 record.');
 const fields=verifyRecord(records[0]);
 const mint=new PublicKey(fields.mint).toBase58(),creator=new PublicKey(fields.creator).toBase58(),metadataHash=fields.metadataHash.toString('hex');
 if(expected&&(expected.mint!==mint||expected.creator!==creator||expected.metadataHash!==metadataHash))throw Error('Record does not match the supplied receipt identity.');
 // Re-read the mined block after parsing; reject a changed checkpoint rather than publishing stale inclusion.
 const secondHeight=synchronizedMainnetHeight(await read('get_info',{}));
 if(secondHeight<height)throw Error('Daemon height regressed during verification.');
 const second=validatedBlock(await read('get_block',{height:tx.block_height}),tx.block_height,secondHeight);
 if(second.block_header.hash!==block.block_header.hash||!second.tx_hashes.includes(txHash))throw Error('Canonical block changed during verification.');
 const confirmations=confirmationsFor(tx.block_height,height);
 return {schema:'grainpad.grn1-observation.v1',txHash,blockHeight:tx.block_height,blockHash:block.block_header.hash,chainHeight:height,confirmations,
  status:confirmations<CONFIRMATIONS_REQUIRED?'pending':expected?'receipt-matched':'signature-valid',receiptMatched:Boolean(expected),
  record:{version:fields.version,mint,metadataHash,creator,nonce:fields.nonce.toString('hex'),flags:fields.flags},
  trustBoundary:'Observation from the selected synchronized daemon; not an independent consensus or inclusion proof. Receipt identity is supplied by the caller. No Solana launch execution is verified.'};
}
