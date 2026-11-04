import test from 'node:test';
import assert from 'node:assert/strict';
import {createGrainpetEntry,grainpetEligible,GRAINPET_PATH} from '../lib/grainpet-entry.mjs';
const SOL={family:'solana',networkId:'solana:mainnet-beta',owner:'x'},RH={family:'evm',networkId:'robinhood:mainnet',owner:'0x1'},ETH={family:'evm',networkId:'evm:1',owner:'0x1'};
function fake(initial=null){let snap=initial;const subs=new Set();return {getSnapshot:()=>snap,subscribe:f=>{subs.add(f);return()=>subs.delete(f);},set(s){snap=s;for(const f of [...subs])f();},count:()=>subs.size};}
test('only Solana mainnet and Robinhood mainnet wallets are eligible',()=>{assert.ok(grainpetEligible(SOL));assert.ok(grainpetEligible(RH));assert.ok(!grainpetEligible(ETH));assert.ok(!grainpetEligible(null));assert.ok(!grainpetEligible({family:'solana',networkId:'devnet'}));});
test('connected: goes straight to /pet/ and never opens the chooser',()=>{const s=fake(SOL),went=[];let opened=0;createGrainpetEntry({session:s,open:()=>opened++,go:p=>went.push(p)}).enter();assert.deepEqual(went,[GRAINPET_PATH]);assert.equal(opened,0);});
test('not connected: opens the existing chooser once and continues automatically after a successful connect',()=>{
 const s=fake(null),went=[];let opened=0;const e=createGrainpetEntry({session:s,open:()=>opened++,go:p=>went.push(p)});
 e.enter();assert.equal(opened,1);assert.deepEqual(went,[]);assert.ok(e.pending());
 s.set(ETH);assert.deepEqual(went,[]);                 /* wrong network: keeps waiting */
 s.set(SOL);assert.deepEqual(went,[GRAINPET_PATH]);assert.equal(s.count(),0);assert.ok(!e.pending());
 s.set(RH);assert.equal(went.length,1);                /* no second jump */
});
test('closing the chooser cancels the pending jump; a later unrelated connect does not navigate',()=>{
 const s=fake(null),went=[];const e=createGrainpetEntry({session:s,open(){},go:p=>went.push(p)});
 e.enter();e.cancel();s.set(SOL);assert.deepEqual(went,[]);assert.equal(s.count(),0);
});
test('clicking twice does not stack listeners',()=>{const s=fake(null),went=[];const e=createGrainpetEntry({session:s,open(){},go:p=>went.push(p)});e.enter();e.enter();assert.equal(s.count(),1);s.set(SOL);assert.equal(went.length,1);});
