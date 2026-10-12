import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertIndexerTransactionSchema} from '../lib/indexer-transaction-schema.mjs';
import {parseChainEvents} from '../lib/chain-events.mjs';
import {POLICY} from '../lib/platform-policy.mjs';
const fixture=name=>{const value=JSON.parse(readFileSync(new URL(`./fixtures/${name}`,import.meta.url),'utf8'));for(const table of value.transaction?.message?.addressTableLookups??[]){table.accountKey=table.tableAddress;delete table.tableAddress;}return value;};
const v1=fixture('mainnet-v1-indexed-trade.json'),v0=fixture('mainnet-v0-indexed-trade.json'),row=fixture('grainu-canonical-index-record.json');
const parse=tx=>parseChainEvents(assertIndexerTransactionSchema(tx,tx.transaction.signatures[0]),tx.transaction.signatures[0],[row],POLICY.cpConfig,row.platformId);
test('official mainnet v1 JSON parses exact sell and creator receipt without wire decoding',()=>{
 assert.equal(v1.version,1);assert.equal(v1.slot,452110410);assert.equal(v1.transaction.message.accountKeys.length,46);
 const events=parse(v1);assert.deepEqual(events.map(e=>e.kind),['sell','fee-accrued']);
 assert.equal(String(events[0].baseAmount),'11093393833809');assert.equal(String(events[0].quoteAmount),'122388146826');
 const pre=v1.meta.preTokenBalances.find(x=>x.accountIndex===24),post=v1.meta.postTokenBalances.find(x=>x.accountIndex===24);
 const receipt=BigInt(post.uiTokenAmount.amount)-BigInt(pre.uiTokenAmount.amount);
 assert.equal(receipt,309843409n);assert.equal(String(events[1].quoteAmount),String(receipt));
});
test('v0 lookup-table control preserves exact existing outputs',()=>{
 assert.equal(v0.version,0);const events=parse(v0);assert.deepEqual(events.map(e=>e.kind),['buy','fee-accrued']);
 assert.equal(String(events[0].baseAmount),'1002583970198');assert.equal(String(events[0].quoteAmount),'7305332892');assert.equal(String(events[1].quoteAmount),'18263332');
});
test('v1 resource fee config does not enter SPL fee ledger',()=>{const changed=structuredClone(v1);changed.transaction.message.transactionConfig.priorityFee=1;assert.deepEqual(parse(changed),parse(v1));});
for(const [name,mutate] of [
 ['future version',t=>t.version=2],['unexpected ALT',t=>t.meta.loadedAddresses.writable.push(t.transaction.message.accountKeys[0])],
 ['parsed key object',t=>t.transaction.message.accountKeys[0]={pubkey:t.transaction.message.accountKeys[0]}],
 ['out of range instruction',t=>t.transaction.message.instructions[0].programIdIndex=64],
 ['missing resource config',t=>delete t.transaction.message.transactionConfig],
 ['out of range balance',t=>t.meta.postTokenBalances[0].accountIndex=64],
 ['nonstring raw balance',t=>t.meta.postTokenBalances[0].uiTokenAmount.amount=1e20],
 ])test(`v1 guard rejects ${name}`,()=>{const changed=structuredClone(v1);mutate(changed);assert.throws(()=>parse(changed));});
test('v1 guard binds returned receipt to requested signature',()=>assert.throws(()=>assertIndexerTransactionSchema(v1,'different'),/signature mismatch/));
