/** Local checks for a wallet2-built publication. Stock wallet RPC cannot set this extra. No relay. */
import {FEE_CAP_PICONERO,MAGIC,RECORD_BYTES,decodeExtraField,decodeRecord,encodeExtraField,verifyRecord} from './monero-record.mjs';

export const CONSTRUCTION_METHOD='wallet2.create_transactions_2';
export const LIBRARY='monero-project/monero wallet2 C++ API';
/** Official wallet RPC `transfer` fills extra only from payment_id. Arbitrary extra is an open request, monero-project/monero#9731. */
export const WALLET_RPC_TRANSFER_ACCEPTS_ARBITRARY_EXTRA=false;
const PAYMENT_ID_PREFIX=0x00;
const ENCRYPTED_PAYMENT_ID_PREFIX=0x01;

export function assemblePublicationExtra(txPubKey,record){
  const key=Buffer.from(txPubKey),body=Buffer.from(record);
  if(key.length!==32)throw Error('Transaction pubkey must be 32 bytes.');
  if(body.length!==RECORD_BYTES)throw Error(`Record must be ${RECORD_BYTES} bytes.`);
  return Buffer.concat([Buffer.from([0x01]),key,encodeExtraField(body)]);
}
function fieldsOf(extra){
  const raw=Buffer.from(extra);
  let i=0,pubkeys=0,nonces=[];
  while(i<raw.length){
    const tag=raw[i++];
    if(tag===0x00){while(i<raw.length&&raw[i]===0x00)i++;continue;}
    if(tag===0x01){if(i+32>raw.length)throw Error('Truncated tx pubkey.');pubkeys++;i+=32;continue;}
    if(tag!==0x02)throw Error('Publication extra contains an unexpected field.');
    let n=0,shift=0;for(;;){if(i>=raw.length)throw Error('Truncated tx_extra length.');const b=raw[i++];n|=(b&0x7f)<<shift;if((b&0x80)===0)break;shift+=7;}
    if(i+n>raw.length)throw Error('Truncated tx_extra nonce.');
    nonces.push(raw.subarray(i,i+n));i+=n;
  }
  if(pubkeys!==1||nonces.length!==1)throw Error('Publication extra must be one tx pubkey and one Grainpad nonce.');
  const nonce=nonces[0];
  if(nonce[0]===PAYMENT_ID_PREFIX||nonce[0]===ENCRYPTED_PAYMENT_ID_PREFIX)throw Error('Publication extra contains a payment id.');
  if(nonce[0]!==0x7f||nonce.length!==1+RECORD_BYTES||!nonce.subarray(1,5).equals(MAGIC))throw Error('Publication nonce is not the Grainpad record.');
  return verifyRecord(nonce.subarray(1));
}
function sum(rows){return rows.reduce((n,row)=>n+BigInt(row.amount),0n);}

/**
 * Check a transaction description before relay. Outputs may only return to the fee wallet.
 * The fee is the only amount that leaves. No second destination is allowed.
 */
export function inspectPublication({extra,inputs,outputs,fee,feeAddress,expectedExtra}){
  if(!feeAddress)throw Error('A dedicated Grainpad fee wallet is required.');
  const feeAmount=BigInt(fee);
  if(feeAmount<=0n||feeAmount>FEE_CAP_PICONERO)throw Error('Network fee is outside the hard cap.');
  if(!Array.isArray(inputs)||inputs.length<1)throw Error('The publication spends no fee-wallet output.');
  if(!Array.isArray(outputs)||outputs.length<1)throw Error('The publication has no change output.');
  for(const output of outputs){if(output.address!==feeAddress)throw Error('An output leaves the dedicated fee wallet.');}
  for(const input of inputs){if(input.address&&input.address!==feeAddress)throw Error('An input is not from the dedicated fee wallet.');}
  const spent=sum(inputs),returned=sum(outputs);
  if(spent!==returned+feeAmount)throw Error('The fee wallet would spend more than this transaction and its fee.');
  const extraBytes=Buffer.from(extra);
  if(expectedExtra&&!extraBytes.equals(Buffer.from(expectedExtra)))throw Error('Constructed extra does not match the approved Grainpad field.');
  const records=decodeExtraField(extraBytes);
  if(records.length!==1)throw Error('Constructed transaction does not carry exactly one Grainpad record.');
  const fields=fieldsOf(extraBytes);
  if(!decodeRecord(records[0]).mint.equals(fields.mint))throw Error('Decoded record does not match the extra.');
  return {relayable:false,broadcast:false,feePiconero:feeAmount.toString(),inputPiconero:spent.toString(),changePiconero:returned.toString(),outputs:outputs.map(output=>({address:output.address,amount:BigInt(output.amount).toString()})),extraHex:extraBytes.toString('hex'),record:fields,notice:'Checked locally. Not relayed. A tx hash exists only after wallet2 signs the blob.'};
}
export function rpcTransferCannotSetExtra(){
  return {method:'transfer',acceptsArbitraryExtra:WALLET_RPC_TRANSFER_ACCEPTS_ARBITRARY_EXTRA,reason:'monero-project/monero wallet RPC fills extra from payment_id only. Arbitrary extra remains wallet2::create_transactions_2, which stock transfer does not expose.'};
}
