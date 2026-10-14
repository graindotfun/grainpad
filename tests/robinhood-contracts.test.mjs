import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROBINHOOD_CHAIN_TESTNET} from '../lib/chain/robinhood-testnet.ts';

const sources = ['GrainParams.sol', 'GrainFactory.sol', 'GrainCurve.sol', 'GrainFeeVault.sol', 'GrainToken.sol']
  .map(name => readFileSync(new URL(`../contracts/src/${name}`, import.meta.url), 'utf8'));
const params = sources[0];

test('the contract chain id is the published Robinhood testnet id', () => {
  assert.equal(ROBINHOOD_CHAIN_TESTNET.chainId, 46630);
  assert.match(params, new RegExp(`ROBINHOOD_TESTNET_CHAIN_ID = ${ROBINHOOD_CHAIN_TESTNET.chainId};`));
});

test('robinhood contracts keep their own fee parameters', () => {
  const combined = sources.join('\n');
  assert.equal(/import\s+[^;]*fee-policy/.test(combined), false);
  assert.equal(/import\s+[^;]*platform-policy/.test(combined), false);
  assert.equal(combined.includes('rpc.mainnet'), false);
  assert.equal(combined.includes('Ownable'), false);
  assert.equal(combined.includes('UUPS'), false);
  assert.match(params, /not the Solana fee policy/);
  assert.match(params, /MAX_SINGLE_FEE_BPS = 1_000;/);
  assert.match(params, /MAX_TOTAL_FEE_BPS = 1_500;/);
});
