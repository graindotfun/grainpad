import test from 'node:test';
import assert from 'node:assert/strict';
import {runPrepare, UPLOADS_PER_HOUR} from '../lib/chain/evm-prepare-metadata.ts';
import {validateImage} from '../lib/image-validation.mjs';
import {createHash} from 'node:crypto';
import {deflateSync, crc32} from 'node:zlib';

const creator = '0x' + '11'.repeat(20), launchId = creator + 'ab'.repeat(12);
const profile = {networkId: 'robinhood:mainnet', chainId: 4663, factory: '0x' + '22'.repeat(20), metadataOrigin: 'https://grainpad.fun', metadataPath: '/api/robinhood/mainnet/metadata/{launchId}', assetOrigin: 'https://grainpad.fun', registrationWindowSeconds: 86400};
function png() {
  const w = 64, h = 64, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 200; raw[o + 1] = 120 + x; raw[o + 2] = 40 + y; }
  const chunk = (t, d) => { const tt = Buffer.from(t), len = Buffer.alloc(4); len.writeUInt32BE(d.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tt, d])) >>> 0); return Buffer.concat([len, tt, d, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = png(), good = {launchId, name: 'Grain Cat', symbol: 'GCAT', description: 'A cat.', website: '', twitter: '', telegram: '', imageBase64: PNG.toString('base64'), imageType: 'image/png'};
const sha256 = async d => createHash('sha256').update(d).digest('hex');
function deps(over = {}) {
  const events = [], objects = new Map();
  const d = {profile, clientIsLocal: false, validateImage, sha256, events, objects,
    consume: async (key, limit, windowMs) => { events.push(['consume', key, limit, windowMs ?? 60000]); return !(over.denyConsume && over.denyConsume(key)); },
    take: async (key, limit, windowMs) => { events.push(['take', key, limit, windowMs]); return !(over.denyTake && over.denyTake(key)); },
    store: {get: async k => objects.get(k) ?? null, put: async (k, v) => { events.push(['put', k]); objects.set(k, v); return {}; }}, ...over.deps};
  return d;
}
const names = d => d.events.map(e => e[0] + ':' + e[1]);

test('every shared hourly and daily upload quota is enforced with the existing limits and windows', async () => {
  const d = deps(); const r = await runPrepare(async () => good, 'iphash', d);
  assert.equal(r.status, 200);
  const q = d.events.filter(e => e[0] !== 'put').map(e => e.slice(1).join('|'));
  for (const expected of ['upload-attempts-global|200|60000', 'upload-attempts-ip:iphash|30|60000', 'metadata-ip:iphash|12|3600000', 'metadata-global|' + UPLOADS_PER_HOUR + '|3600000', 'upload-global|2000|86400000', 'upload-ip:iphash|40|86400000', 'upload-owner:' + creator + '|20|86400000'])
    assert.ok(q.includes(expected), 'missing quota ' + expected + ' in ' + JSON.stringify(q));
  assert.ok(names(d).filter(n => n.startsWith('put:')).length === 2, 'image and metadata written');
});

test('an invalid image, link or text spends no shared success quota and writes nothing', async () => {
  const cases = [
    {...good, imageBase64: Buffer.from('not an image').toString('base64')},           // decodes, fails image validation
    {...good, imageType: 'image/gif'},
    {...good, website: 'http://localhost:8080'},
    {...good, name: 'bad‮name'},
    {...good, symbol: 'A‮B'},
    {...good, launchId: '0x1234'},
  ];
  for (const body of cases) {
    const d = deps();
    await assert.rejects(runPrepare(async () => body, 'iphash', d));
    const spent = d.events.filter(e => e[0] === 'take' || (e[0] === 'consume' && !/^upload-attempts|^robinhood-mainnet-prepare/.test(e[1])) || e[0] === 'put');
    assert.deepEqual(spent, [], 'no success quota or write for ' + JSON.stringify(body).slice(0, 80));
  }
});

test('a quota refusal at any shared tier happens before any write', async () => {
  for (const deny of [k => k === 'metadata-ip:iphash', k => k === 'metadata-global', k => k === 'upload-global', k => k === 'upload-ip:iphash', k => k.startsWith('upload-owner:')]) {
    const d = deps({denyConsume: deny, denyTake: deny});
    try { const r = await runPrepare(async () => good, 'iphash', d); assert.equal(r.status, 429); } catch (e) { assert.match(e.message, /budget reached/); }
    assert.equal(d.events.filter(e => e[0] === 'put').length, 0, 'nothing written when a quota refuses');
  }
});

test('attempt budgets are charged before the body is read; a replay of stored bytes costs no success quota', async () => {
  let read = false; const denied = deps({denyConsume: k => k === 'upload-attempts-global'});
  const r = await runPrepare(async () => { read = true; return good; }, 'iphash', denied);
  assert.equal(r.status, 429); assert.equal(read, false, 'a flood is refused before its body is read');
  const d = deps(); await runPrepare(async () => good, 'iphash', d);
  const before = d.events.length;
  const again = await runPrepare(async () => good, 'iphash', d);
  assert.equal(again.status, 200); assert.equal(d.events.slice(before).filter(e => e[0] === 'take' || e[1] === 'upload-global' || e[0] === 'put').length, 0, 'replay is free of success quotas and writes');
  assert.deepEqual(again.body.metadataHash, (await runPrepare(async () => good, 'iphash', deps())).body.metadataHash);
});
