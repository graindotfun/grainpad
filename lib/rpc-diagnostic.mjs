const categories=new Set(['budget','concurrency','transport','cancelled','invalid-response','provider','fallback-network','fallback-absence','unknown']);
/** Fixed categories and bounded numbers only; never retain provider strings. */
export function sanitizeRpcDiagnostic(value){
 if(!value||typeof value!=='object')return null;
 const attempts=Array.isArray(value.attempts)?value.attempts.slice(0,3).map(item=>({
  category:categories.has(item?.category)?item.category:'unknown',
  ...(Number.isSafeInteger(item?.providerCode)&&Math.abs(item.providerCode)<=2147483647?{providerCode:item.providerCode}:{}),
  ...(Number.isSafeInteger(item?.httpStatus)&&item.httpStatus>=100&&item.httpStatus<=599?{httpStatus:item.httpStatus}:{})
 })):[];
 return {category:categories.has(value.category)?value.category:'unknown',attempts};
}
export class RpcReadFailure extends Error {
 constructor(diagnostic){super('Chain verification is temporarily unavailable. Please retry.');this.diagnostic=sanitizeRpcDiagnostic(diagnostic);}
}
