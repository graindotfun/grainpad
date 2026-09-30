import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildMetadataPublication, contentHash, rawCid, rawCidHash, metadataHashFromUri, assertPublicationBinding, assertMetadataClaim } from '../lib/metadata-publication.mjs';
import { persistMetadata } from '../lib/metadata-persistence.mjs';
const origin = 'https://grainpad.fun', bytes = new TextEncoder().encode('hello world');
const draft = { name: 'Example', symbol: 'EX', description: 'Project', imageType: 'image/png', mint: 'CzvYJXb3e4KtTd2xZviV9nMUSAC1jary4wLY4cVhwgrn' };
const publish = () => buildMetadataPublication(draft, bytes, origin, 'ipfs-raw-v1');
function service(provider, corrupt = false) {
  const stored = new Map();
  return { stored, async fetch(url, options) {
    const cid = new URL(url).pathname.split('/').at(-1);
    if (options.method === 'PUT') { stored.set(cid, options.body); return Response.json({ cid, provider, retention: 'Funded until cancellation; reviewed separately' }); }
    return new Response(corrupt ? new Uint8Array([0]) : stored.get(cid));
  } };
}

test('raw CID encodes standard version/codec/hash and rejects alternate padding, paths and codecs', async () => {
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(await contentHash(bytes), hash);
  // Independently generated RFC4648 base32 of 01551220 || SHA256("hello world").
  assert.equal(rawCid(hash), 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e');
  assert.equal(rawCidHash(rawCid(hash)), hash);
  assert.equal(metadataHashFromUri('ipfs://' + rawCid(hash), origin), hash);
  for (const uri of ['https://evil.test/api/assets/' + hash, 'ipfs://' + rawCid(hash) + '/file', 'ipfs://QmBad', 'ipfs://' + rawCid(hash).slice(0, -1) + 'f']) assert.throws(() => metadataHashFromUri(uri, origin));
});

test('canonical metadata binds both CIDs, rejects large raw blocks and signed URI substitution', async () => {
  const publication = await publish();
  assert.equal(publication.metadata.image, 'ipfs://' + rawCid(await contentHash(bytes)));
  assert.equal(publication.metadataHash, await contentHash(publication.blocks[1].bytes));
  assert.deepEqual(await publish(), publication);
  const signed = { ...draft, storageProfile: publication.profile, metadataUri: publication.uri, imageUri: publication.imageUri };
  assertPublicationBinding(signed, publication);
  assert.throws(() => assertPublicationBinding(draft, publication));
  assert.throws(() => assertPublicationBinding({ ...signed, metadataUri: origin }, publication));
  await assert.rejects(() => buildMetadataPublication(draft, new Uint8Array(1_048_577), origin, 'ipfs-raw-v1'), /1 MiB/);
  const legacy = await buildMetadataPublication(draft, bytes, origin);
  assertPublicationBinding(draft, legacy);
  assert.equal(legacy.uri, origin + '/api/assets/' + legacy.metadataHash);
});

test('both providers must retain and return both exact blocks; missing, duplicate and corrupt providers fail closed', async () => {
  const publication = await publish(), primary = service('primary'), secondary = service('secondary');
  const proof = await persistMetadata(publication, [primary, secondary]);
  assert.equal(primary.stored.size, 2); assert.equal(secondary.stored.size, 2);
  assert.equal(proof.observations.length, 2);
  for (const services of [[], [primary, primary], [service('same'), service('same')], [primary, service('corrupt', true)]]) await assert.rejects(() => persistMetadata(publication, services));
  const claim = { metadata: publication.metadata, uri: publication.uri, profile: publication.profile, imageHash: publication.imageHash, signedPayloadHash: 'a'.repeat(64), persistence: proof };
  assert.deepEqual(await assertMetadataClaim(claim, publication.metadataHash, publication.uri, origin), publication.metadata);
  await assert.rejects(() => assertMetadataClaim({ ...claim, persistence: null }, publication.metadataHash, publication.uri, origin));
  await assert.rejects(() => assertMetadataClaim({ ...claim, metadata: { ...claim.metadata, name: 'Changed' } }, publication.metadataHash, publication.uri, origin));
  const legacy = await buildMetadataPublication(draft, bytes, origin);
  assert.deepEqual(await assertMetadataClaim({ metadata: legacy.metadata }, legacy.metadataHash, legacy.uri, origin), legacy.metadata);
  await assert.rejects(() => assertMetadataClaim({ metadata: legacy.metadata }, legacy.metadataHash, 'ipfs://' + rawCid(legacy.metadataHash), origin));
});

test('oversized streamed pin receipts are cancelled before unbounded allocation', async () => {
  let cancelled = false;
  const huge = { async fetch() { return new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(2048)); }, cancel() { cancelled = true; } })); } };
  await assert.rejects(async () => persistMetadata(await publish(), [huge, service('secondary')]), /too large/);
  assert.equal(cancelled, true);
});
