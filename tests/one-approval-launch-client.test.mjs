import test from 'node:test';
import assert from 'node:assert/strict';
import {planOneApprovalLaunch} from '../lib/chain/evm-one-approval-launch.ts';
import {submitOneApprovalLaunch, probeLaunchId} from '../lib/chain/one-approval-launch-client.ts';

const creator = '0x1111111111111111111111111111111111111111', factory = '0x2222222222222222222222222222222222222222';
const launchId = creator + 'ab'.repeat(12);
const profile = {networkId: 'robinhood:mainnet', chainId: 4663, factory, metadataOrigin: 'https://grainpad.fun', metadataPath: '/m/{launchId}', assetOrigin: 'https://grainpad.fun', registrationWindowSeconds: 86400};
const meta = {name: 'Grain Cat', symbol: 'GCAT', description: 'x', imageSha256: null, website: '', twitter: '', telegram: ''};
const {plan} = planOneApprovalLaunch(profile, {creator, launchId, metadata: meta, buyWei: 10n ** 16n, slippageBps: 50, nowSeconds: 1_800_000_000});

function wallet({account = creator, chain = '0x1237', hash = '0x' + 'ab'.repeat(32), failCall = false} = {}) {
  const calls = [];
  return {calls, async request({method, params}) {
    calls.push(method);
    if (method === 'eth_chainId') return chain;
    if (method === 'eth_accounts') return [account];
    if (method === 'eth_call') { if (failCall) throw new Error('execution reverted'); return '0x'; }
    if (method === 'eth_sendTransaction') return hash;
    throw new Error('unexpected ' + method);
  }};
}

test('exactly one wallet prompt, journal written before it', async () => {
  const w = wallet(), order = [];
  const journal = {markStarted: async () => { order.push('started:' + w.calls.filter(c => c === 'eth_sendTransaction').length); }, markSent: async () => order.push('sent')};
  const hash = await submitOneApprovalLaunch(w, plan, creator, journal);
  assert.equal(hash, '0x' + 'ab'.repeat(32));
  assert.equal(w.calls.filter(c => c === 'eth_sendTransaction').length, 1);
  for (const forbidden of ['personal_sign', 'eth_signTypedData_v4', 'wallet_sendCalls', 'eth_sign']) assert.ok(!w.calls.includes(forbidden));
  assert.deepEqual(order, ['started:0', 'sent']);
});

test('a failing simulation, wrong chain or changed account never reaches the wallet prompt', async () => {
  const journal = {markStarted: async () => assert.fail('journal must not start'), markSent: async () => {}};
  for (const w of [wallet({failCall: true}), wallet({chain: '0x1'}), wallet({account: '0x3333333333333333333333333333333333333333'})]) {
    await assert.rejects(submitOneApprovalLaunch(w, plan, creator, journal));
    assert.ok(!w.calls.includes('eth_sendTransaction'));
  }
});

test('lost hash is recoverable by launch id and never re-sent', async () => {
  const w = wallet({hash: null});
  const journal = {markStarted: async () => {}, markSent: async () => assert.fail('no hash to record')};
  await assert.rejects(submitOneApprovalLaunch(w, plan, creator, journal), /do not create again/);
  assert.equal(await probeLaunchId(async () => '0x' + '0'.repeat(64), factory, launchId), null);
  assert.equal(await probeLaunchId(async () => '0x' + '0'.repeat(24) + '44'.repeat(20), factory, launchId), '0x' + '44'.repeat(20));
});

test('a session change during the durable write preserves the intent without prompting or rejecting it', async () => {
  for (const change of ['chain', 'account', 'readFailure']) {
    let started = false, sent = 0, rejected = 0;
    const w = wallet();
    const provider = {request: async args => {
      if (started && args.method === 'eth_chainId' && change === 'chain') return '0x1';
      if (started && args.method === 'eth_accounts' && change === 'account') return ['0x' + '33'.repeat(20)];
      if (started && args.method === 'eth_chainId' && change === 'readFailure') throw Object.assign(new Error('session read refused'), {code: 4001});
      return w.request(args);
    }};
    const journal = {markStarted: async () => {started = true;}, markSent: async () => {sent++;}, markRejected: async () => {rejected++;}};
    await assert.rejects(submitOneApprovalLaunch(provider, plan, creator, journal));
    assert.equal(started, true);
    assert.equal(w.calls.includes('eth_sendTransaction'), false);
    assert.equal(sent, 0);
    assert.equal(rejected, 0);
  }
});
