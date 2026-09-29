import { env } from "cloudflare:workers";
export function bucket(): R2Bucket {
  const binding = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
  if (!binding) throw new Error("Storage is temporarily unavailable. Your draft has not been lost.");
  return binding;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) throw new Error("Cross-origin requests are not allowed.");
}
export async function limitedJSON(request: Request, max = 1_600_000) {
  if (Number(request.headers.get("Content-Length") || 0) > max) throw new Error("Request is too large.");
  const text = await request.text();
  if (text.length > max) throw new Error("Request is too large.");
  return JSON.parse(text);
}
export function fail(error: unknown, status=400) {
  return Response.json({error: error instanceof Error ? error.message : "Request failed."}, {status});
}
export async function sha256(data: Uint8Array | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(hash), b=>b.toString(16).padStart(2,"0")).join("");
}
