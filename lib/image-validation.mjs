/** Structural validation and decoded-dimension budget; media remains untrusted browser input. */
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let value=0xffffffff;for(const b of bytes)value=crcTable[(value^b)&255]^(value>>>8);return (value^0xffffffff)>>>0;}
const word=(b,start,n)=>String.fromCharCode(...b.subarray(start,start+n));
export function validateImage(bytes,claimedType){
 if(!(bytes instanceof Uint8Array)||bytes.length>2_000_000||bytes.length<20)throw Error('Upload a complete image below 2 MB.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let type,width=0,height=0;
 if(word(bytes,0,8)==='\x89PNG\r\n\x1a\n'){
  type='image/png';let offset=8,header=false,end=false,pixels=false;
  while(offset+12<=bytes.length){const n=view.getUint32(offset),kind=word(bytes,offset+4,4);if(n>bytes.length-offset-12)throw Error('Truncated PNG.');
   if(crc(bytes.subarray(offset+4,offset+8+n))!==view.getUint32(offset+8+n))throw Error('PNG checksum mismatch.');
   if(!header){if(kind!=='IHDR'||n!==13)throw Error('Invalid PNG header.');width=view.getUint32(offset+8);height=view.getUint32(offset+12);header=true;}else if(kind==='IHDR')throw Error('Duplicate PNG header.');
   if(kind==='acTL')throw Error('Use a still image.');if(kind==='IDAT')pixels=true;offset+=12+n;
   if(kind==='IEND'){if(n!==0||offset!==bytes.length)throw Error('Trailing PNG data.');end=true;break;}
  }
  if(!end||!pixels)throw Error('Incomplete PNG.');
 }else if(bytes[0]===255&&bytes[1]===216){
  type='image/jpeg';let offset=2,end=false,scan=false;
  while(offset<bytes.length){if(bytes[offset++]!==255)throw Error('Invalid JPEG marker.');while(bytes[offset]===255)offset++;const marker=bytes[offset++];
   if(marker===217){if(offset!==bytes.length)throw Error('Trailing JPEG data.');end=true;break;}
   if(offset+2>bytes.length)throw Error('Truncated JPEG.');const n=view.getUint16(offset);if(n<2||offset+n>bytes.length)throw Error('Truncated JPEG segment.');
   if(marker===192||marker===194){if(n<8||width)throw Error('Invalid JPEG dimensions.');height=view.getUint16(offset+3);width=view.getUint16(offset+5);}
   offset+=n;
   if(marker===218){scan=true;while(offset<bytes.length){if(bytes[offset]!==255){offset++;continue;}const next=bytes[offset+1];if(next===0||(next>=208&&next<=215)){offset+=2;continue;}if(next===255){offset++;continue;}break;}}
  }
  if(!end||!scan)throw Error('Incomplete JPEG.');
 }else if(word(bytes,0,4)==='RIFF'&&word(bytes,8,4)==='WEBP'){
  type='image/webp';if(view.getUint32(4,true)+8!==bytes.length)throw Error('Invalid WebP size.');let offset=12,frame=false;
  while(offset+8<=bytes.length){const kind=word(bytes,offset,4),n=view.getUint32(offset+4,true),start=offset+8;if(n>bytes.length-start)throw Error('Truncated WebP.');
   if(kind==='ANIM'||kind==='ANMF')throw Error('Use a still image.');
   if(kind==='VP8X'){if(n!==10||(bytes[start]&2))throw Error('Invalid or animated WebP.');}
   if(kind==='VP8 '){if(frame||n<10||word(bytes,start+3,3)!=='\x9d\x01\x2a'||(bytes[start]&1))throw Error('Invalid WebP frame.');width=view.getUint16(start+6,true)&0x3fff;height=view.getUint16(start+8,true)&0x3fff;frame=true;}
   if(kind==='VP8L'){if(frame||n<5||bytes[start]!==47||(bytes[start+4]>>5)!==0)throw Error('Invalid lossless WebP.');const bits=view.getUint32(start+1,true);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;frame=true;}
   offset=start+n+(n%2);
  }
  if(!frame||offset!==bytes.length)throw Error('Incomplete WebP.');
 }else throw Error('Choose PNG, JPEG or WebP.');
 if(type!==claimedType||width<1||height<1||width>4096||height>4096||width*height>8_388_608)throw Error('Image must match its file type and fit within 4096 pixels per side and 8 megapixels.');
 return {type,width,height};
}
