import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ui = read('components/robinhood-mainnet-launch-v2.tsx');
const client = read('lib/chain/one-approval-launch-client.ts');

test('the V2 screen can only raise the single launch transaction', () => {
  for (const source of [ui, client]) for (const forbidden of ['signTypedData', 'personal_sign', 'eth_sign"', 'wallet_sendCalls', 'eth_signTransaction'])
    assert.ok(!source.includes(forbidden), forbidden);
  assert.equal((ui.match(/submitOneApprovalLaunch\(/g) || []).length, 1);
  assert.equal((client.match(/method: "eth_sendTransaction"/g) || []).length, 1);
  assert.ok(!/eth_sendTransaction/.test(ui), 'the component never talks to the wallet send method directly');
});

test('metadata is prepared and hash-checked before the wallet is asked', () => {
  const prepare = ui.indexOf('/api/robinhood/mainnet/prepare'), compare = ui.indexOf('prepared.metadataHash !== plan.metadataHash'), submit = ui.indexOf('await submitOneApprovalLaunch(');
  assert.ok(prepare > 0 && compare > prepare && submit > compare);
});

test('review shows amount, fees, slippage, minimum tokens and atomic revert before approval', () => {
  for (const text of ['You send', 'Fees', 'Expected tokens', 'Minimum tokens', 'slippage', 'Everything reverts together', 'ten confirmations', '1 wallet transaction'])
    assert.ok(ui.includes(text), text);
});

test('progress uses the five required stages and recovery never offers a second create', () => {
  for (const text of ['Submitted', 'Created on-chain', 'Metadata verified', 'Awaiting Monero confirmations', 'Trading available'])
    assert.ok(ui.includes(text), text);
  assert.ok(ui.includes('{!entry && <Button className="primary-action"'), 'the Launch button disappears once a journal entry exists');
  assert.ok(ui.includes('probeLaunchId') && ui.includes('recoverCreationTransaction'));
  assert.ok(ui.includes('Do not create this launch again'));
});

test('existing launch screen, draft keys and stylesheets are untouched by this flow', () => {
  assert.ok(!/\.css/.test(ui.replace(/import "@\/app\/(launch-modes|robinhood-launch)\.css";/g, '')), 'no new stylesheet imports');
  const journal = read('lib/chain/one-approval-launch-journal.ts');
  assert.ok(journal.includes('grainpad:rh-v2:launch:') && !journal.includes(':create:'));
});

test('the page is closed while the V2 factory is unpinned', () => {
  const profile = read('lib/chain/robinhood-mainnet-v2.ts');
  assert.match(profile, /ROBINHOOD_MAINNET_V2_FACTORY_ADDRESS: string \| null = null/);
  assert.match(profile, /ROBINHOOD_MAINNET_V2_DEPLOYMENT_BLOCK: bigint \| null = null/);
  assert.ok(ui.includes('One-approval launching is not yet available.'));
});

test('recovery controls follow the safety rules (source-level guards; behavior is covered by the browser QA script)', () => {
  const journal = read('lib/chain/one-approval-launch-journal.ts');
  assert.ok(ui.includes('proveNothingSent') && ui.includes('browserJournalLock') && ui.includes('recentCreatorLaunches'), 'nonce proof, cross-tab lock and on-chain recent-launch probe are wired');
  assert.ok(!ui.includes('eth_getTransactionCount') && !journal.includes('startNonce'), 'a node-local pending nonce is never used as proof');
  assert.ok(ui.includes('verifyCreationTransaction') && (ui.match(/verifyCreationTransaction\(/g) ?? []).length >= 3, 'recovered, pasted and adopted hashes are verified');
  assert.ok((ui.match(/\.clear\(\{launchId: entry\.launchId, transactionHash/g) ?? []).length >= 3, 'every clear is compare-and-delete on launch id and hash');
  assert.ok(ui.includes('assertChain(rpc, BigInt(profile.chainId))') && ui.includes('proveNothingSent(rpc, entry, saved.factory, LAUNCH_CREATED_TOPIC, BigInt(saved.chainId))') && ui.includes('sessionRef.current?.account !== session.account'), 'clearing re-checks chain and account');
  assert.ok(ui.includes('!entry.transactionHash && !conflict'), 'no recovery or clear controls while records conflict');
  assert.ok(ui.includes('applyJournal') && ui.includes('seenAccount'), 'progress resets on journal and wallet change');
  assert.ok(!/probeLaunchId\([^)]*\)\s*\)\s*\{?\s*await createLaunchJournal/.test(ui), 'a null probe alone never clears');
  assert.ok(/code === 4001/.test(client) && !/message[^\n]*reject/i.test(client.split('userRejected')[1] ?? ''), 'only the numeric EIP-1193 code releases an entry');
  assert.ok(ui.includes('status.facts.transactionHash !== entry.transactionHash') || ui.includes('status.facts.transactionHash === entry.transactionHash'), 'revert reset is matched to the journal transaction');
  assert.ok(journal.includes('Fails CLOSED') || journal.includes('fails CLOSED'), 'no Web Locks means no launch');
  assert.ok(ui.includes('LaunchNetworkChip') && ui.includes('LaunchTokenPreviewCard'), 'existing network badge and preview card are kept');
});
