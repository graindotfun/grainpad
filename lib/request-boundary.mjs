/** Browser mutation boundary; Origin is necessary, never an authentication credential. */
export function assertSameOrigin(request) {
 if(request.headers.get('Origin')!==new URL(request.url).origin)throw Error('A matching Origin header is required.');
 const site=request.headers.get('Sec-Fetch-Site');
 if(site&&site!=='same-origin')throw Error('Cross-site requests are not allowed.');
}
export async function readLimitedJSON(request,max=1_600_000){
 const length=request.headers.get('Content-Length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>max))throw Error('Request is too large.');
 if(!request.body)throw Error('Request body is required.');
 const reader=request.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw Error('Request is too large.');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
