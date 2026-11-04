import {readBoundedRequestText} from './bounded-request-body.mjs';
/** Browser mutation boundary; Origin is necessary, never an authentication credential. */
export function assertSameOrigin(request) {
 if(request.headers.get('Origin')!==new URL(request.url).origin)throw Error('A matching Origin header is required.');
 const site=request.headers.get('Sec-Fetch-Site');
 if(site&&site!=='same-origin')throw Error('Cross-site requests are not allowed.');
}
export async function readLimitedJSON(request,max=1_600_000){
 return JSON.parse(await readBoundedRequestText(request,{maxBytes:max}));
}
