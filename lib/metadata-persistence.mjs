import { contentHash } from './metadata-publication.mjs';
import { readLimitedJSON } from './request-boundary.mjs';

async function readBlock(response, expected) {
  if (response.status >= 300 && response.status < 400) throw Error('Metadata replica redirect refused.');
  if (!response.ok || !response.body) throw Error('Metadata replica retrieval failed.');
  const reader = response.body.getReader(); let size = 0; const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > expected.bytes.length) throw Error('Metadata replica has unexpected bytes.');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (size !== expected.bytes.length || await contentHash(bytes) !== expected.hash) throw Error('Metadata replica hash mismatch.');
}

/** Trusted service bindings only. No client-supplied host, credentials, or URL is fetched.
 * Adapters must retain BOTH raw blocks: JSON image links are not traversed by IPFS pinning.
 * The returned observations prove retrieval now, not future availability or independence.
 */
export async function persistMetadata(publication, services, now = Date.now()) {
  if (publication.profile !== 'ipfs-raw-v1') return null;
  if (!Array.isArray(services) || services.length !== 2 || services.some(s => !s || typeof s.fetch !== 'function') || services[0] === services[1]) throw Error('Two independently operated metadata persistence bindings are required. Publication stopped.');
  const observations = await Promise.all(services.map(async service => {
    const blocks = [];
    for (const block of publication.blocks) {
      const pinned = await service.fetch('https://metadata-persistence.internal/v1/blocks/' + block.cid, {
        method: 'PUT', headers: { 'Content-Type': block.type, 'X-Content-SHA256': block.hash },
        body: block.bytes, signal: AbortSignal.timeout(10_000), redirect: 'manual',
      });
      if (pinned.status >= 300 && pinned.status < 400) throw Error('Metadata pin redirect refused.');
      if (!pinned.ok) throw Error('Metadata pin failed. Publication stopped; retry the same signed draft.');
      // Tiny receipt, bounded before parsing. Provider IDs are operational configuration,
      // never a self-issued claim that two providers are financially independent.
      const receipt = await readLimitedJSON(pinned, 4096);
      if (receipt.cid !== block.cid || typeof receipt.provider !== 'string' || !/^[a-z0-9-]{2,64}$/.test(receipt.provider) || typeof receipt.retention !== 'string' || !receipt.retention.trim() || receipt.retention.length > 1000) throw Error('Invalid persistence receipt.');
      await readBlock(await service.fetch('https://metadata-persistence.internal/v1/blocks/' + block.cid, {
        method: 'GET', signal: AbortSignal.timeout(10_000), redirect: 'manual',
      }), block);
      blocks.push({ cid: block.cid, sha256: block.hash, bytes: block.bytes.length, provider: receipt.provider, retention: receipt.retention, verifiedAt: new Date(now).toISOString() });
    }
    if (new Set(blocks.map(b => b.provider)).size !== 1) throw Error('Inconsistent persistence provider identity.');
    return { provider: blocks[0].provider, blocks };
  }));
  if (observations[0].provider === observations[1].provider) throw Error('Independent metadata replicas have not been configured.');
  return { profile: publication.profile, uri: publication.uri, observations, status: 'retrieved-and-hash-verified', futureAvailability: 'depends on provider retention and continued pinning' };
}
