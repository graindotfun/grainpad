import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTokenList} from '../lib/chain/evm-token-list.ts';
const opts = {name: 'Grainpad launches', timestamp: '2026-10-14T00:00:00.000Z', version: {major: 1, minor: 0, patch: 0}};
const t = (n, over = {}) => ({chainId: 4663, address: '0x' + n.toString(16).padStart(40, '0'), name: 'Grain Cat', symbol: 'GCAT', image: 'https://grainpad.fun/api/assets/' + 'ab'.repeat(32), ...over});
test('token list includes only representable tokens with an https logo and never rewrites names', () => {
  const list = buildTokenList([t(2), t(1), t(1), t(3, {image: null}), t(4, {image: 'http://x'}), t(5, {name: 'bad<script>'}), t(6, {symbol: 'A B'}), t(7, {address: 'nope'})], opts);
  assert.deepEqual(list.tokens.map(x => x.address.slice(-1)), ['1', '2']);
  assert.equal(list.tokens[0].decimals, 18);
  assert.equal(list.tokens[0].name, 'Grain Cat');
  assert.deepEqual(list.version, {major: 1, minor: 0, patch: 0});
});

import {recordAdmittedToken, collectAdmittedTokens} from '../lib/chain/evm-token-list.ts';
function listStore() {
  const objects = new Map();
  return {objects,
    async put(key, _v, o) { objects.set(key, o?.customMetadata ?? {}); },
    async list({prefix, limit, cursor}) {
      const keys = [...objects.keys()].filter(k => k.startsWith(prefix)).sort();
      const start = cursor ? keys.findIndex(k => k > cursor) : 0;
      const slice = start < 0 ? [] : keys.slice(start, start + limit);
      const more = start >= 0 && start + limit < keys.length;
      return {objects: slice.map(key => ({key, customMetadata: objects.get(key)})), truncated: more, cursor: more ? slice[slice.length - 1] : undefined};
    }};
}
test('admitted index is complete across pages, ordered, and continues with a cursor beyond the cap', async () => {
  const store = listStore(), factory = '0x' + '22'.repeat(20);
  for (let i = 1; i <= 25; i++) await recordAdmittedToken(store, 4663, factory, t(i));
  await recordAdmittedToken(store, 4663, factory, t(99, {image: null}));          // no logo: never indexed
  const all = await collectAdmittedTokens(store, 4663, factory, {pageSize: 7});
  assert.equal(all.tokens.length, 25); assert.equal(all.truncated, false);
  const first = await collectAdmittedTokens(store, 4663, factory, {pageSize: 7, maxTokens: 10});
  assert.equal(first.tokens.length, 10); assert.equal(first.truncated, true); assert.ok(first.cursor);
  const rest = await collectAdmittedTokens(store, 4663, factory, {pageSize: 7, maxTokens: 100, cursor: first.cursor});
  assert.equal(first.tokens.length + rest.tokens.length, 25, 'no token is lost or duplicated at the page boundary');
  assert.equal(new Set([...first.tokens, ...rest.tokens].map(x => x.address)).size, 25);
  const list = buildTokenList(all.tokens, opts);
  assert.equal(list.tokens.length, 25);
});
