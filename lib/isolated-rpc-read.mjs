import {EXPOSURE_LIMITS} from './exposure-report.mjs';
import {rpcComputeUnits} from './rpc-budget.mjs';
const ALLOWED = new Set(['getGenesisHash','getBalance','getTokenAccountsByOwner','getSignaturesForAddress','getTransaction']);
export async function boundedJson(stream, limit, signal) {
  if (!stream) throw Error('Empty body.');
  const reader = stream.getReader();
  const chunks = [];
  let bytes = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, {once: true});
  try {
    for (;;) {
      if (signal?.aborted) throw Error('Read expired.');
      const chunk = await reader.read();
      if (signal?.aborted) throw Error('Read expired.');
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) throw Error('Body exceeds bound.');
      chunks.push(chunk.value);
    }
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(joined));
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

/** Dedicated read-only client. Never forwards visitor headers or raw provider errors. */
export function createIsolatedRpcRead(endpoint, fetcher = fetch, signal = AbortSignal.timeout(EXPOSURE_LIMITS.scanMs)) {
  let cu = 0, calls = 0;
  return async function read(method, params = []) {
    if (!ALLOWED.has(method) || signal.aborted || ++calls > 17 || (cu += rpcComputeUnits(method)) > EXPOSURE_LIMITS.scanCu) throw Error('Exposure read limit reached.');
    const id = calls;
    const timeout = AbortSignal.any([signal, AbortSignal.timeout(EXPOSURE_LIMITS.rpcMs)]);
    const response = await fetcher(endpoint, {method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id, method, params}), signal: timeout});
    if (!response.ok) { await response.body?.cancel(); throw Error('Exposure reader unavailable.'); }
    const body = await boundedJson(response.body, EXPOSURE_LIMITS.responseBytes, timeout);
    if (body?.jsonrpc !== '2.0' || body.id !== id || body.error || !Object.hasOwn(body, 'result')) throw Error('Exposure reader unavailable.');
    return body.result;
  };
}
