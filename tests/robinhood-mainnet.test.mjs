import test from 'node:test';
import assert from 'node:assert/strict';
import {ROBINHOOD_CHAIN_MAINNET, ROBINHOOD_MAINNET_FACTORY_ADDRESS, robinhoodMainnetAddChainParams} from '../lib/chain/robinhood-mainnet.ts';
import {ROBINHOOD_CHAIN_TESTNET} from '../lib/chain/robinhood-testnet.ts';
import {isLaunchNetworkId} from '../lib/chain/networks.ts';

test('mainnet reference cannot reuse the testnet quote, identity or deployed factory', () => {
  assert.equal(ROBINHOOD_CHAIN_MAINNET.chainId, 4663);
  assert.notEqual(ROBINHOOD_CHAIN_MAINNET.chainId, ROBINHOOD_CHAIN_TESTNET.chainId);
  assert.equal(ROBINHOOD_CHAIN_MAINNET.wethAddress, '0x0bd7d308f8e1639fab988df18a8011f41eacad73');
  assert.notEqual(ROBINHOOD_CHAIN_MAINNET.wethAddress, '0x7943e237c7f95da44e0301572d358911207852fa');
  assert.equal(ROBINHOOD_MAINNET_FACTORY_ADDRESS, '0x9dc366555a7a5b6194b2724e974f1b917005deee');
  assert.equal(isLaunchNetworkId('robinhood:mainnet'), false);
  const params = robinhoodMainnetAddChainParams();
  assert.equal(params.chainId, '0x1237');
  assert.deepEqual(params.rpcUrls, ['https://rpc.mainnet.chain.robinhood.com']);
  assert.deepEqual(params.blockExplorerUrls, ['https://robinhoodchain.blockscout.com']);
});

test('owner mainnet split is 35/65 bps and rejects the extra testnet trade fee', async () => {
  const {ROBINHOOD_MAINNET_FEES: fees, assertRobinhoodMainnetFees} = await import('../lib/chain/robinhood-mainnet-fees.ts');
  assert.equal(fees.platformFeeBps+fees.creatorFeeBps+fees.tradeFeeBps,100);
  assert.equal(fees.totalFeeBps,100);
  assert.doesNotThrow(()=>assertRobinhoodMainnetFees(fees));
  for(const candidate of [
    {...fees,platformFeeBps:50,creatorFeeBps:50},
    {...fees,tradeFeeBps:50},
    {platformFeeBps:100,creatorFeeBps:200,tradeFeeBps:50},
    {...fees,creatorFeeBps:65.5},
  ]) assert.throws(()=>assertRobinhoodMainnetFees(candidate),/owner-selected/);
});

test('mainnet fee arithmetic preserves quote reserves and uses no extra trade leg', async () => {
  const {splitRobinhoodMainnetFees: split} = await import('../lib/chain/robinhood-mainnet-fees.ts');
  assert.deepEqual(split(10n**18n), {platformFee:3500000000000000n,creatorFee:6500000000000000n,net:990000000000000000n});
  for(const amount of [0n,1n,99n,100n,10000n,10n**18n,(1n<<256n)-1n]) {
    const fees=split(amount);
    assert.equal(fees.platformFee+fees.creatorFee+fees.net,amount);
    assert.ok(fees.platformFee+fees.creatorFee<=amount/100n);
  }
  assert.throws(()=>split(-1n),/uint256/);
  assert.throws(()=>split(1n<<256n),/uint256/);
});
