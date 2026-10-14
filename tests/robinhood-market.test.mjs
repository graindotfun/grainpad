import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUnits18, uintWord, prepareTrade, prepareClaim, submitTransaction, prepareWrap, transactionStatus, address} from '../lib/chain/robinhood-market.ts';
import {readRobinhoodCreateReceipt, receiptOutcome, LAUNCH_CREATED_TOPIC} from '../lib/chain/robinhood-create.ts';
import {fetchRobinhoodReceipt} from '../lib/chain/robinhood-registration.ts';

const owner = '0x' + '11'.repeat(20), quote = '0x' + '22'.repeat(20), curve = '0x' + '33'.repeat(20), token = '0x' + '44'.repeat(20);
const hash = '0x' + 'aa'.repeat(32), launchId = '0x' + 'bb'.repeat(32);
const market = {quote, curve, tokenAddress: token, launchId, block: '0x10', creator: owner, platform: curve, vault: curve};
const encode = values => '0x' + values.map(uintWord).join('');
const rpc = async (method, params) => {
  if (method === 'eth_chainId') return '0xb626';
  const data = params[0].data;
  if (data.startsWith('0xedd6ea76') || data.startsWith('0xf2c963fd')) return encode([1000n, 10n, 20n, 5n, 965n]);
  if (data.startsWith('0x70a08231')) return encode([100000n]);
  if (data.startsWith('0xdd62ed3e')) return encode([0n]);
  if (data.startsWith('0x866d16bf')) return encode([1n]);
  throw new Error('Unexpected read');
};

test('strict decimal amounts never use floating point or overflow uint256', () => {
  assert.equal(parseUnits18('0.000000000000000001'), 1n);
  assert.equal(parseUnits18('1.123456789012345678'), 1123456789012345678n);
  for (const bad of ['0', '-1', '1e3', 'NaN', '1.0000000000000000001', ' 1', '00.1', '9'.repeat(80)]) assert.throws(() => parseUnits18(bad));
  assert.throws(() => uintWord(1n << 256n));
  assert.throws(() => address('0x' + '00'.repeat(20)));
});

test('buy and sell use exact allowances and net sell output after all fee legs', async () => {
  const buy = await prepareTrade(rpc, market, owner, 'buy', 100n, 100);
  assert.equal(buy.output, 1000n); assert.equal(buy.minimum, 990n);
  assert.equal(buy.approval.to, quote);
  assert.equal(buy.approval.data, '0x095ea7b3' + uintWord(BigInt(curve)) + uintWord(100n));
  assert.equal(buy.transaction.data, '0xfc18d034' + launchId.slice(2) + uintWord(100n) + uintWord(990n));
  const sell = await prepareTrade(rpc, market, owner, 'sell', 100n, 100);
  assert.equal(sell.output, 965n); assert.equal(sell.minimum, 955n);
  assert.equal(sell.approval.to, token);
  assert.equal(sell.transaction.value, '0x0');
  for (const bps of [-1, 501, 0.1, NaN]) await assert.rejects(prepareTrade(rpc, market, owner, 'buy', 1n, bps), /Slippage/);
  await assert.rejects(prepareTrade(rpc, market, owner, 'buy', 100001n, 100), /Insufficient/);
  await assert.rejects(prepareClaim(rpc, market, token, 1), /payee/);
});

test('wrong network and changed account never reach sendTransaction', async () => {
  const tx = prepareWrap(owner, 1n);
  for (const mode of ['chain', 'account', 'duringSimulation']) {
    let sends = 0, reads = 0;
    const provider = {async request({method}) {
      if (method === 'eth_chainId') return mode === 'chain' ? '0x1237' : '0xb626';
      if (method === 'eth_accounts') return [mode === 'account' || (mode === 'duringSimulation' && ++reads > 1) ? token : owner];
      if (method === 'eth_call') return '0x';
      if (method === 'eth_sendTransaction') { sends++; return hash; }
    }};
    await assert.rejects(submitTransaction(provider, tx), /testnet|account changed/);
    assert.equal(sends, 0);
  }
});

test('receipt outage preserves a submitted hash and wrong emitter cannot identify a token', async () => {
  const outcome = await readRobinhoodCreateReceipt({request: async () => {throw new Error('offline');}}, hash, {launchId, attempts: 1});
  assert.equal(outcome.state, 'pending'); assert.equal(outcome.transactionHash, hash);
  const receipt = {transactionHash: hash, to: curve, status: '0x1', logs: [{address: token, topics: [LAUNCH_CREATED_TOPIC, launchId, '0x' + uintWord(BigInt(token))]}]};
  assert.equal(receiptOutcome(hash, receipt, launchId, curve).state, 'failure');
});

test('registration waits for confirmations and rejects a reorg', async () => {
  for (const mode of ['young', 'reorg', 'wrongChain']) {
    const fetcher = async (_url, init) => {
      const {method} = JSON.parse(init.body);
      const result = {
        eth_chainId: mode === 'wrongChain' ? '0x1237' : '0xb626',
        eth_getTransactionReceipt: {blockNumber: '0x10', blockHash: hash},
        eth_blockNumber: mode === 'young' ? '0x11' : '0x12',
        eth_getBlockByNumber: {hash: launchId},
      }[method];
      return {ok: true, json: async () => ({result})};
    };
    await assert.rejects(fetchRobinhoodReceipt(hash, fetcher), /confirmations|canonical|testnet/);
  }
});

test('transaction polling rejects a mismatched hash', async () => {
  await assert.rejects(transactionStatus(async method => method === 'eth_chainId' ? '0xb626' : {transactionHash: launchId, status: '0x1'}, hash), /hash differs/);
});
