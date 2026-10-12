import test from 'node:test';
import assert from 'node:assert/strict';
import {formatNumber,formatPrice,formatUsd,formatAmount,formatUnits,formatPercent,relativeTime,recordNumber,shortAddress} from '../lib/price-format.ts';

test('tiny values use subscript zeros, never scientific notation', () => {
 assert.equal(formatNumber(0.0000000284), '0.0₇284');
 assert.equal(formatNumber(0.00005921), '0.0₄5921');
 assert.equal(formatNumber(0.000012345678), '0.0₄1235');
 assert.equal(formatNumber(1e-15), '0.0₁₄1');
 for (const n of [1e-7, 3.3e-12, 9.99e-9, 123456789, 1e21]) assert.doesNotMatch(formatNumber(n), /e[+-]?\d/i);
});

test('the subscript threshold is 0.0001, including values that round up to it', () => {
 assert.equal(formatNumber(0.0001), '0.0001');
 assert.equal(formatNumber(0.000099996), '0.0001');
 assert.equal(formatNumber(0.00009999), '0.0₄9999');
});

test('ordinary values keep 3–4 significant digits', () => {
 assert.equal(formatNumber(0.001234567), '0.001235');
 assert.equal(formatNumber(1.23456), '1.235');
 assert.equal(formatNumber(12.3456), '12.35');
 assert.equal(formatNumber(1.5, {sig: 3}), '1.5');
 assert.equal(formatNumber(2.25983484, {sig: 3}), '2.26');
 assert.equal(formatNumber(4210), '4,210');
 assert.equal(formatNumber(61234), '61.2K');
 assert.equal(formatNumber(1_840_000), '1.84M');
});

test('units, currency and missing values', () => {
 assert.equal(formatPrice(0.0000000284, 'SOL'), '0.0₇284 SOL');
 assert.equal(formatPrice(0.00000612, 'USD'), '$0.0₅612');
 assert.equal(formatUsd(61200), '$61.2K');
 assert.equal(formatUsd(null), '—');
 assert.equal(formatAmount(Number.NaN), '—');
 assert.equal(formatNumber(0), '0');
 assert.equal(formatNumber(-0.5), '-0.5');
 assert.equal(formatUnits('61400000000', 9), '61.4');
 assert.equal(formatUnits('2259834840', 9, 3), '2.26');
 assert.equal(formatUnits('not a number', 9), '—');
 assert.equal(formatPercent(12.44, {signed: true}), '+12.4%');
 assert.equal(formatPercent(-3.2), '-3.20%');
});

test('ledger helpers', () => {
 const now = Date.parse('2026-09-30T12:00:00Z');
 assert.equal(relativeTime(now - 4000, now), 'now');
 assert.equal(relativeTime(now - 42_000, now), '42s');
 assert.equal(relativeTime(now - 9 * 60_000, now), '9m');
 assert.equal(relativeTime(now - 3 * 3_600_000, now), '3h');
 assert.equal(relativeTime(now - 2 * 86_400_000, now), '2d');
 assert.equal(recordNumber(17), '#0017');
 assert.equal(recordNumber(12345), '#12345');
 assert.equal(shortAddress('DQTbbvNaqfpShKZHdvKAdBGMBbbLL6fkZBfBobGvouP'), 'DQTb…vouP');
});
