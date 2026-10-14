import test from 'node:test';
import assert from 'node:assert/strict';
import { EVM_NETWORK_TEMPLATES, validateEvmNetworkManifest, getEvmNetworkTemplate, evmChainNamespace,
  evmTokenIdentity, getEvmOnboardingPlan, requireExecutableEvmNetwork, validateEvmNetworkCandidates } from '../lib/chain/evm-network-manifest.ts';

const candidate = () => structuredClone(getEvmNetworkTemplate('base'));
const pin = number => ({ address: `0x${number.toString(16).padStart(40,'0')}`, runtimeCodeHash: `0x${'a'.repeat(64)}`, sourceCommit: 'b'.repeat(40) });
function completeCandidate() {
  const value = candidate();
  value.deployment = { sourceCommit: 'b'.repeat(40), contracts: Object.fromEntries(['factory','curve','vault','wrappedNative','dexFactory','positionManager','router','quoter'].map((key,index) => [key,pin(index+1)])) };
  value.platformRecipient = pin(9).address;
  value.dexPolicy = {adapter:'uniswap-v3',poolFeePips:10000,tickSpacing:200};
  value.feePolicy = { platformBps: 40, creatorBps: 60, tradeBps: 0, approvalId: 'test-only-untrusted-id' };
  value.economics = { totalSupply:'1000', saleInventory:'800', liquidityReserve:'200', virtualQuote:'10', virtualToken:'200', graduationQuote:'40', approvalId: 'test-only-untrusted-id' };
  return value;
}

test('official templates are distinct mainnets, require Monero and inherit no RH policy or address', () => {
  assert.deepEqual(EVM_NETWORK_TEMPLATES.map(value => [value.slug,value.chainId,value.nativeCurrency.symbol]), [['base',8453,'ETH'],['ethereum',1,'ETH'],['bnb',56,'BNB']]);
  for (const manifest of EVM_NETWORK_TEMPLATES) {
    assert.equal(manifest.moneroRegistration,'required');
    assert.equal(manifest.deployment,null);
    assert.equal(manifest.feePolicy,null);
    assert.equal(manifest.economics,null);
    assert.throws(() => requireExecutableEvmNetwork(manifest.slug), /incomplete/);
    assert.throws(() => { manifest.chainId = 4663; }, TypeError);
    assert.throws(() => { manifest.nativeCurrency.symbol = 'SOL'; }, TypeError);
    assert.throws(() => manifest.officialSources.push('https://example.com'), TypeError);
  }
});

test('untrusted configuration cannot enable execution even with syntactically complete pins', () => {
  const value = completeCandidate();
  assert.equal(getEvmOnboardingPlan(value).configurationComplete,true);
  assert.equal(getEvmOnboardingPlan(value).executable,false);
  assert.ok(getEvmOnboardingPlan(value).steps.includes('verify-monero-registration'));
  assert.ok(getEvmOnboardingPlan(value).steps.includes('review-adapter'));
  assert.throws(() => validateEvmNetworkManifest({...value,enabled:true}));
  assert.throws(() => validateEvmNetworkManifest({...value,moneroRegistration:'optional'}));
  assert.throws(() => requireExecutableEvmNetwork('unknown'), /Unknown/);
});

test('strict schema rejects ambiguous networks, secret URLs and incomplete contract identities', () => {
  for (const patch of [{chainId:0},{chainId:1.5},{chainId:Number.MAX_SAFE_INTEGER+1},{family:'solana'},
    {rpcSecretName:'https://rpc.example/key'},{officialSources:[['https://', 'user:pass', '@example.com'].join('')]},
    {officialSources:['https://example.com?apiKey=sensitive']},{officialSources:['http://example.com']},
    {slug:'../base'}, {rpcUrl:'https://example.com/key'}]) assert.throws(() => validateEvmNetworkManifest({...candidate(),...patch}));
  for (const patch of [{address:'0x'+'0'.repeat(40)},{runtimeCodeHash:'0x'+'0'.repeat(64)},{sourceCommit:'main'}]) {
    const value=completeCandidate(); Object.assign(value.deployment.contracts.factory,patch);
    assert.throws(() => validateEvmNetworkManifest(value));
  }
  const value=completeCandidate(); delete value.deployment.contracts.router;
  assert.throws(() => validateEvmNetworkManifest(value));
});

test('candidate economics reject malformed uint256, inconsistent inventory and confiscatory fees', () => {
  for (const amount of ['-1','1.5','0','01','hello',(1n<<256n).toString(),'1'.repeat(10000)]) {
    const value=completeCandidate(); value.economics.totalSupply=amount;
    assert.throws(() => validateEvmNetworkManifest(value));
  }
  const value=completeCandidate(); value.economics.saleInventory='999';
  assert.throws(() => validateEvmNetworkManifest(value));
  value.economics.saleInventory='800'; value.feePolicy.platformBps=9940;
  assert.throws(() => validateEvmNetworkManifest(value));
});

test('asset identity separates identical addresses on every chain and normalizes hex case', () => {
  const token='0x'+'aB'.repeat(20);
  assert.equal(evmTokenIdentity(8453,token), `eip155:8453:${token.toLowerCase()}`);
  assert.notEqual(evmTokenIdentity(1,token),evmTokenIdentity(56,token));
  assert.notEqual(evmTokenIdentity(4663,token),evmTokenIdentity(46630,token));
  assert.throws(() => evmChainNamespace(0));
  assert.throws(() => evmTokenIdentity(1,'../token'));
});

test('batch candidate validation rejects chain or slug aliases and planning reports missing policy', () => {
  assert.equal(validateEvmNetworkCandidates([...EVM_NETWORK_TEMPLATES]).length,3);
  assert.throws(() => validateEvmNetworkCandidates([candidate(),{...candidate(),slug:'alias'}]), /Duplicate/);
  assert.throws(() => validateEvmNetworkCandidates([candidate(),{...candidate(),chainId:999}]), /Duplicate/);
  const plan=getEvmOnboardingPlan(candidate());
  assert.equal(plan.configurationComplete,false);
  assert.equal(plan.executable,false);
  assert.deepEqual(plan.steps,['approve-policy','verify-contracts','configure-rpc','verify-finalized-history','verify-monero-registration','review-adapter','release-source']);
});
