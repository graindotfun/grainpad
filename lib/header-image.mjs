import {validateImage} from './image-validation.mjs';

/** Shown beside the optional launch banner. This does not promise that any indexer will fetch it. */
export const HEADER_COPY='Canonical project banner used by Grainpad and available to external indexers.';
export const HEADER_WIDTH=1200;
export const HEADER_HEIGHT=400;
export const HEADER_SMALL_WIDTH=600;
export const HEADER_SMALL_HEIGHT=200;
export const HEADER_ASPECT='3:1';

const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let value=0xffffffff;for(const b of bytes)value=crcTable[(value^b)&255]^(value>>>8);return (value^0xffffffff)>>>0;}
function word(bytes,start,length){return String.fromCharCode(...bytes.subarray(start,start+length));}
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);if(pa<=pb&&pa<=pc)return a;return pb<=pc?b:c;}

/** Still 1200×400 PNG bytes only. A URL is not an asset. */
export function validateHeaderImage(bytes,claimedType){
 if(typeof bytes==='string')throw Error('An arbitrary URL cannot replace the header asset.');
 const image=validateImage(bytes,claimedType);
 if(image.type!=='image/png'||image.width!==HEADER_WIDTH||image.height!==HEADER_HEIGHT)throw Error('Header image must be a 1200 by 400 PNG (3:1). Grainpad stores those pixels and a 600 by 200 rendition.');
 return image;
}

async function inflate(payload){
 const stream=new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate'));
 return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function deflate(payload){
 const stream=new Blob([payload]).stream().pipeThrough(new CompressionStream('deflate'));
 return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Decode an 8-bit RGB or RGBA PNG. Used only for the fixed banner size. */
export async function decodeHeaderPng(bytes){
 validateHeaderImage(bytes,'image/png');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let offset=8,idat=[],color=0,interlace=0;
 while(offset+12<=bytes.length){
  const length=view.getUint32(offset),kind=word(bytes,offset+4,4),data=bytes.subarray(offset+8,offset+8+length);
  if(kind==='IHDR'){if(data[8]!==8||(data[9]!==2&&data[9]!==6))throw Error('Header PNG must be 8-bit RGB or RGBA.');color=data[9];interlace=data[12];if(interlace!==0)throw Error('Header PNG must be a non-interlaced still image.');}
  if(kind==='IDAT')idat.push(data);
  offset+=12+length;
  if(kind==='IEND')break;
 }
 const channels=color===6?4:3;
 const inflated=await inflate(concat(idat));
 const stride=HEADER_WIDTH*channels,expected=HEADER_HEIGHT*(1+stride);
 if(inflated.length!==expected)throw Error('Header PNG pixel data does not match 1200 by 400.');
 const pixels=new Uint8Array(HEADER_HEIGHT*stride);
 let cursor=0;
 for(let y=0;y<HEADER_HEIGHT;y++){
  const filter=inflated[cursor++],row=pixels.subarray(y*stride,(y+1)*stride),prior=y?pixels.subarray((y-1)*stride,y*stride):null;
  for(let i=0;i<stride;i++){
   const raw=inflated[cursor++],left=i>=channels?row[i-channels]:0,up=prior?prior[i]:0,upLeft=prior&&i>=channels?prior[i-channels]:0;
   if(filter===0)row[i]=raw;
   else if(filter===1)row[i]=(raw+left)&255;
   else if(filter===2)row[i]=(raw+up)&255;
   else if(filter===3)row[i]=(raw+((left+up)>>1))&255;
   else if(filter===4)row[i]=(raw+paeth(left,up,upLeft))&255;
   else throw Error('Header PNG uses an unsupported filter.');
  }
 }
 return {pixels,channels};
}

function concat(parts){const size=parts.reduce((sum,part)=>sum+part.length,0),out=new Uint8Array(size);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;}
function boxDownsample(pixels,channels){
 const stride=HEADER_WIDTH*channels,smallStride=HEADER_SMALL_WIDTH*channels,out=new Uint8Array(HEADER_SMALL_HEIGHT*smallStride);
 for(let y=0;y<HEADER_SMALL_HEIGHT;y++)for(let x=0;x<HEADER_SMALL_WIDTH;x++)for(let channel=0;channel<channels;channel++){
  const i=(y*2*stride)+(x*2*channels)+channel;
  out[(y*smallStride)+(x*channels)+channel]=(pixels[i]+pixels[i+channels]+pixels[i+stride]+pixels[i+stride+channels]+2)>>2;
 }
 return out;
}
function chunk(type,data){
 const body=concat([new TextEncoder().encode(type),data]);
 const length=new Uint8Array(4);new DataView(length.buffer).setUint32(0,data.length);
 const check=new Uint8Array(4);new DataView(check.buffer).setUint32(0,crc(body));
 return concat([length,body,check]);
}
async function encodePng(pixels,channels){
 const stride=HEADER_SMALL_WIDTH*channels,raw=new Uint8Array(HEADER_SMALL_HEIGHT*(1+stride));
 for(let y=0;y<HEADER_SMALL_HEIGHT;y++){raw[y*(1+stride)]=0;raw.set(pixels.subarray(y*stride,(y+1)*stride),y*(1+stride)+1);}
 const ihdr=new Uint8Array(13);const view=new DataView(ihdr.buffer);
 view.setUint32(0,HEADER_SMALL_WIDTH);view.setUint32(4,HEADER_SMALL_HEIGHT);ihdr[8]=8;ihdr[9]=channels===4?6:2;
 const signature=Uint8Array.from([137,80,78,71,13,10,26,10]);
 return concat([signature,chunk('IHDR',ihdr),chunk('IDAT',await deflate(raw)),chunk('IEND',new Uint8Array())]);
}

/** The 1200×400 source and the 600×200 box-downsampled PNG of the same pixels. */
export async function headerRenditions(bytes){
 const {pixels,channels}=await decodeHeaderPng(bytes);
 return {large:bytes,small:await encodePng(boxDownsample(pixels,channels),channels)};
}
