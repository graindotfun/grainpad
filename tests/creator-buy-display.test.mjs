import test from 'node:test';import assert from 'node:assert/strict';import {creatorBuyDisplay} from '../lib/creator-buy-display.mjs';
test('structured creator-buy intent displays exact quote units without rounding or object coercion',()=>{
 assert.equal(creatorBuyDisplay({amount:{quote:'wXMR',amountIn:'145000000000',minOut:'20697151482236'},asset:'wXMR'}).text,'0.145 wXMR');
 assert.equal(creatorBuyDisplay({amount:{quote:'wXMR',amountIn:'9007199254740993'},asset:'wXMR'}).text,'9007.199254740993 wXMR');
 assert.equal(creatorBuyDisplay({amount:{quote:'SOL',amountIn:'1'},asset:'wXMR'}).text,'0.000000001 SOL');
});
test('legacy exact amounts and zero remain declarations; absent or malformed amounts never invent zero',()=>{
 assert.deepEqual(creatorBuyDisplay(null),{text:'Not declared',declared:false});
 assert.equal(creatorBuyDisplay({amount:'0',asset:'wXMR'}).text,'0 wXMR');
 assert.equal(creatorBuyDisplay({amount:'0.000000000001',asset:'wXMR'}).text,'0.000000000001 wXMR');
 for(const amount of [{quote:'wXMR'},{quote:'other',amountIn:'1'},{quote:'SOL',amountIn:'-1'},{quote:'SOL',amountIn:'18446744073709551616'}])assert.deepEqual(creatorBuyDisplay({amount,asset:'wXMR'}),{text:'Amount not specified',declared:true});
});
