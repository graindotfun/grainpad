import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {OFFICIAL_METADATA_DOCUMENT} from '../lib/official-metadata.mjs';
import {PREVIOUS_TOKEN_BANNER} from '../lib/previous-official-mints.mjs';
const banned=/\b(?:immutable|trustless|rug-proof|safe)\b/i;
function files(dir,out=[]){
 for(const name of readdirSync(dir)){
  const path=join(dir,name);
  if(statSync(path).isDirectory())files(path,out);
  else if(/\.(tsx|ts|jsx|js|mjs)$/.test(name))out.push(path);
 }
 return out;
}
function literals(text){
 return [...text.matchAll(/(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g)].map(match=>match[0]);
}
test('public copy avoids banned marketing words',()=>{
 const hits=[];
 for(const path of [...files('app'),...files('components')]){
  for(const literal of literals(readFileSync(path,'utf8'))){
   if(literal.includes('max-age=31536000, immutable'))continue;
   if(banned.test(literal))hits.push(`${path}: ${literal.slice(0,180)}`);
  }
 }
 assert.deepEqual(hits,[]);
 assert.equal(banned.test(OFFICIAL_METADATA_DOCUMENT.description),false);
 assert.equal(PREVIOUS_TOKEN_BANNER,'Previous GRAIN token. Not supported by grainpad.');
});
