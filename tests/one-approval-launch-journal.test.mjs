import test from 'node:test';
import assert from 'node:assert/strict';
import {createLaunchJournal, v2JournalKey, recoverCreationTransaction} from '../lib/chain/one-approval-launch-journal.ts';
import {LAUNCH_CREATED_TOPIC} from '../lib/chain/robinhood-create.ts';

const creator = '0x1111111111111111111111111111111111111111', launchId = creator + 'ab'.repeat(12), digest = '0x' + '99'.repeat(32), tx = '0x' + 'ab'.repeat(32);
const mem = (fail = false) => { const m = new Map(); return {m, get: async k => { if (fail) throw new Error('x'); return m.get(k) ?? null; }, set: async (k, v) => { if (fail) throw new Error('x'); m.set(k, structuredClone(v)); }, remove: async k => { m.delete(k); }}; };

test('journal is written before the wallet and survives reload', async () => {
  const a = mem(), b = mem();
  const j = createLaunchJournal([a, b], creator, {startBlock: async () => '1234', now: () => 5});
  assert.equal((await j.read()).entry, null);
  await j.markStarted({launchId, creator, digest});
  const reloaded = createLaunchJournal([mem(), b], creator);   // one store lost: the other still recovers
  const r = await reloaded.read();
  assert.equal(r.entry.launchId, launchId); assert.equal(r.entry.startBlock, '1234'); assert.equal(r.entry.transactionHash, null);
  await j.markSent({launchId, transactionHash: tx});
  assert.equal((await createLaunchJournal([a], creator).read()).entry.transactionHash, tx);
  assert.ok(a.m.has(v2JournalKey(creator)));
  assert.ok(!v2JournalKey(creator).includes(':create:'), 'existing draft keys are never touched');
});

test('a second launch cannot start while one is unresolved; clear is explicit and exact', async () => {
  const a = mem(), j = createLaunchJournal([a], creator);
  await j.markStarted({launchId, creator, digest});
  await assert.rejects(j.markStarted({launchId: creator + 'cd'.repeat(12), creator, digest}), /already in progress/);
  await j.clear({...(await j.read()).entry, launchId: creator + 'cd'.repeat(12)});
  assert.notEqual((await j.read()).entry, null, 'clearing a different launch does nothing');
  await j.clear((await j.read()).entry);
  assert.equal((await j.read()).entry, null);
});

test('unavailable storage blocks the wallet request; conflicting stores are surfaced, never merged', async () => {
  const j = createLaunchJournal([mem(true), mem(true)], creator);
  await assert.rejects(j.markStarted({launchId, creator, digest}), /storage is unavailable/);
  const a = mem(), b = mem();
  a.m.set(v2JournalKey(creator), {version: 1, launchId, creator, digest, startBlock: null, startedAt: 1, transactionHash: null});
  b.m.set(v2JournalKey(creator), {version: 1, launchId: creator + 'cd'.repeat(12), creator, digest, startBlock: null, startedAt: 2, transactionHash: null});
  assert.equal((await createLaunchJournal([a, b], creator).read()).conflict, true);
  a.m.set(v2JournalKey(creator), {version: 1, launchId: 'bad'});
  assert.equal((await createLaunchJournal([a], creator).read()).entry, null);
});

test('a lost hash is recovered from the launch id', async () => {
  const rpc = async (method, [filter]) => { assert.equal(method, 'eth_getLogs'); assert.deepEqual(filter.topics, [LAUNCH_CREATED_TOPIC, launchId]); assert.equal(filter.fromBlock, '0x4d2'); return [{transactionHash: tx}]; };
  assert.equal(await recoverCreationTransaction(rpc, '0x' + '22'.repeat(20), launchId, LAUNCH_CREATED_TOPIC, '1234'), tx);
  assert.equal(await recoverCreationTransaction(async () => [], '0x' + '22'.repeat(20), launchId, LAUNCH_CREATED_TOPIC, null), null);
  await assert.rejects(recoverCreationTransaction(async () => [{transactionHash: tx}, {transactionHash: tx}], '0x' + '22'.repeat(20), launchId, LAUNCH_CREATED_TOPIC, null), /More than one/);
});

import {submitOneApprovalLaunch} from '../lib/chain/one-approval-launch-client.ts';
import {planOneApprovalLaunch} from '../lib/chain/evm-one-approval-launch.ts';
test('an explicit wallet refusal releases the entry; an ambiguous failure keeps it', async () => {
  const factory = '0x' + '22'.repeat(20);
  const profile = {networkId: 'robinhood:mainnet', chainId: 4663, factory, metadataOrigin: 'https://grainpad.fun', metadataPath: '/m/{launchId}', assetOrigin: 'https://grainpad.fun', registrationWindowSeconds: 86400};
  const {plan} = planOneApprovalLaunch(profile, {creator, launchId, metadata: {name: 'A', symbol: 'B', description: '', imageSha256: null, website: '', twitter: '', telegram: ''}, buyWei: 0n, slippageBps: 0, nowSeconds: 1_800_000_000});
  const wallet = failure => ({async request({method}) { if (method === 'eth_chainId') return '0x1237'; if (method === 'eth_accounts') return [creator]; if (method === 'eth_call') return '0x'; throw failure; }});
  const a = mem(), j = createLaunchJournal([a], creator);
  await assert.rejects(submitOneApprovalLaunch(wallet(Object.assign(new Error('User rejected the request.'), {code: 4001})), plan, creator, j));
  assert.equal((await j.read()).entry, null, 'user refusal frees the wallet for a fresh attempt');
  // Message text is never trusted: a provider error that merely SAYS it was rejected keeps the entry.
  await assert.rejects(submitOneApprovalLaunch(wallet(new Error('User rejected the request.')), plan, creator, j));
  assert.notEqual((await j.read()).entry, null, 'only the numeric code 4001 releases an entry');
  await j.clear((await j.read()).entry);
  await assert.rejects(submitOneApprovalLaunch(wallet(new Error('request timed out')), plan, creator, j));
  assert.notEqual((await j.read()).entry, null, 'a timeout may have broadcast: the entry stays and is recovered by launch id');
  await j.markSent({launchId: plan.launchId, transactionHash: tx});
  await j.markRejected({launchId: plan.launchId});
  assert.notEqual((await j.read()).entry, null, 'an entry with a hash is never released by a rejection');
});

import {makeJournalLock, recentCreatorLaunches} from '../lib/chain/one-approval-launch-journal.ts';
const slow = () => { const m = new Map(); const wait = () => new Promise(r => setTimeout(r, Math.random() * 4)); return {m, get: async k => { await wait(); return m.get(k) ?? null; }, set: async (k, v) => { await wait(); m.set(k, structuredClone(v)); }, remove: async k => { await wait(); m.delete(k); }}; };

// Real mutual exclusion, like navigator.locks: waiters queue per name.
const fakeLocks = () => { const tails = new Map(); return {request: (name, cb) => { const prev = tails.get(name) ?? Promise.resolve(); const run = prev.then(cb, cb); tails.set(name, run.catch(() => {})); return run; }}; };
test('two tabs cannot both start a launch: with the lock exactly one wins', async () => {
  const browserJournalLock = makeJournalLock((shared => () => shared)(fakeLocks()));
  for (let round = 0; round < 25; round++) {
    const a = slow(), b = slow();                       // shared browser storage seen by both tabs
    const tab1 = createLaunchJournal([a, b], creator, {lock: browserJournalLock}), tab2 = createLaunchJournal([a, b], creator, {lock: browserJournalLock});
    const results = await Promise.allSettled([tab1.markStarted({launchId, creator, digest}), tab2.markStarted({launchId: creator + 'cd'.repeat(12), creator, digest})]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1, 'exactly one tab proceeds to the wallet');
    assert.equal((await tab1.read()).conflict, false);
  }
});

test('a browser without Web Locks cannot launch (fails closed) and a lock failure never reaches the wallet', async () => {
  const noLocks = makeJournalLock(() => undefined);
  const j = createLaunchJournal([mem()], creator, {lock: noLocks});
  await assert.rejects(j.markStarted({launchId, creator, digest}), /cannot guard against a second open tab/);
  assert.equal((await j.read()).entry, null, 'nothing was journaled, so nothing can be sent');
});

test('a launch made from another browser or after storage was cleared is found on-chain', async () => {
  const calls = [];
  const rpc = async (method, params) => { calls.push(method); if (method === 'eth_blockNumber') return '0x30d40'; return [{topics: [LAUNCH_CREATED_TOPIC, launchId, '0x' + '0'.repeat(64), '0x' + creator.slice(2).padStart(64, '0')], transactionHash: tx}]; };
  const found = await recentCreatorLaunches(rpc, '0x' + '22'.repeat(20), creator, LAUNCH_CREATED_TOPIC, 100_000n);
  assert.deepEqual(found, [{launchId, transactionHash: tx}]);
  await assert.rejects(recentCreatorLaunches(async m => m === 'eth_blockNumber' ? '0x1' : new Array(51).fill({}), '0x' + '22'.repeat(20), creator, LAUNCH_CREATED_TOPIC), /unavailable/);
});

import {proveNothingSent, verifyCreationTransaction} from '../lib/chain/one-approval-launch-journal.ts';
import {encodeCreateAndLaunch, keccakHex} from '../lib/chain/evm-one-approval-launch.ts';
const factory = '0x' + '22'.repeat(20);
const calldata = (id = launchId, deadline = 1_000n) => encodeCreateAndLaunch({name: 'Seed', symbol: 'SEED', launchId: id, metadataURI: 'https://x/m', metadataHash: '0x' + '55'.repeat(32), registrationExpiresAt: 2_000n, minTokensOut: 0n, deadline});
const dataBytes = d => Uint8Array.from(d.slice(2).match(/../g), b => parseInt(b, 16));

test('a hash-less entry is released only by a finalized deadline with no creation, never by a nonce, tokenOf == 0 or text', async () => {
  const entry = {version: 1, launchId, creator, digest, startBlock: '5', startedAt: 1, transactionHash: null, deadline: '1000', dataHash: null, chainId: '4663'};
  const chain = ({finalizedTime, logs = [], nonce = '0x7', chainId = '0x1237'}) => async (method, params) => {
    if (method === 'eth_chainId') return chainId;
    if (method === 'eth_getBlockByNumber') { assert.equal(params[0], 'finalized'); return {number: '0x64', timestamp: '0x' + finalizedTime.toString(16)}; }
    if (method === 'eth_getLogs') { assert.equal(params[0].toBlock, '0x64', 'history is read only up to the finalized block'); assert.equal(params[0].topics[1], launchId); return logs; }
    if (method === 'eth_getTransactionCount') return nonce;      // must be irrelevant
    throw new Error('unexpected ' + method);
  };
  assert.equal((await proveNothingSent(chain({finalizedTime: 1001}), entry, factory, LAUNCH_CREATED_TOPIC, 0x1237n)).safe, true, 'finalized past the deadline, no creation');
  assert.equal((await proveNothingSent(chain({finalizedTime: 1000}), entry, factory, LAUNCH_CREATED_TOPIC, 0x1237n)).safe, false, 'the deadline block itself can still execute (revert only when deadline < timestamp)');
  assert.equal((await proveNothingSent(chain({finalizedTime: 500}), entry, factory, LAUNCH_CREATED_TOPIC, 0x1237n)).safe, false, 'deadline not yet finalized');
  assert.equal((await proveNothingSent(chain({finalizedTime: 2000, logs: [{}]}), entry, factory, LAUNCH_CREATED_TOPIC, 0x1237n)).safe, false, 'a creation exists');
  assert.equal((await proveNothingSent(chain({finalizedTime: 2000}), {...entry, deadline: null}, factory, LAUNCH_CREATED_TOPIC, 0x1237n)).safe, false, 'no recorded deadline: preserved');
  assert.equal((await proveNothingSent(chain({finalizedTime: 2000}), {...entry, transactionHash: tx}, factory, LAUNCH_CREATED_TOPIC, 0x1237n)).safe, false, 'an entry with a hash is never unsent');
  assert.equal((await proveNothingSent(chain({finalizedTime: 2000, nonce: '0x7'}), entry, factory, LAUNCH_CREATED_TOPIC, 0x1237n)).safe, true, 'an unchanged pending nonce neither helps nor hurts');
  await assert.rejects(proveNothingSent(async () => null, entry, factory, LAUNCH_CREATED_TOPIC, 0x1237n), /unavailable/);
  await assert.rejects(proveNothingSent(async m => m === 'eth_getBlockByNumber' ? {number: 'x', timestamp: '0x1'} : [], entry, factory, LAUNCH_CREATED_TOPIC, 0x1237n), /unavailable/);
});

test('the journal records the signed deadline and calldata hash before the wallet is asked', async () => {
  const j = createLaunchJournal([mem()], creator, {startBlock: async () => '9', lock: makeJournalLock(() => ({request: (n, cb) => cb()}))});
  const data = calldata(); const dataHash = keccakHex(dataBytes(data));
  await j.markStarted({launchId, creator, digest, deadline: 1000n, dataHash});
  const entry = (await j.read()).entry;
  assert.equal(entry.deadline, '1000'); assert.equal(entry.dataHash, dataHash); assert.equal('startNonce' in entry, false);
});

test('a recovered, adopted or pasted hash is verified for sender, factory, chain, launch id and calldata', async () => {
  const data = calldata(); const dataHash = keccakHex(dataBytes(data));
  const rpcFor = tx0 => async (method, [h]) => { if (method === 'eth_chainId') return '0x1237'; assert.equal(method, 'eth_getTransactionByHash'); return tx0 === null ? null : {hash: h, from: creator, to: factory, input: data, chainId: '0x1237', ...tx0}; };
  const want = {hash: tx, creator, factory, launchId, chainId: 0x1237n, dataHash};
  assert.equal((await verifyCreationTransaction(rpcFor({}), want)).ok, true);
  assert.equal((await verifyCreationTransaction(rpcFor({}), {...want, dataHash: null})).ok, true, 'adopted entries have no calldata hash; launch id still binds');
  for (const [name, tx0, expect] of [
    ['unknown to the node', null, /does not know/], ['different hash returned', {hash: '0x' + 'cd'.repeat(32)}, /different transaction/],
    ['other sender', {from: '0x' + '33'.repeat(20)}, /not sent by this wallet/], ['other contract', {to: '0x' + '44'.repeat(20)}, /launch contract/],
    ['other network', {chainId: '0x1'}, /different network/], ['not a launch', {input: '0xa9059cbb' + '00'.repeat(64)}, /not a Grainpad launch/],
    ['other launch id', {input: calldata(creator + 'cd'.repeat(12))}, /different launch/], ['same launch id, altered contents', {input: calldata(launchId, 999n)}, /differ from the launch you reviewed/],
  ]) {
    const verdict = await verifyCreationTransaction(rpcFor(tx0), want);
    assert.equal(verdict.ok, false, name); assert.match(verdict.reason, expect, name);
  }
});

test('a recorded hash is never overwritten; the same hash is idempotent', async () => {
  const j = createLaunchJournal([mem()], creator);
  await j.markStarted({launchId, creator, digest});
  await j.markSent({launchId, transactionHash: tx});
  await j.markSent({launchId, transactionHash: tx});
  await assert.rejects(j.markSent({launchId, transactionHash: '0x' + 'cd'.repeat(32)}), /not overwritten/);
  assert.equal((await j.read()).entry.transactionHash, tx);
});

test('clear is compare-and-delete on the exact launch id and transaction hash', async () => {
  const a = mem(), j = createLaunchJournal([a], creator);
  await j.markStarted({launchId, creator, digest});
  assert.equal(await j.clear({launchId, transactionHash: tx}), false, 'a hash the entry does not have');
  await j.markSent({launchId, transactionHash: tx});
  assert.equal(await j.clear({launchId, transactionHash: null}), false, 'an unsent clear cannot remove a launch that has since been sent');
  assert.equal(await j.clear({launchId, transactionHash: '0x' + 'cd'.repeat(32)}), false, 'a different hash');
  assert.equal(await j.clear({launchId: creator + 'cd'.repeat(12), transactionHash: tx}), false, 'a different launch');
  assert.notEqual((await j.read()).entry, null);
  assert.equal(await j.clear({launchId, transactionHash: tx}), true);
  assert.equal((await j.read()).entry, null);
});

test('clear runs under the journal lock, so a concurrent writer cannot interleave', async () => {
  const a = mem(); const order = [];
  let chain = Promise.resolve();
  const lock = (name, job) => { const run = chain.then(async () => { order.push('in'); const r = await job(); order.push('out'); return r; }); chain = run.catch(() => {}); return run; };
  const j = createLaunchJournal([a], creator, {lock});
  await j.markStarted({launchId, creator, digest}); await j.markSent({launchId, transactionHash: tx});
  order.length = 0;
  await Promise.all([j.clear({launchId, transactionHash: tx}), j.markStarted({launchId: creator + 'cd'.repeat(12), creator, digest})]);
  assert.deepEqual(order, ['in', 'out', 'in', 'out'], 'strictly serialized');
  assert.equal((await j.read()).entry.launchId, creator + 'cd'.repeat(12), 'the new launch, started after the clear, survives');
});

test('the deadline proof is bound to the launch chain: another network cannot release an unresolved launch', async () => {
  const entry = {version: 1, launchId, creator, digest, startBlock: '5', startedAt: 1, transactionHash: null, deadline: '1000', dataHash: null, chainId: '4663'};
  const rpcOn = (id, flip) => { let calls = 0; return async (method) => {
    if (method === 'eth_chainId') return flip && ++calls > 1 ? flip : id;
    if (method === 'eth_getBlockByNumber') return {number: '0x64', timestamp: '0xffffff'};     // expired on every chain
    if (method === 'eth_getLogs') return [];                                                      // and empty on every other chain
    throw new Error('unexpected ' + method);
  }; };
  assert.equal((await proveNothingSent(rpcOn('0x1237'), entry, factory, LAUNCH_CREATED_TOPIC, 0x1237n)).safe, true, 'control: the right chain proves it');
  await assert.rejects(proveNothingSent(rpcOn('0x1'), entry, factory, LAUNCH_CREATED_TOPIC, 0x1237n), /different network/, 'wallet on mainnet ethereum');
  await assert.rejects(proveNothingSent(rpcOn('0x1237', '0x1'), entry, factory, LAUNCH_CREATED_TOPIC, 0x1237n), /different network/, 'switched while the proof was reading');
  await assert.rejects(proveNothingSent(async () => 'garbage', entry, factory, LAUNCH_CREATED_TOPIC, 0x1237n), /unavailable/);
  const wrongEntry = await proveNothingSent(rpcOn('0x1'), {...entry, chainId: '1'}, factory, LAUNCH_CREATED_TOPIC, 0x1237n);
  assert.equal(wrongEntry.safe, false, 'an entry recorded on another chain is never evaluated here');
  const data = calldata();
  const tx0 = {hash: tx, from: creator, to: factory, input: data, chainId: '0x1237'};
  await assert.rejects(verifyCreationTransaction(async m => m === 'eth_chainId' ? '0x1' : tx0, {hash: tx, creator, factory, launchId, chainId: 0x1237n}), /different network/, 'recovered transactions are read only from the launch chain');
});

test('stores that disagree about the transaction for the same launch id are a conflict and nothing is cleared or overwritten', async () => {
  const a = mem(), b = mem(), hashA = '0x' + 'aa'.repeat(32), hashB = '0x' + 'bb'.repeat(32);
  const j = createLaunchJournal([a, b], creator);
  await j.markStarted({launchId, creator, digest, chainId: 4663n});
  a.m.set(v2JournalKey(creator), {...a.m.get(v2JournalKey(creator)), transactionHash: hashA});
  b.m.set(v2JournalKey(creator), {...b.m.get(v2JournalKey(creator)), transactionHash: hashB});
  const read = await j.read();
  assert.equal(read.conflict, true, 'same launch id, different hashes');
  assert.equal(await j.clear({launchId, transactionHash: hashA}), false);
  assert.equal(await j.clear({launchId, transactionHash: hashB}), false);
  await assert.rejects(j.markSent({launchId, transactionHash: hashA}), /Conflicting launch records/);
  await j.markRejected({launchId});
  assert.equal(a.m.get(v2JournalKey(creator)).transactionHash, hashA, 'store A untouched');
  assert.equal(b.m.get(v2JournalKey(creator)).transactionHash, hashB, 'store B untouched');
  // A hash in only one store is an interrupted write, not a conflict.
  b.m.set(v2JournalKey(creator), {...b.m.get(v2JournalKey(creator)), transactionHash: null});
  assert.equal((await j.read()).conflict, false);
  assert.equal((await j.read()).entry.transactionHash, hashA);
  // Different chains recorded for the same launch id are also a conflict.
  b.m.set(v2JournalKey(creator), {...b.m.get(v2JournalKey(creator)), chainId: '1'});
  assert.equal((await j.read()).conflict, true);
  assert.equal(await j.clear({launchId, transactionHash: hashA}), false);
});
