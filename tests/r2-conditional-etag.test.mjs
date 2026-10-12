import test from 'node:test';
import assert from 'node:assert/strict';
import {r2ConditionalEtag} from '../lib/r2-conditional-etag.mjs';

test('R2 conditions accept the exact raw ETag or one HTTP quote pair',()=>{
 for(const raw of ['ec08655dcb9c43409688e047d29696e4','ec08655dcb9c43409688e047d29696e4-2','a'.repeat(64)]){
  assert.equal(r2ConditionalEtag(raw),raw);assert.equal(r2ConditionalEtag('"'+raw+'"'),raw);
 }
});
test('malformed R2 condition tokens cannot weaken an exact match',()=>{
 for(const tag of [null,undefined,0,'','""','*','"*"','W/"abc"','w/"abc"','""abc""','"abc','abc"','"abc", "def"','abc,def',' abc','abc ','" abc"','"abc "','abc\n','abc\r\nIf-Match: *','"abc\\"def"'])assert.throws(()=>r2ConditionalEtag(tag),/Conditional write refused/);
});
