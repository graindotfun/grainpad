import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {validateImage} from '../lib/image-validation.mjs';
const official=readFileSync(new URL('../public/brand/grain-token.png',import.meta.url));
test('valid official PNG passes structure, CRC and size checks',()=>{const result=validateImage(official,'image/png');assert.ok(result.width>0);assert.equal(result.type,'image/png');});
test('rejects truncation, appended payload, forged MIME and decompression dimensions',()=>{
 for(const bytes of [official.subarray(0,20),official.subarray(0,-12),Buffer.concat([official,Buffer.from('<script>')]),Buffer.alloc(2_000_001)])assert.throws(()=>validateImage(bytes,'image/png'));
 assert.throws(()=>validateImage(official,'image/jpeg'));
 const tampered=Buffer.from(official);tampered.writeUInt32BE(100000,16);assert.throws(()=>validateImage(tampered,'image/png'));
});
