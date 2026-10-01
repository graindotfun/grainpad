import test from 'node:test';import assert from 'node:assert/strict';
import {sanitizeRpcDiagnostic,RpcReadFailure} from '../lib/rpc-diagnostic.mjs';
test('malicious diagnostic payload cannot inject strings, URLs or unbounded codes',()=>{
 const result=sanitizeRpcDiagnostic({category:'secret',message:'https://secret',attempts:Array.from({length:100},()=>({category:'secret',providerCode:1e50,httpStatus:'secret',message:'secret'}))});
 assert.equal(result.category,'unknown');assert.equal(result.attempts.length,3);assert.deepEqual(result.attempts[0],{category:'unknown'});assert(!JSON.stringify(result).includes('secret'));
 const error=new RpcReadFailure({category:'provider',attempts:[{category:'provider',providerCode:-32005}]});assert.equal(error.message,'Chain verification is temporarily unavailable. Please retry.');
});
