import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROBINHOOD_CHAIN_TESTNET, robinhoodAddChainParams, walletChoices} from '../lib/chain/index.ts';
import {connectRobinhoodTestnet, evmProviders} from '../lib/chain/evm-wallet.ts';

const account = '0x52908400098527886E0F7030069857D2E4169EE7';

test('published Robinhood testnet parameters exclude mainnet', () => {
  const params = robinhoodAddChainParams();
  assert.equal(ROBINHOOD_CHAIN_TESTNET.chainId, 46630);
  assert.equal(params.chainId, `0x${(46630).toString(16)}`);
  assert.deepEqual(params.rpcUrls, ['https://rpc.testnet.chain.robinhood.com']);
  assert.equal(params.nativeCurrency.symbol, 'ETH');
  assert.equal(params.nativeCurrency.decimals, 18);
  assert.deepEqual(params.blockExplorerUrls, ['https://explorer.testnet.chain.robinhood.com']);
  const encoded = JSON.stringify(ROBINHOOD_CHAIN_TESTNET) + JSON.stringify(params);
  assert.equal(encoded.includes('mainnet'), false);
  assert.equal(encoded.includes('rpc.mainnet'), false);
  assert.equal(encoded.includes('"4663"'), false);
});

test('selecting a network loads only that wallet stack', async () => {
  const calls = [];
  const loaders = {
    async solana() {
      calls.push('load-solana');
      return {walletProviders() { calls.push('solana'); return [{name: 'Phantom'}]; }};
    },
    async evm() {
      calls.push('load-evm');
      return {
        evmProviders() { calls.push('evm'); return [{name: 'Browser wallet'}]; },
        async connectRobinhoodTestnet() { calls.push('connect'); },
      };
    },
  };
  const solana = await walletChoices('solana:mainnet-beta', loaders);
  assert.equal(solana.stack, 'solana');
  assert.deepEqual(calls, ['load-solana', 'solana']);
  calls.length = 0;
  const devnet = await walletChoices('solana:devnet', loaders);
  assert.equal(devnet.stack, 'solana');
  assert.deepEqual(calls, ['load-solana', 'solana']);
  calls.length = 0;
  const robinhood = await walletChoices('robinhood:testnet', loaders);
  assert.equal(robinhood.stack, 'evm');
  assert.deepEqual(calls, ['load-evm', 'evm']);
  assert.equal(calls.includes('load-solana'), false);
});

test('Robinhood connect switches to testnet and does not add it when the wallet already has it', async () => {
  const methods = [];
  const session = await connectRobinhoodTestnet({
    async request({method, params}) {
      methods.push(method);
      if (method === 'wallet_switchEthereumChain') {
        assert.deepEqual(params, [{chainId: '0xb626'}]);
        return null;
      }
      if (method === 'eth_chainId') return '0xB626';
      if (method === 'eth_requestAccounts') return [account.toUpperCase().replace('0X', '0x')];
      throw new Error(method);
    },
  });
  assert.deepEqual(methods, ['wallet_switchEthereumChain', 'eth_chainId', 'eth_requestAccounts']);
  assert.equal(session.account, account.toLowerCase());
  assert.equal(session.chainId, 46630);
  assert.equal(session.networkId, 'robinhood:testnet');
});

test('a missing testnet is added once, and a different chain is refused', async () => {
  const added = [];
  const session = await connectRobinhoodTestnet({
    async request({method, params}) {
      if (method === 'wallet_switchEthereumChain') {
        const error = new Error('missing');
        error.code = 4902;
        throw error;
      }
      if (method === 'wallet_addEthereumChain') {
        added.push(params[0]);
        return null;
      }
      if (method === 'eth_chainId') return '0xb626';
      if (method === 'eth_requestAccounts') return [account];
      throw new Error(method);
    },
  });
  assert.equal(added.length, 1);
  assert.equal(added[0].chainId, '0xb626');
  assert.deepEqual(added[0].rpcUrls, ['https://rpc.testnet.chain.robinhood.com']);
  assert.equal(session.account, account.toLowerCase());

  await assert.rejects(connectRobinhoodTestnet({
    async request({method}) {
      if (method === 'wallet_switchEthereumChain') return null;
      if (method === 'eth_chainId') return '0x1237';
      throw new Error(method);
    },
  }), /Robinhood Chain testnet/);
});

test('the EVM wallet module does not import the Solana wallet', () => {
  const root = new URL('..', import.meta.url);
  const evm = readFileSync(new URL('lib/chain/evm-wallet.ts', root), 'utf8');
  const session = readFileSync(new URL('lib/chain/wallet-session.ts', root), 'utf8');
  assert.equal(evm.includes('@solana'), false);
  assert.equal(evm.includes('wallet.ts'), false);
  assert.equal(evm.includes('window.solana'), false);
  assert.equal(session.includes('import("../wallet.ts")'), true);
  assert.equal(session.includes('import("./evm-wallet.ts")'), true);
});

test('MetaMask is discoverable and preferred when Phantom owns the default injected slot', () => {
  const request = async () => null;
  const phantom = {request, isPhantom: true};
  const metamask = {request, isMetaMask: true};
  const choices = evmProviders({ethereum: {...phantom, providers: [phantom, metamask]}, phantom: {ethereum: phantom}});
  assert.equal(choices[0].name, 'MetaMask');
  assert.ok(choices.some(choice => choice.name === 'Phantom'));
});

test('explicit account change opens permissions after testnet selection', async () => {
  const methods = [];
  const provider = {async request({method, params}) {
    methods.push(method);
    if (method === 'eth_chainId') return '0xb626';
    if (method === 'wallet_requestPermissions') assert.deepEqual(params, [{eth_accounts: {}}]);
    if (method === 'eth_requestAccounts') return ['0xf405420B031f1a6fBffd0B2f90cc9eD84818dC9A'];
    return null;
  }};
  const connected = await connectRobinhoodTestnet(provider, true);
  assert.equal(connected.account, '0xf405420b031f1a6fbffd0b2f90cc9ed84818dc9a');
  assert.deepEqual(methods, ['wallet_switchEthereumChain', 'eth_chainId', 'wallet_requestPermissions', 'eth_requestAccounts']);
});

test('wallet change subscription updates accounts, invalidates other chains and cleans up', async () => {
  const {watchRobinhoodWallet} = await import('../lib/chain/evm-wallet.ts');
  const listeners = new Map();
  const seen = [];
  const provider = {
    request() { throw Error('subscription must not request wallet access'); },
    on(event, listener) {listeners.set(event, listener);},
    removeListener(event, listener) {assert.equal(listeners.get(event), listener); listeners.delete(event);},
  };
  const cleanup = watchRobinhoodWallet({provider, account: account.toLowerCase(), chainId: 46630, networkId: 'robinhood:testnet'}, next => seen.push(next));
  listeners.get('accountsChanged')(['0xf405420B031f1a6fBffd0B2f90cc9eD84818dC9A']);
  assert.equal(seen[0].account, '0xf405420b031f1a6fbffd0b2f90cc9ed84818dc9a');
  listeners.get('chainChanged')('0xb626');
  assert.equal(seen.length, 1);
  listeners.get('chainChanged')('0x1');
  assert.equal(seen[1], null);
  listeners.get('accountsChanged')([account]);
  assert.equal(seen.length, 2);
  cleanup();
  assert.equal(listeners.size, 0);
});
