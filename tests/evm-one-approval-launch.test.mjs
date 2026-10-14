import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTokenMetadata, canonicalTokenMetadataBytes, tokenMetadataHash, tokenMetadataURI, registrationDigest,
  encodeCreateAndLaunch, createAndLaunchSelector, previewCreatorBuy, planOneApprovalLaunch, verifyOneApprovalReceipt, TOPICS, keccakHex,
} from '../lib/chain/evm-one-approval-launch.ts';
import {deriveLaunchProgress, tokenOfCalldata} from '../lib/chain/launch-progress.ts';
import {venueState, priceLabel, valuationCaption} from '../lib/chain/market-venue-state.ts';

const creator = '0x1111111111111111111111111111111111111111';
const factory = '0x2222222222222222222222222222222222222222';
const launchId = creator + 'ab'.repeat(12);
const profile = {networkId: 'robinhood:mainnet', chainId: 4663, factory, metadataOrigin: 'https://grainpad.fun', metadataPath: '/api/robinhood/mainnet/metadata/{launchId}', assetOrigin: 'https://grainpad.fun', registrationWindowSeconds: 86400};
const input = {name: 'Grain Cat', symbol: 'GCAT', description: 'A cat.', imageSha256: 'cd'.repeat(32), website: 'https://example.org', twitter: 'https://x.com/graincat', telegram: ''};

test('metadata hash is stable, canonical and bound to the launch id', () => {
  const doc = buildTokenMetadata(profile, launchId, input);
  assert.equal(tokenMetadataHash(doc), tokenMetadataHash(structuredClone(doc)));
  assert.equal(doc.image, 'https://grainpad.fun/api/assets/' + 'cd'.repeat(32));
  assert.notEqual(tokenMetadataHash(doc), tokenMetadataHash(buildTokenMetadata(profile, launchId, {...input, description: 'Another.'})));
  assert.equal(keccakHex(canonicalTokenMetadataBytes(doc)), tokenMetadataHash(doc));
  assert.equal(tokenMetadataURI(profile, launchId), 'https://grainpad.fun/api/robinhood/mainnet/metadata/' + launchId);
  assert.throws(() => buildTokenMetadata(profile, launchId, {...input, imageSha256: 'zz'}));
  assert.throws(() => tokenMetadataURI({...profile, metadataOrigin: 'http://grainpad.fun'}, launchId));
});

test('creator buy mirrors the 0.35% + 0.65% policy and shows minimum tokens', () => {
  const p = previewCreatorBuy(10n ** 18n, 100);
  assert.equal(p.platformFee, 35n * 10n ** 14n);
  assert.equal(p.creatorFee, 65n * 10n ** 14n);
  assert.equal(p.effectiveFeeBps, 100);
  assert.equal(p.net + p.totalFee, p.quoteIn);
  // 1,000,000,000 * 0.99 / (1 + 0.99) with 1 WETH virtual quote and 200M + 800M token reserve, floored.
  assert.equal(p.tokensOut, (1_000_000_000n * 10n ** 18n) * p.net / (10n ** 18n + p.net));
  assert.equal(p.minTokensOut, p.tokensOut * 9900n / 10000n);
  assert.equal(p.transactionValue, p.quoteIn);
  assert.throws(() => previewCreatorBuy(0n, 100));
  assert.throws(() => previewCreatorBuy(5n * 10n ** 18n, 100), /graduation/);
  assert.throws(() => previewCreatorBuy(10n ** 18n, 501));
});

test('the plan puts everything in one transaction to the factory', () => {
  const {plan} = planOneApprovalLaunch(profile, {creator, launchId, metadata: input, buyWei: 10n ** 17n, slippageBps: 100, nowSeconds: 1_800_000_000});
  assert.equal(plan.to, factory);
  assert.equal(plan.value, '0x' + (10n ** 17n).toString(16));
  assert.equal(plan.chainId, '0x1237');
  assert.ok(plan.data.startsWith(createAndLaunchSelector()));
  assert.equal(plan.registrationExpiresAt, 1_800_086_400n);
  assert.ok(plan.review.some(l => l.includes('Authorize Monero registration')));
  const noBuy = planOneApprovalLaunch(profile, {creator, launchId, metadata: input, buyWei: 0n, slippageBps: 100, nowSeconds: 1_800_000_000}).plan;
  assert.equal(noBuy.value, '0x0');
  assert.equal(noBuy.creatorBuy, null);
  assert.throws(() => planOneApprovalLaunch(profile, {creator: '0x3333333333333333333333333333333333333333', launchId, metadata: input, buyWei: 0n, slippageBps: 0, nowSeconds: 1}), /different creator/);
});

test('receipt verification accepts only the exact planned events', () => {
  const {plan} = planOneApprovalLaunch(profile, {creator, launchId, metadata: input, buyWei: 10n ** 17n, slippageBps: 100, nowSeconds: 1_800_000_000});
  const pad = a => '0x' + a.slice(2).padStart(64, '0');
  const token = '0x4444444444444444444444444444444444444444';
  const w = n => BigInt(n).toString(16).padStart(64, '0');
  const enc = s => { const b = Buffer.from(s); return w(b.length) + b.toString('hex').padEnd(Math.ceil(b.length / 32) * 64, '0'); };
  const uri = enc(plan.metadataURI);
  const logs = [
    {address: factory, topics: [TOPICS.launchCreated, launchId, pad(token), pad(creator)], data: '0x' + w(64) + w(128) + enc('Grain Cat') + enc('GCAT')},
    {address: factory, topics: [TOPICS.metadataBound, launchId, pad(token), pad(creator)], data: '0x' + w(64) + plan.metadataHash.slice(2) + uri},
    {address: factory, topics: [TOPICS.registrationAuthorized, launchId, pad(creator)], data: '0x' + plan.registrationDigest.slice(2) + w(plan.registrationExpiresAt) + w(0)},
    {address: factory, topics: [TOPICS.creatorBuy, launchId, pad(creator)], data: '0x' + w(10n ** 17n) + w(123)},
  ];
  const expected = {creator, launchId, metadataHash: plan.metadataHash, metadataURI: plan.metadataURI, registrationDigest: plan.registrationDigest, registrationExpiresAt: plan.registrationExpiresAt};
  const ok = verifyOneApprovalReceipt(profile, {status: '0x1', logs}, expected);
  assert.equal(ok.tokenAddress, token);
  assert.equal(ok.creatorBuy.tokensOut, 123n);
  assert.throws(() => verifyOneApprovalReceipt(profile, {status: '0x0', logs}, expected), /did not succeed/);
  assert.throws(() => verifyOneApprovalReceipt(profile, {status: '0x1', logs: logs.slice(0, 2)}, expected), /exactly one/);
  assert.throws(() => verifyOneApprovalReceipt(profile, {status: '0x1', logs}, {...expected, metadataHash: '0x' + '9'.repeat(64)}), /Metadata binding differs/);
  assert.throws(() => verifyOneApprovalReceipt(profile, {status: '0x1', logs: logs.map(l => ({...l, address: '0x' + '5'.repeat(40)}))}, expected), /exactly one/);
  const other = {...logs[2], data: '0x' + '8'.repeat(64) + w(plan.registrationExpiresAt) + w(0)};
  assert.throws(() => verifyOneApprovalReceipt(profile, {status: '0x1', logs: [logs[0], logs[1], other]}, expected), /authorization differs/);
});

test('progress never allows a second create once anything was submitted', () => {
  const base = {transactionHash: null, submissionStarted: false, receipt: 'none', receiptFinalized: false, tokenExistsForLaunchId: false, metadata: 'unknown', moneroAuthorized: false, moneroConfirmations: null, admitted: false};
  assert.equal(deriveLaunchProgress(base).mayCreateAgain, true);
  const lost = deriveLaunchProgress({...base, submissionStarted: true});
  assert.equal(lost.mayCreateAgain, false); assert.equal(lost.nextAutomaticStep, 'probe_launch_id');
  assert.equal(deriveLaunchProgress({...base, transactionHash: '0x1', receipt: 'pending'}).stage, 'submitted');
  assert.equal(deriveLaunchProgress({...base, transactionHash: '0x1', receipt: 'reverted'}).mayCreateAgain, false);
  assert.equal(deriveLaunchProgress({...base, transactionHash: '0x1', receipt: 'reverted', receiptFinalized: true}).mayCreateAgain, true);
  assert.equal(deriveLaunchProgress({...base, transactionHash: '0x1', receipt: 'reverted', receiptFinalized: true, tokenExistsForLaunchId: true}).mayCreateAgain, false);
  const found = deriveLaunchProgress({...base, submissionStarted: true, tokenExistsForLaunchId: true});
  assert.equal(found.stage, 'created');
  const m = {...base, transactionHash: '0x1', receipt: 'success', metadata: 'match'};
  assert.equal(deriveLaunchProgress(m).stage, 'metadata_verified');
  assert.equal(deriveLaunchProgress({...m, moneroAuthorized: true, moneroConfirmations: 4}).detail, 'Monero confirmations 4/10.');
  assert.equal(deriveLaunchProgress({...m, moneroAuthorized: true, moneroConfirmations: 10}).nextAutomaticStep, 'admit');
  assert.equal(deriveLaunchProgress({...m, moneroAuthorized: true, moneroConfirmations: 10}).stage, 'awaiting_monero');
  assert.equal(deriveLaunchProgress({...m, moneroAuthorized: true, moneroConfirmations: 10, admitted: true}).stage, 'trading_available');
  assert.equal(deriveLaunchProgress({...m, metadata: 'mismatch'}).status, 'blocked');
  assert.match(tokenOfCalldata(launchId), /^0x[0-9a-f]{8}[0-9a-f]{64}$/);
});

test('an initialized empty pool is never presented as an observed price', () => {
  const empty = {graduated: false, poolInitialized: true, poolLiquidity: 0n, observedSwaps: 0};
  assert.equal(venueState(empty), 'curve_trading');
  assert.equal(priceLabel(empty).presentAsObserved, false);
  const graduatedEmpty = {...empty, graduated: true};
  assert.equal(venueState(graduatedEmpty), 'pool_initialized_no_liquidity');
  assert.equal(priceLabel(graduatedEmpty).source, 'pool_initial_price');
  const liquidNoTrades = {...graduatedEmpty, poolLiquidity: 5n};
  assert.equal(venueState(liquidNoTrades), 'pool_active');
  assert.equal(priceLabel(liquidNoTrades).presentAsObserved, false);
  const traded = {...liquidNoTrades, observedSwaps: 1};
  assert.equal(priceLabel(traded).presentAsObserved, true);
  assert.match(valuationCaption(empty), /not a traded market cap/);
});

import {storeTokenMetadata, readBoundTokenMetadata, discoverySummary} from '../lib/chain/evm-launch-metadata-store.ts';
import {robinhoodMainnetV2Profile, ROBINHOOD_MAINNET_V2_FACTORY_ADDRESS} from '../lib/chain/robinhood-mainnet-v2.ts';
import {keccak_256} from '@noble/hashes/sha3';

function memoryStore() {
  const m = new Map();
  return {m,
    async get(k) { const v = m.get(k); return v ? {arrayBuffer: async () => v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)} : null; },
    async put(k, v, o) { if (o.onlyIf.etagDoesNotMatch === '*' && m.has(k)) return null; m.set(k, v); return {}; }};
}
const sel = s => Buffer.from(keccak_256(new TextEncoder().encode(s)).slice(0, 4)).toString('hex');

const abiStr = v => { const b = Buffer.from(v); return '0x' + (32).toString(16).padStart(64, '0') + b.length.toString(16).padStart(64, '0') + b.toString('hex').padEnd(Math.ceil(b.length / 32) * 64, '0'); };
test('metadata is served only when its hash AND identity match the chain', async () => {
  assert.equal(ROBINHOOD_MAINNET_V2_FACTORY_ADDRESS, null, 'V2 stays closed until an owner-verified pin');
  assert.equal(robinhoodMainnetV2Profile(ROBINHOOD_MAINNET_V2_FACTORY_ADDRESS), null);
  const store = memoryStore(), doc = buildTokenMetadata(profile, launchId, input);
  const {hash} = await storeTokenMetadata(store, profile, doc);
  // A stranger squatting the same launch id with different content does not displace the real document.
  await storeTokenMetadata(store, profile, buildTokenMetadata(profile, launchId, {...input, description: 'scam'}));
  const token = '0x' + '44'.repeat(20), uri = tokenMetadataURI(profile, launchId);
  const chain = (over = {}) => async (method, [call]) => {
    if (call.data.startsWith('0x' + sel('tokenOf(bytes32)'))) return over.unbound ? '0x' + '0'.repeat(64) : '0x' + token.slice(2).padStart(64, '0');
    if (call.to === token && call.data === '0x' + sel('metadataHash()')) return over.hash ?? hash;
    if (call.data === '0x' + sel('contractURI()')) return abiStr(over.uri ?? uri);
    if (call.data === '0x' + sel('name()')) return abiStr(over.name ?? input.name);
    if (call.data === '0x' + sel('symbol()')) return abiStr(over.symbol ?? input.symbol);
    throw new Error('unexpected call');
  };
  assert.equal(await readBoundTokenMetadata(store, chain({unbound: true}), profile, launchId), null);
  const served = await readBoundTokenMetadata(store, chain(), profile, launchId, {name: input.name, symbol: input.symbol});
  assert.equal(served.hash, hash); assert.equal(served.document.description, 'A cat.');
  // Identity: every mismatch is refused even though the hash matches the stored bytes.
  await assert.rejects(readBoundTokenMetadata(store, chain({uri: 'https://evil.example/m.json'}), profile, launchId), /contractURI/);
  await assert.rejects(readBoundTokenMetadata(store, chain({name: 'Other'}), profile, launchId), /name or symbol differs from the token/);
  await assert.rejects(readBoundTokenMetadata(store, chain({symbol: 'XXXX'}), profile, launchId), /name or symbol differs from the token/);
  await assert.rejects(readBoundTokenMetadata(store, chain(), profile, launchId, {name: 'Finalized Name', symbol: input.symbol}), /differs from the finalized launch/);
  const otherFactory = {...profile, factory: '0x' + '55'.repeat(20)};
  await assert.rejects(readBoundTokenMetadata(store, chain(), otherFactory, launchId), /different network, factory or launch|Metadata names|identity|contractURI|hash/);
  // A document for ANOTHER launch stored under this launch's key (hash matches the bytes) is refused on its identity.
  const foreign = buildTokenMetadata(profile, creator + 'cd'.repeat(12), input), foreignHash = tokenMetadataHash(foreign);
  store.m.set(`evm-launch-metadata/4663/${launchId}/${foreignHash}`, canonicalTokenMetadataBytes(foreign));
  await assert.rejects(readBoundTokenMetadata(store, chain({hash: foreignHash}), profile, launchId), /different network, factory or launch/);
  // Corrupted storage is refused, not served.
  const k = [...store.m.keys()].find(x => x.endsWith(hash));
  store.m.set(k, new TextEncoder().encode('{}'));
  await assert.rejects(readBoundTokenMetadata(store, chain(), profile, launchId), /does not match/);
  await assert.rejects(storeTokenMetadata(store, {...profile, chainId: 1}, doc), /different chain/);
});

test('discovery summary never implies third-party ingestion', () => {
  const lines = discoverySummary({savedByGrainpad: true, boundOnChain: true, servedHashMatches: true, externalConfirmations: {}});
  assert.ok(lines.includes('No external provider has been confirmed'));
  assert.ok(discoverySummary({savedByGrainpad: true, boundOnChain: true, servedHashMatches: true, externalConfirmations: {dexscreener: {evidence: 'url', observedAt: '2026-10-14'}}}).some(l => l.includes('dexscreener')));
});
