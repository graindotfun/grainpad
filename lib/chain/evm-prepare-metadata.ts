/**
 * Pre-approval metadata preparation, as pure logic with injected side effects so the order of checks is testable:
 * attempt budgets -> complete validation (image, links, text) -> retry short-circuit -> shared success quotas -> writes.
 * Nothing is written, and no shared success budget is spent, for a request that fails validation.
 */
import {buildTokenMetadata, tokenMetadataHash, tokenMetadataURI, assertBytes32, type EvmLaunchProfile} from "./evm-one-approval-launch.ts";
import {storeTokenMetadata, tokenMetadataKey, type BlobStore} from "./evm-launch-metadata-store.ts";

export const PREPARE_FIELDS = ["launchId", "name", "symbol", "description", "website", "twitter", "telegram", "imageBase64", "imageType"];
export const UPLOADS_PER_IP_HOUR = 12, UPLOADS_PER_HOUR = 240, HOUR = 3_600_000, DAY = 86_400_000;
export type PrepareDeps = {
  profile: EvmLaunchProfile;
  /** Rolling per-window counter; false when the limit is reached. */
  consume(key: string, limit: number, windowMs?: number): Promise<boolean>;
  /** Hourly token bucket shared with the existing upload routes. */
  take(key: string, limit: number, windowMs: number): Promise<boolean>;
  validateImage(bytes: Uint8Array, type: string): {type: string};
  sha256(data: Uint8Array | string): Promise<string>;
  store: BlobStore & {get(key: string): Promise<unknown>; put(key: string, value: Uint8Array, options: unknown): Promise<unknown>};
  clientIsLocal: boolean;
};
export type PrepareResult = {status: 200 | 429; body: Record<string, unknown>};
const busy = (error: string): PrepareResult => ({status: 429, body: {error}});

export async function runPrepare(readBody: () => Promise<Record<string, unknown>>, ipHash: string, d: PrepareDeps): Promise<PrepareResult> {
  // Attempt budgets come first so a flood is refused before its body is even read.
  if (!await d.consume("upload-attempts-global", 200) || !await d.consume("upload-attempts-ip:" + ipHash, 30) || !await d.consume("robinhood-mainnet-prepare:" + ipHash, 6)) return busy("Retry in one minute.");
  const body = await readBody();
  // 1. Complete validation.
  if (!body || Object.keys(body).some(k => !PREPARE_FIELDS.includes(k))) throw Error("Unsupported fields.");
  for (const k of ["launchId", "name", "symbol", "description", "website", "twitter", "telegram"]) if (typeof body[k] !== "string") throw Error("Missing " + k + ".");
  let media: Uint8Array | null = null, contentType: string | null = null, imageSha256: string | null = null;
  if (body.imageBase64 !== undefined || body.imageType !== undefined) {
    if (typeof body.imageBase64 !== "string" || body.imageBase64.length > 2_700_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.imageBase64) || typeof body.imageType !== "string") throw Error("Invalid image.");
    media = Uint8Array.from(atob(body.imageBase64), c => c.charCodeAt(0));
    contentType = d.validateImage(media, body.imageType).type;
    imageSha256 = await d.sha256(media);
  }
  const doc = buildTokenMetadata(d.profile, assertBytes32(body.launchId as string), {name: body.name as string, symbol: body.symbol as string, description: body.description as string,
    website: body.website as string, twitter: body.twitter as string, telegram: body.telegram as string, imageSha256});
  const hash = tokenMetadataHash(doc), launchId = doc.chain.launchId;
  const metadataURI = tokenMetadataURI(d.profile, launchId, doc);
  const ok = (): PrepareResult => ({status: 200, body: {metadataURI, metadataHash: hash, image: doc.image}});
  // 2. A retried request whose bytes are already stored costs nothing further (a lost response must stay recoverable).
  const haveDoc = await d.store.get(tokenMetadataKey(d.profile, launchId, hash)), haveImage = imageSha256 ? await d.store.get("assets/" + imageSha256) : true;
  if (haveDoc && haveImage) return ok();
  // 3. Shared success quotas, identical to the existing metadata upload.
  const owner = launchId.slice(0, 42), ownerHash = await d.sha256(owner);
  if (!await d.take(d.clientIsLocal ? "metadata-owner:" + ownerHash : "metadata-ip:" + ipHash, UPLOADS_PER_IP_HOUR, HOUR)) return busy("Too many metadata uploads from this network. Try again later.");
  if (!await d.take("metadata-global", UPLOADS_PER_HOUR, HOUR)) return busy("Metadata uploads are busy. Try again shortly.");
  if (!await d.consume("upload-global", 2000, DAY) || !await d.consume(d.clientIsLocal ? "upload-authenticated-owner:" + ownerHash : "upload-ip:" + ipHash, 40, DAY) ||
      !await d.consume("upload-owner:" + owner, 20, DAY)) throw Error("Metadata upload budget reached. Please retry tomorrow.");
  // 4. Writes: immutable and content-addressed.
  if (media && contentType && imageSha256) await d.store.put("assets/" + imageSha256, media, {onlyIf: {etagDoesNotMatch: "*"}, httpMetadata: {contentType, cacheControl: "public, max-age=31536000, immutable"}});
  await storeTokenMetadata(d.store, d.profile, doc);
  return ok();
}
