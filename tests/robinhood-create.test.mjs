import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {launchAdapter, LaunchNetworkPending, LAUNCH_OPERATIONS} from '../lib/chain/index.ts';
import {createRobinhoodLaunchAdapter} from "../lib/chain/robinhood-adapter.ts";
import {ROBINHOOD_FACTORY_ADDRESS} from '../lib/chain/robinhood-factory.ts';
import {
  GRAIN_CREATE_SELECTOR,
  LAUNCH_CREATED_TOPIC,
  buildRobinhoodCreateTransaction,
  openCreateWallet,
  readRobinhoodCreateReceipt,
  submitRobinhoodCreate,
} from '../lib/chain/robinhood-create.ts';

const factory = '0x52908400098527886E0F7030069857D2E4169EE7';
const creator = '0x1111111111111111111111111111111111111111';
const token = '0x2222222222222222222222222222222222222222';
const launchId = `0x${'0'.repeat(63)}1`;
const hash = `0x${'ab'.repeat(32)}`;
const grainTestCall = '0x30f990cb000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000a477261696e20546573740000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000024754000000000000000000000000000000000000000000000000000000000000';

function input(overrides = {}) {
  return {factory, name: 'Grain Test', symbol: 'GT', launchId, ...overrides};
}

test('factory create calldata matches the GrainFactory signature', () => {
  const tx = buildRobinhoodCreateTransaction(input());
  assert.equal(tx.networkId, 'robinhood:testnet');
  assert.equal(tx.chainId, 46630);
  assert.equal(tx.to, factory.toLowerCase());
  assert.equal(tx.value, '0x0');
  assert.equal(tx.data, grainTestCall);
  assert.equal(tx.data.startsWith(GRAIN_CREATE_SELECTOR), true);
});

test('create validation follows the factory byte limits', () => {
  assert.throws(() => buildRobinhoodCreateTransaction(input({name: ''})), /1 to 32 bytes/);
  assert.throws(() => buildRobinhoodCreateTransaction(input({name: 'a'.repeat(33)})), /1 to 32 bytes/);
  assert.equal(buildRobinhoodCreateTransaction(input({name: 'a'.repeat(32)})).to, factory.toLowerCase());
  assert.throws(() => buildRobinhoodCreateTransaction(input({symbol: 'éééééé'})), /1 to 10 bytes/);
  assert.throws(() => buildRobinhoodCreateTransaction(input({symbol: ''})), /1 to 10 bytes/);
  assert.throws(() => buildRobinhoodCreateTransaction(input({launchId: '0x01'})), /32-byte/);
  assert.throws(() => buildRobinhoodCreateTransaction(input({factory: `0x${'0'.repeat(40)}`})), /not deployed/);
  assert.throws(() => buildRobinhoodCreateTransaction(input({factory: 'not-an-address'})), /20-byte hex/);
});

function launchReceipt(status = '0x1') {
  return {
    status,
    logs: [{
      topics: [
        LAUNCH_CREATED_TOPIC,
        launchId,
        `0x${'0'.repeat(24)}${token.slice(2)}`,
        `0x${'0'.repeat(24)}${creator.slice(2)}`,
      ],
    }],
  };
}


test('the deployed factory enables default create while an unconfigured adapter stays closed', async () => {
  assert.equal(ROBINHOOD_FACTORY_ADDRESS, '0x32bd316b25e1a412e5c84583b591b85e079ab807');
  const tx = await launchAdapter('robinhood:testnet').createToken({name: 'Grain Test', symbol: 'GT', launchId});
  assert.equal(tx.to, ROBINHOOD_FACTORY_ADDRESS);
  assert.equal(tx.chainId, 46630);
  const adapter = createRobinhoodLaunchAdapter({factory: null});
  assert.equal(adapter.executionReady, false);
  await assert.rejects(adapter.createToken(input()), /not configured/);
  for (const operation of LAUNCH_OPERATIONS) {
    if (operation === 'createToken') continue;
    await assert.rejects(adapter[operation](), error => {
      assert.ok(error instanceof LaunchNetworkPending);
      assert.equal(error.operation, operation);
      return true;
    });
  }
});

test('solana network selection does not load the EVM wallet', async () => {
  const calls = [];
  const loaders = {
    async solana() { calls.push('solana'); return {walletProviders() { return []; }}; },
    async evm() { calls.push('evm'); return {evmProviders() { return []; }, async connectRobinhoodTestnet() {}}; },
  };
  await assert.rejects(openCreateWallet('solana:mainnet-beta', loaders), /launch screen/);
  await assert.rejects(openCreateWallet('solana:devnet', loaders), /devnet/);
  assert.deepEqual(calls, []);
  const choices = await openCreateWallet('robinhood:testnet', loaders);
  assert.equal(choices.stack, 'evm');
  assert.deepEqual(calls, ['evm']);
});

test('wallet receipt states stay on the create hash', async () => {
  const methods = [];
  const provider = {
    async request({method, params}) {
      methods.push(method);
      if (method === 'eth_chainId') return '0xb626';
      if (method === 'eth_sendTransaction') {
        assert.equal(params[0].chainId, '0xb626');
        assert.equal(params[0].to, factory.toLowerCase());
        assert.equal(params[0].from, creator);
        assert.equal(params[0].data, grainTestCall);
        assert.equal(params[0].value, '0x0');
        return hash.toUpperCase();
      }
      if (method === 'eth_accounts') return [creator];
      if (method === 'eth_call') return '0x';
      if (method === 'eth_getTransactionReceipt') return null;
      throw new Error(method);
    },
  };
  const tx = buildRobinhoodCreateTransaction(input());
  const pendingResult = await submitRobinhoodCreate(provider, tx, creator, {attempts: 1});
  assert.equal(pendingResult.state, 'pending');
  assert.equal(pendingResult.transactionHash, hash);
  assert.equal(pendingResult.launchId, launchId);
  assert.equal(pendingResult.tokenAddress, null);
  assert.deepEqual(methods, ['eth_chainId', 'eth_accounts', 'eth_call', 'eth_chainId', 'eth_accounts', 'eth_sendTransaction', 'eth_chainId', 'eth_getTransactionReceipt']);

  let reads = 0;
  const waited = await readRobinhoodCreateReceipt({
    async request() {
      reads += 1;
      return reads === 1 ? null : launchReceipt();
    },
  }, hash, {attempts: 3, pause: async () => {}, launchId});
  assert.equal(reads, 2);
  assert.equal(waited.state, 'success');
  assert.equal(waited.tokenAddress, token);
  assert.equal(waited.launchId, launchId);
  assert.equal(waited.transactionHash, hash);

  const reverted = await readRobinhoodCreateReceipt({
    async request() { return {status: '0x0', logs: []}; },
  }, hash, {attempts: 1, launchId});
  assert.equal(reverted.state, 'failure');
  assert.equal(reverted.transactionHash, hash);
  assert.equal(reverted.tokenAddress, null);
  assert.match(reverted.reason, /reverted/);

  const missing = await readRobinhoodCreateReceipt({
    async request() { return {status: '0x1', logs: []}; },
  }, hash, {attempts: 1, launchId});
  assert.equal(missing.state, 'failure');
  assert.match(missing.reason, /new token/);
});

test('a wrong chain or wallet rejection does not invent a receipt', async () => {
  const tx = buildRobinhoodCreateTransaction(input());
  const wrongChain = [];
  const refused = await submitRobinhoodCreate({
    async request({method}) {
      wrongChain.push(method);
      if (method === 'eth_chainId') return '0x1237';
      throw new Error(method);
    },
  }, tx, creator);
  assert.equal(refused.state, 'failure');
  assert.equal(refused.transactionHash, null);
  assert.deepEqual(wrongChain, ['eth_chainId']);

  const rejected = await submitRobinhoodCreate({
    async request({method}) {
      if (method === 'eth_chainId') return '0xb626';
      const error = new Error('rejected');
      error.code = 4001;
      throw error;
    },
  }, tx, creator);
  assert.equal(rejected.state, 'failure');
  assert.equal(rejected.transactionHash, null);
  assert.match(rejected.reason, /rejected/);
});

test('the create screen does not import the Solana launch path', () => {
  const root = new URL('..', import.meta.url);
  const read = (path) => readFileSync(new URL(path, root), 'utf8');
  const screen = read('components/robinhood-create.tsx');
  const page = read('app/launch/robinhood/page.tsx');
  const builder = read('lib/chain/robinhood-create.ts');
  const combined = `${screen}\n${page}\n${builder}`;
  for (const snippet of ['launch-workspace', 'lib/launch', 'fee-policy', 'platform-policy', 'walletProviders(', 'eth_sendRawTransaction']) {
    assert.equal(combined.includes(snippet), false, snippet);
  }
  assert.equal(screen.includes('openCreateWallet("robinhood:testnet")'), true);
  assert.equal(screen.includes('createRobinhoodLaunchAdapter()'), true);
  assert.equal(screen.includes('The factory address is not configured'), true);
  assert.equal(screen.includes('Factory address'), false);
  assert.equal(screen.includes('registry.ts'), false);
  assert.equal(page.includes('RobinhoodCreate'), true);
  assert.equal(builder.includes('rpc.mainnet'), false);
  assert.equal(builder.includes('fetch('), false);
});
