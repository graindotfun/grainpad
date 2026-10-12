// Public-export test for the RPC budget core and the example caps (packaging substitution).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRpcCaps, RPC_CAP_KEYS, rpcComputeUnits} from '../lib/rpc-budget-core.mjs';
import {RPC_CAP_EXAMPLE, rpcCaps, createRpcBudgetAllocator} from '../lib/rpc-budget.mjs';

test('example caps are bounded, validated and never unbounded', () => {
  const caps = rpcCaps({});
  for (const key of RPC_CAP_KEYS) assert.ok(Number.isSafeInteger(caps[key]) && caps[key] >= 1 && caps[key] <= 1_000_000_000_000, key);
  assert.ok(caps.RPC_TRADE_WINDOW_CU + caps.RPC_DISPLAY_WINDOW_CU <= caps.RPC_GLOBAL_WINDOW_CU);
  for (const env of [{RPC_WINDOW_MS: '60001'}, {RPC_GLOBAL_WINDOW_CU: '1'}, {RPC_DISPLAY_DAILY_CU: 'NaN'}, {RPC_BUDGET_LEASE_CU: '1.5'}, {RPC_TRADE_DAILY_CU: '1000000000001'}, {RPC_TRADE_RESERVED_CU: '1200'}])
    assert.throws(() => rpcCaps(env), JSON.stringify(env));
  for (const defaults of [undefined, {}, {...RPC_CAP_EXAMPLE, RPC_WINDOW_MS: undefined}, {...RPC_CAP_EXAMPLE, EXTRA: 1}, {...RPC_CAP_EXAMPLE, RPC_TRADE_WINDOW_CU: 5000}, {...RPC_CAP_EXAMPLE, RPC_WINDOW_MS: 0}])
    assert.throws(() => createRpcCaps(defaults));
  assert.equal(rpcComputeUnits('getTransaction'), 40);
  assert.equal(rpcComputeUnits('unknownMethod'), 20);
});

test('allocator refuses unknown lanes and denies once the database grants nothing', async () => {
  const db = {prepare: () => ({bind: () => ({first: async () => null})})};
  const allocate = createRpcBudgetAllocator();
  await assert.rejects(allocate(db, 'getTransaction', {lane: 'other'}), /Unknown RPC budget lane/);
  assert.equal(await allocate(db, 'getTransaction', {lane: 'display', now: () => 1000}), false);
});
