import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Exercise the actual component's state, effects, cleanup and rendered controls.
// Wallet, HTTP, clock and browser stores are local fixtures; no wallet request is made.
const source = ts.transpileModule(readFileSync(new URL('../components/robinhood-mainnet-launch-v2.tsx', import.meta.url), 'utf8'), {
 compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022},
}).outputText;
const creator = '0x' + '11'.repeat(20), other = '0x' + '22'.repeat(20);
const hash = '0x' + '33'.repeat(32);
const entry = {creator, launchId: creator + '44'.repeat(12), transactionHash: hash};
function harness({defer = false} = {}) {
 const slots = [], timers = new Map(), exports = {}, calls = [];
 let publishSession;
 let index = 0, dirty = true, tree, watch, confirmations = 2, resolveResponse, rendering = false, scheduled = false, renders = 0;
 const session = account => ({account, provider: {request() { throw Error('Unexpected wallet RPC'); }}});
 const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
 const react = {
  useState(initial) { const i = index++; slots[i] ??= {value: initial}; return [slots[i].value, value => {const next = typeof value === 'function' ? value(slots[i].value) : value; if (!Object.is(next, slots[i].value)) {slots[i].value = next; dirty = true; if (!rendering && !scheduled) {scheduled = true; queueMicrotask(() => {scheduled = false; render();});}}}]; },
  useRef(value) { const i = index++; slots[i] ??= {current: value}; return slots[i]; },
  useCallback(fn, deps) { const i = index++; if (!equal(slots[i]?.deps, deps)) slots[i] = {value: fn, deps}; return slots[i].value; },
  useMemo(fn, deps) { const i = index++; if (!equal(slots[i]?.deps, deps)) slots[i] = {value: fn(), deps}; return slots[i].value; },
  useEffect(fn, deps) { const i = index++; if (!equal(slots[i]?.deps, deps)) slots[i] = {deps, cleanup: slots[i]?.cleanup, pending: fn}; },
 };
 const jsx = (type, props) => ({type, props});
 const status = () => ({token: '0x' + '55'.repeat(20), facts: {moneroConfirmations: confirmations, transactionHash: hash}, progress: {stage: confirmations >= 10 ? 'trading_available' : 'awaiting_monero', detail: 'Confirmations: ' + confirmations}, note: null});
 const modules = {
  react,
  'react/jsx-runtime': {jsx, jsxs: jsx},
  '@/lib/chain/robinhood-mainnet-v2.ts': {robinhoodMainnetV2Profile: () => ({factory: '0x' + '66'.repeat(20), chainId: 4663})},
  './use-site-wallet': {useSharedMainnetWallet:(ref,changed)=>{publishSession=changed;react.useEffect(()=>{watch=next=>{ref.current=next;publishSession(next);};return()=>{watch=null;};},[ref]);}},
  '@/lib/site-wallet-session.mjs':{openSiteWallet:()=>watch(session(creator))},
  '@/lib/chain/one-approval-launch-journal.ts': {createLaunchJournal: (_stores, account) => ({read: async () => ({entry: account === creator ? entry : null, conflict: false})})},
  '@/lib/chain/launch-progress.ts': {LAUNCH_STAGES: ['submitted', 'created', 'metadata_verified', 'awaiting_monero', 'trading_available']},
  '@/lib/chain/robinhood-mainnet.ts': {ROBINHOOD_CHAIN_MAINNET: {blockExplorerUrl: 'https://example.invalid'}},
  '@/lib/chain/one-approval-launch-client.ts': {submitOneApprovalLaunch: () => {calls.push('send'); throw Error('Unexpected submit');}},
 };
 vm.runInNewContext(source, {
  exports, require: path => modules[path] ?? new Proxy({}, {get: (_o, name) => name}),
  fetch: async (path, options) => {calls.push({path, body: JSON.parse(options.body)}); if (defer) await new Promise(resolve => {resolveResponse = resolve;}); return {ok: true, json: async () => status()};},
  setTimeout: fn => {const id = Symbol(); timers.set(id, fn); return id;}, clearTimeout: id => timers.delete(id),
 });
 function render() {
  rendering = true;
  for (let guard = 0; dirty; guard++) {
   assert.ok(guard < 30 && ++renders < 200, 'render and polling settle without an effect loop'); dirty = false; index = 0; tree = exports.RobinhoodMainnetLaunchV2();
   if (!dirty) for (const slot of slots) if (slot?.pending) {slot.cleanup?.(); const fn = slot.pending; slot.pending = null; slot.cleanup = fn();}
  }
  rendering = false;
 }
 async function flush() { for (let i = 0; i < 12; i++) {await Promise.resolve(); render();} }
 const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];
 const text = value => value == null || typeof value === 'boolean' ? '' : typeof value !== 'object' ? String(value) : Array.isArray(value) ? value.map(text).join(' ') : text(value.props?.children);
 const button = label => nodes(tree).find(n => n.props?.onClick && text(n) === label);
 return {
  async connect() {render(); await flush(); button('Connect wallet').props.onClick(); await flush();},
  async change(account) {assert.ok(watch, 'connected wallet watcher'); watch(account ? session(account) : null); await flush();},
  async tick(count) {confirmations = count; const jobs = [...timers.values()]; timers.clear(); for (const job of jobs) job(); await flush();},
  async respond() {assert.ok(resolveResponse); resolveResponse(); await flush();},
  text: () => text(tree), button, calls, flush,
 };
}

test('submitted progress continues while disconnected and cannot offer another launch', async () => {
 const h = harness(); await h.connect();
 assert.match(h.text(), /Confirmations: 2/);
 assert.equal(h.calls.length, 1, 'rendering progress must not restart polling before the timer');
 await h.change(null);
 assert.match(h.text(), /Tracking your submitted launch continues/);
 assert.equal(h.button('Launch'), undefined);
 await h.tick(10);
 assert.match(h.text(), /Confirmations: 10/);
 assert.ok(h.text().includes('Open token market'));
 assert.equal(h.button('Start a new launch').props.disabled, true);
 assert.equal(h.calls.filter(c => c === 'send').length, 0);
 for (const call of h.calls) assert.equal(call.body.transactionHash, hash);
});

test('same-wallet reconnect restores management; a different account drops prior progress', async () => {
 const h = harness(); await h.connect(); await h.change(null); await h.tick(10);
 await h.connect();
 assert.equal(h.button('Start a new launch').props.disabled, false);
 await h.change(other);
 assert.ok(!h.text().includes('Confirmations: 10'));
 assert.ok(!h.text().includes('View transaction'));
 assert.equal(h.button('Start a new launch'), undefined);
});

test('a late response from the former account cannot overwrite the new account view', async () => {
 const h = harness({defer: true}); await h.connect();
 await h.change(other); await h.respond();
 assert.ok(!h.text().includes('Confirmations: 2'));
 assert.ok(!h.text().includes('View transaction'));
 assert.equal(h.calls.length, 1);
});

test('refresh followed by same-wallet connection resumes the saved transaction without submission', async () => {
 for (let refresh = 0; refresh < 2; refresh++) {
  const h = harness(); await h.connect();
  assert.match(h.text(), /Confirmations: 2/);
  assert.equal(h.button('Launch'), undefined);
  assert.ok(h.calls.length >= 1);
  assert.equal(h.calls.filter(c => c === 'send').length, 0);
 }
});
