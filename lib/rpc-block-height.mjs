/** Preserve caller semantics while sourcing height from the primary epoch field.
 * Some providers return a slot for getBlockHeight at confirmed commitment. */
export function blockHeightWireRequest(request){
 return request?.method==='getBlockHeight'?{...request,method:'getEpochInfo'}:request;
}
export function blockHeightCallerResponse(request,response){
 if(request?.method!=='getBlockHeight')return response;
 if(response?.jsonrpc!=='2.0'||response.id!==request.id)throw Error('Invalid primary block-height response identity.');
 if(response.error)return response;
 const height=response.result?.blockHeight;
 if(!Number.isSafeInteger(height)||height<0)throw Error('Primary epoch block height is unavailable or invalid.');
 return {...response,result:height};
}
