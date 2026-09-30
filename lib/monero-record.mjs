/** Packed Grainpad launch record for one Monero tx_extra nonce. Not JSON. Not an XMR20 record. */
import {createHash} from 'node:crypto';
import nacl from 'tweetnacl';

export const MAGIC = Buffer.from('GRN1');
export const VERSION = 1;
export const RECORD_BYTES = 185;
export const NONCE_MARKER = 0x7f;
export const MAX_NONCE_BYTES = 255;
// Supported ordinary-transfer extra envelope. Oversized/future formats fail closed.
export const MAX_EXTRA_BYTES = 1060;
export const MAX_EXTRA_FIELDS = 1060;
export const CONFIRMATIONS_REQUIRED = 10;
export const DOMAIN = Buffer.from('grainpad.monero-record.v1\0');
export const FEE_CAP_PICONERO = 20_000_000_000n;

const O = {magic:0, version:4, mint:6, hash:38, creator:70, signature:102, nonce:166, flags:182, checksum:183};

function sha256(bytes){return createHash('sha256').update(bytes).digest();}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;}
function readU16(buf,at){return buf.readUInt16LE(at);}

export function signedBytes(fields){
  return Buffer.concat([
    DOMAIN, MAGIC, u16(fields.version),
    fields.mint, fields.metadataHash, fields.creator, fields.nonce, Buffer.from([fields.flags]),
  ]);
}
function checksum(bytes){return sha256(bytes.subarray(0,O.checksum)).subarray(0,2);}

export function encodeRecord(fields){
  const mint=as32(fields.mint,'Solana mint'), metadataHash=as32(fields.metadataHash,'metadata hash'), creator=as32(fields.creator,'creator'), signature=asLen(fields.signature,64,'signature'), nonce=asLen(fields.nonce,16,'nonce');
  if(fields.version!==VERSION)throw Error('Unsupported record version.');
  if(!Number.isInteger(fields.flags)||fields.flags!==0)throw Error('Record flags must be zero.');
  const out=Buffer.alloc(RECORD_BYTES);
  MAGIC.copy(out,O.magic); u16(fields.version).copy(out,O.version);
  mint.copy(out,O.mint); metadataHash.copy(out,O.hash); creator.copy(out,O.creator); signature.copy(out,O.signature); nonce.copy(out,O.nonce);
  out[O.flags]=fields.flags;
  checksum(out).copy(out,O.checksum);
  return out;
}
export function decodeRecord(bytes){
  const raw=Buffer.from(bytes);
  if(raw.length!==RECORD_BYTES)throw Error(`Record must be ${RECORD_BYTES} bytes.`);
  if(!raw.subarray(O.magic,O.version).equals(MAGIC))throw Error('Record magic is not Grainpad.');
  const version=readU16(raw,O.version);
  if(version!==VERSION)throw Error('Unsupported record version.');
  if(!checksum(raw).equals(raw.subarray(O.checksum)))throw Error('Record checksum does not match.');
  if(raw[O.flags]!==0)throw Error('Record flags must be zero.');
  return {version,mint:raw.subarray(O.mint,O.hash),metadataHash:raw.subarray(O.hash,O.creator),creator:raw.subarray(O.creator,O.signature),signature:raw.subarray(O.signature,O.nonce),nonce:raw.subarray(O.nonce,O.flags),flags:raw[O.flags]};
}
export function verifyRecord(bytes){
  const fields=decodeRecord(bytes);
  const message=signedBytes(fields);
  if(!nacl.sign.detached.verify(message,fields.signature,fields.creator))throw Error('Creator signature is not valid.');
  return fields;
}
export function signRecord(fields,secretKey){
  const message=signedBytes({...fields,version:VERSION,flags:0});
  return encodeRecord({...fields,version:VERSION,flags:0,signature:Buffer.from(nacl.sign.detached(message,secretKey))});
}

/** One tx_extra nonce field. The 0x7f byte is Grainpad's application-defined nonce marker. */
export function encodeNonce(payload){
  const body=Buffer.from(payload);
  const nonce=Buffer.concat([Buffer.from([NONCE_MARKER]),body]);
  if(nonce.length>MAX_NONCE_BYTES)throw Error('Nonce exceeds the 255-byte Monero field.');
  return Buffer.concat([Buffer.from([0x02]),varint(nonce.length),nonce]);
}
export function encodeExtraField(record){
  const body=Buffer.from(record);
  if(body.length!==RECORD_BYTES)throw Error(`Record must be ${RECORD_BYTES} bytes.`);
  return encodeNonce(body);
}
export function decodeExtraField(extra){
  const raw=Buffer.from(extra);
  if(raw.length>MAX_EXTRA_BYTES)throw Error('tx_extra exceeds supported 1060-byte limit.');
  const found=[];
  let i=0,iterations=0;
  while(i<raw.length){
    if(++iterations>MAX_EXTRA_FIELDS)throw Error('tx_extra iteration limit.');
    // Every accepted field consumes its tag and only advances the cursor.
    const tag=raw[i++];
    if(tag===0x00){while(i<raw.length&&raw[i]===0x00)i++;continue;}
    if(tag===0x01){if(i+32>raw.length)throw Error('Truncated tx pubkey.');i+=32;continue;}
    if(tag===0x04){const [n,next]=readVarint(raw,i);if(n>Math.floor((raw.length-next)/32))throw Error('Truncated additional tx pubkeys.');i=next+n*32;continue;}
    // Unknown tag lengths cannot be inferred safely; reject the whole extra.
    if(tag!==0x02)throw Error('Unrecognized tx_extra tag.');
    const [len,next]=readVarint(raw,i);i=next;
    if(len>MAX_NONCE_BYTES)throw Error('Nonce exceeds the 255-byte Monero field.');
    if(len>raw.length-i)throw Error('Truncated tx_extra nonce.');
    const nonce=raw.subarray(i,i+len);i+=len;
    if(nonce.length<2||nonce[0]!==NONCE_MARKER)continue;
    const record=nonce.subarray(1);
    if(record.length!==RECORD_BYTES||!record.subarray(0,4).equals(MAGIC))continue;
    if(found.length)throw Error('Duplicate GRN1 records.');
    found.push(record);
  }
  return found;
}
export function extraBytes(record){return encodeExtraField(record);}

function as32(value,name){return asLen(value,32,name);}
function asLen(value,len,name){const b=Buffer.from(value);if(b.length!==len)throw Error(`${name} must be ${len} bytes.`);return b;}
function varint(n){const out=[];let x=n;while(x>=0x80){out.push((x&0x7f)|0x80);x>>=7;}out.push(x);return Buffer.from(out);}
function readVarint(buf,at){
  let n=0,multiplier=1,i=at;
  // Values are lengths/counts in a bounded envelope, never signed bitwise integers.
  for(let bytes=0;bytes<2;bytes++){
    if(i>=buf.length)throw Error('Truncated tx_extra length.');
    const b=buf[i++],digit=b%128;
    n+=digit*multiplier;
    if(n>MAX_EXTRA_BYTES)throw Error('tx_extra length is too large.');
    if(b<128){
      if(bytes>0&&digit===0)throw Error('Nonminimal tx_extra length.');
      return [n,i];
    }
    multiplier*=128;
  }
  throw Error('tx_extra length is too large.');
}
export const LAYOUT={magic:O.magic,version:O.version,mint:O.mint,metadataHash:O.hash,creator:O.creator,signature:O.signature,nonce:O.nonce,flags:O.flags,checksum:O.checksum,bytes:RECORD_BYTES};
