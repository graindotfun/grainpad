import {createRobinhoodLaunchAdapter} from "../lib/chain/robinhood-adapter.ts";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NETWORKS} from '../lib/site-config.ts';
import {launchRecordKey} from '../lib/launch-registration.mjs';
import {
  LAUNCH_NETWORKS, LAUNCH_OPERATIONS, LaunchNetworkPending, UnknownLaunchNetworkError,
  createSolanaLaunchAdapter, existingLaunchRecordKey, launchAdapter,
  sameToken, sameTransaction, tokenRef, transactionRef,
} from '../lib/chain/index.ts';

const mint = 'CzvYJXb3e4KtTd2xZviV9nMUSAC1jary4wLY4cVhwgrn';
const signature = '1'.repeat(88);
const evmToken = '0x52908400098527886E0F7030069857D2E4169EE7';
const evmHash = `0x${'ab'.repeat(32)}`;

test('solana network identity keeps the stored cluster name and genesis', () => {
  const mainnet = LAUNCH_NETWORKS['solana:mainnet-beta'];
  assert.equal(mainnet.recordNetwork, 'mainnet-beta');
  assert.equal(mainnet.chainId, null);
  assert.equal(mainnet.genesis, NETWORKS['mainnet-beta'].genesis);
  assert.deepEqual(Object.keys(NETWORKS), ['devnet', 'mainnet-beta']);
  assert.equal(existingLaunchRecordKey('solana:mainnet-beta', mint), launchRecordKey('mainnet-beta', mint));
  assert.equal(existingLaunchRecordKey('solana:devnet', mint), launchRecordKey('devnet', mint));
});

test('the same mint text on two clusters is not the same token', () => {
  const mainnet = tokenRef('solana:mainnet-beta', mint);
  const devnet = tokenRef('solana:devnet', mint);
  assert.equal(mainnet.tokenAddress, devnet.tokenAddress);
  assert.equal(sameToken(mainnet, devnet), false);
  assert.equal(sameToken(mainnet, tokenRef('solana:mainnet-beta', mint)), true);
});

test('robinhood addresses cannot alias a solana mint or signature', () => {
  const robinhood = LAUNCH_NETWORKS['robinhood:testnet'];
  assert.equal(robinhood.family, 'evm');
  assert.equal(robinhood.recordNetwork, null);
  assert.equal(robinhood.chainId, 46630);
  assert.equal(robinhood.rpcUrl, 'https://rpc.testnet.chain.robinhood.com');
  assert.equal(robinhood.genesis, null);
  assert.equal(robinhood.execution, 'planned');
  assert.throws(() => existingLaunchRecordKey('robinhood:testnet', evmToken), /no launch records/);
  assert.throws(() => tokenRef('solana:mainnet-beta', evmToken), /base58 account/);
  assert.throws(() => tokenRef('robinhood:testnet', mint), /20-byte hex/);
  assert.throws(() => transactionRef('solana:mainnet-beta', evmHash), /base58 signature/);
  assert.throws(() => transactionRef('robinhood:testnet', signature), /32-byte hex/);
  const token = tokenRef('robinhood:testnet', evmToken);
  const tx = transactionRef('robinhood:testnet', evmHash.toUpperCase().replace('0X', '0x'));
  assert.equal(token.tokenAddress, evmToken.toLowerCase());
  assert.equal(tx.transactionHash, evmHash);
  assert.equal(sameTransaction(tx, transactionRef('robinhood:testnet', evmHash)), true);
});

test('registry selects an adapter by network id', () => {
  const solana = launchAdapter('solana:mainnet-beta');
  const devnet = launchAdapter('solana:devnet');
  const robinhood = launchAdapter('robinhood:testnet');
  assert.equal(solana.executionReady, true);
  assert.equal(solana.network.recordNetwork, 'mainnet-beta');
  assert.equal(devnet.executionReady, false);
  assert.equal(robinhood.executionReady, true);
  assert.equal(robinhood.network.id, 'robinhood:testnet');
  assert.throws(() => launchAdapter('ethereum:mainnet'), UnknownLaunchNetworkError);
});

test('an unconfigured robinhood adapter and devnet refuse execution', async () => {
  const robinhood = createRobinhoodLaunchAdapter({factory: null});
  const devnet = launchAdapter('solana:devnet');
  for (const operation of LAUNCH_OPERATIONS) {
    if (operation === 'createToken') continue;
    await assert.rejects(robinhood[operation](), (error) => {
      assert.ok(error instanceof LaunchNetworkPending);
      assert.equal(error.operation, operation);
      assert.equal(error.stage, "deployment");
      assert.equal(/https?:\/\//.test(error.message), false);
      return true;
    });
    await assert.rejects(devnet[operation](), (error) => {
      assert.ok(error instanceof LaunchNetworkPending);
      assert.equal(error.stage, 'closed');
      assert.match(error.message, /solana:mainnet-beta/);
      return true;
    });
  }
});

test('solana adapter forwards the existing calls and adds only the buy or sell side', async () => {
  const calls = [];
  const adapter = createSolanaLaunchAdapter({
    async launch() {
      return {
        async prepareLaunch(input) { calls.push(['prepareLaunch', input]); return 'prepared-launch'; },
        async resolveSubmitted(signature) { calls.push(['resolveSubmitted', signature]); return 'finalized'; },
      };
    },
    async trade() {
      return {async prepareTrade(...args) { calls.push(['prepareTrade', args]); return 'prepared-trade'; }};
    },
    async market() {
      return {async serverMarket(...args) { calls.push(['serverMarket', args]); return 'market'; }};
    },
    async fees() {
      return {
        async readFees(...args) { calls.push(['readFees', args]); return 'fees'; },
        async prepareFeeClaim(...args) { calls.push(['prepareFeeClaim', args]); return 'claim'; },
      };
    },
  });
  const launchInput = {network: 'mainnet-beta', owner: 'owner'};
  assert.equal(await adapter.createToken(launchInput), 'prepared-launch');
  assert.equal(await adapter.buy('owner', mint, '1', '1'), 'prepared-trade');
  assert.equal(await adapter.sell('owner', mint, '2', '1'), 'prepared-trade');
  assert.equal(await adapter.getQuote('owner', mint, 'buy', '3', '0.5'), 'prepared-trade');
  assert.equal(await adapter.getTransaction(signature), 'finalized');
  assert.equal(await adapter.getMarket(mint), 'market');
  assert.equal(await adapter.getCreatorRewards('owner', 'SOL'), 'fees');
  assert.equal(await adapter.claimCreatorRewards('owner', 'creator', '0.02', 'wXMR'), 'claim');
  assert.deepEqual(calls, [
    ['prepareLaunch', launchInput],
    ['prepareTrade', ['owner', mint, 'buy', '1', '1']],
    ['prepareTrade', ['owner', mint, 'sell', '2', '1']],
    ['prepareTrade', ['owner', mint, 'buy', '3', '0.5']],
    ['resolveSubmitted', signature],
    ['serverMarket', [mint]],
    ['readFees', ['owner', 'SOL']],
    ['prepareFeeClaim', ['owner', 'creator', '0.02', 'wXMR']],
  ]);
});

test('bound export names still exist and the robinhood seam has no endpoint', () => {
  const root = new URL('..', import.meta.url);
  const read = (path) => readFileSync(new URL(path, root), 'utf8');
  const bindings = {
    'lib/launch.ts': ['export async function prepareLaunch', 'export async function resolveSubmitted'],
    'lib/trade.ts': ['export async function prepareTrade'],
    'lib/server-market.ts': ['export async function serverMarket'],
    'lib/fees.ts': ['export async function readFees', 'export async function prepareFeeClaim'],
    'lib/graduated-fees.ts': ['export async function prepareGraduatedClaim'],
    'lib/event-history.mjs': ['export async function creatorFeeTotals'],
  };
  for (const [path, snippets] of Object.entries(bindings)) {
    const source = read(path);
    for (const snippet of snippets) assert.equal(source.includes(snippet), true, `${path} ${snippet}`);
  }
  const robinhood = read('lib/chain/robinhood-adapter.ts');
  assert.equal(/https?:\/\//.test(robinhood), false);
  assert.equal(robinhood.includes('@solana'), false);
  assert.equal(robinhood.includes('eth_sendTransaction'), false);
  assert.equal(robinhood.includes('buildRobinhoodCreateTransaction'), true);
  const solana = read('lib/chain/solana-adapter.ts');
  assert.equal(solana.includes('import("../launch.ts")'), true);
  assert.equal(solana.includes('import("../trade.ts")'), true);
  assert.equal(solana.includes('import("../server-market.ts")'), true);
  assert.equal(solana.includes('import("../fees.ts")'), true);
  assert.equal(solana.includes('prepareTrade(owner as string, tokenAddress as string, "buy"'), true);
  assert.equal(solana.includes('prepareTrade(owner as string, tokenAddress as string, "sell"'), true);
});
