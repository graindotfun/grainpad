import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {CHAINS,chainOfNetwork,recordNetworkId,CHAIN_RECORD_NETWORKS} from '../lib/chain-display.ts';
import {LAUNCH_NETWORKS} from '../lib/chain/networks.ts';
test('every chain ships its full-colour official logo from /public',()=>{
 for(const chain of Object.values(CHAINS)){
  assert.ok(chain.logo,chain.key+' has a logo');
  const file=new URL('../public'+chain.logo,import.meta.url);assert.ok(existsSync(file),chain.logo);
  const svg=readFileSync(file,'utf8');
  assert.ok(/<svg[\s>]/.test(svg)&&!/<script|onload=|href="https?:/i.test(svg),'inert svg');
  // Brand colours must be present: a gradient or a saturated fill, not a single grey.
  assert.ok(/linearGradient|fill:\s*#(?!([0-9a-f])\1\1)[0-9a-f]{3,6}|fill="#(?!([0-9a-f])\2\2)/i.test(svg),chain.key+' is coloured');
 }
});
test('chains map from canonical network ids and record networks',()=>{
 assert.equal(chainOfNetwork('solana:mainnet-beta'),'solana');assert.equal(chainOfNetwork('robinhood:testnet'),'robinhood');assert.equal(chainOfNetwork(null),null);
 assert.equal(recordNetworkId({network:'mainnet-beta'}),'solana:mainnet-beta');assert.equal(recordNetworkId({networkId:'robinhood:testnet'}),'robinhood:testnet');assert.equal(recordNetworkId({network:'x'}),null);
 for(const [chain,networks] of Object.entries(CHAIN_RECORD_NETWORKS))for(const n of networks)assert.ok(Object.hasOwn(LAUNCH_NETWORKS,n)||n==='mainnet-beta'||n==='robinhood:mainnet',n+' is a known network');
});
