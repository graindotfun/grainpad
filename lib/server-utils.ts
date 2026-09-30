import {executionStorage} from './indexer-execution.mjs';
import { env } from "cloudflare:workers";
export function bucket(): R2Bucket {
  const binding = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
  if (!binding) throw new Error("Storage is temporarily unavailable. Your draft has not been lost.");
  return executionStorage(binding) as R2Bucket;
}
export {assertSameOrigin as sameOrigin,readLimitedJSON as limitedJSON} from "./request-boundary.mjs";
export function fail(error: unknown, status=400) {
  return Response.json({error: error instanceof Error ? error.message : "Request failed."}, {status});
}
export async function sha256(data: Uint8Array | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(hash), b=>b.toString(16).padStart(2,"0")).join("");
}
