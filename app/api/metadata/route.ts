import {validateImage} from '@/lib/image-validation.mjs';
import {env} from 'cloudflare:workers';
import {buildMetadataPublication,assertPublicationBinding} from '@/lib/metadata-publication.mjs';
import {persistMetadata} from '@/lib/metadata-persistence.mjs';
import {database} from "@/lib/server-owner";
import {consumeRequestBudget} from "@/lib/abuse-budget.mjs";
import {requestClientKey} from '@/lib/client-key.mjs';
import nacl from "tweetnacl";
import bs58 from "bs58";
import { SITE } from "@/lib/site-config";
import { launchRegistrationIdentity } from "@/lib/launch-registration.mjs";
import { bucket, fail, limitedJSON, sameOrigin, sha256 } from "@/lib/server-utils";
import { assertMetadataText,metadataMessage,metadataPayload,metadataLink,type MetadataDraft } from "@/lib/metadata-shared";
import { TOKEN_CREATION_ENABLED } from "@/lib/platform-settings.mjs";
import { takeBudget } from "@/lib/shared-market-cache.mjs";
// Throwaway keys make the per-wallet quota unbounded; these atomic D1 counters bound one network and the whole site.
const UPLOADS_PER_IP_HOUR=12,UPLOADS_PER_HOUR=240;
export async function POST(request:Request){
 try{
  sameOrigin(request);
  // Metadata exists only to create a token; while creation is locked it is unauthenticated public storage.
  if(!TOKEN_CREATION_ENABLED)return fail(Error("Token creation is locked pending separate approval. Metadata uploads are closed."),403);
  const ipHash=await sha256(requestClientKey(request));
  if(!await consumeRequestBudget(database(),'upload-attempts-global',200)||!await consumeRequestBudget(database(),'upload-attempts-ip:'+ipHash,30))return fail(Error('Upload request limit reached. Retry shortly.'),429);
  const body=await limitedJSON(request,2_800_000);const draft=body.draft as MetadataDraft;
  if(!draft||typeof draft.name!=="string"||!draft.name.trim()||new TextEncoder().encode(draft.name.trim()).length>32)throw new Error("Name must be 1–32 UTF-8 bytes.");
  if(typeof draft.symbol!=="string"||!/^[$A-Za-z0-9]{1,10}$/.test(draft.symbol))throw new Error("Ticker must have 1–10 letters or digits.");
  if(typeof draft.description!=="string"||draft.description.length>1000)throw new Error("Description is too long.");
  assertMetadataText(draft);
  if(typeof draft.imageBase64!=="string"||draft.imageBase64.length>2_700_000)throw new Error("Choose an image below 2 MB.");
  if(!Number.isSafeInteger(draft.expires)||draft.expires<Date.now()||draft.expires>Date.now()+15*60*1000)throw new Error("Metadata signature expired. Please sign again.");
  const website=metadataLink(draft.website,"website"),twitter=metadataLink(draft.twitter,"twitter");
  if(draft.declaredCreatorBuy!==undefined&&(!['SOL','wXMR'].includes(draft.quoteAsset||'')||typeof draft.declaredCreatorBuy!=='string'||!/^\d{1,12}(\.\d{1,9})?$/.test(draft.declaredCreatorBuy)))throw Error('Creator buy declaration must be an amount in the selected quote asset.');
  const payload=metadataPayload(draft);const hash=await sha256(payload);
  const owner=bs58.decode(draft.owner),sig=bs58.decode(body.signature);
  if(owner.length!==32||sig.length!==64||!nacl.sign.detached.verify(new TextEncoder().encode(metadataMessage(new URL(request.url).origin,hash)),sig,owner))throw new Error("Wallet signature did not verify.");
  const bytes=Uint8Array.from(atob(draft.imageBase64),c=>c.charCodeAt(0));
  const {type}=validateImage(bytes,draft.imageType);
  const storage=bucket();const imageHash=await sha256(bytes);
  const reserved=launchRegistrationIdentity({name:draft.name,symbol:draft.symbol,imageHash,website,twitter},draft.owner);if(reserved)throw Error(reserved);
  const db=database();
  if(!await takeBudget(db,`metadata-ip:${ipHash}`,1,UPLOADS_PER_IP_HOUR,3_600_000))return fail(Error('Too many metadata uploads from this network. Try again later.'),429);
  if(!await takeBudget(db,'metadata-global',1,UPLOADS_PER_HOUR,3_600_000))return fail(Error('Metadata uploads are busy. Try again shortly.'),429);
  const publication=await buildMetadataPublication({...draft,website,twitter},bytes,SITE.origin);
  assertPublicationBinding(draft,publication);
  const {metadata,metadataHash:metaHash}=publication;const json=JSON.stringify(metadata);
  if(!await consumeRequestBudget(database(),'upload-global',2000,{windowMs:86_400_000})||!await consumeRequestBudget(database(),'upload-ip:'+ipHash,40,{windowMs:86_400_000})||!await consumeRequestBudget(database(),'upload-owner:'+draft.owner,20,{windowMs:86_400_000}))throw Error('Metadata upload budget reached. Please retry tomorrow.');
  const bindings=env as unknown as {METADATA_PRIMARY?:Fetcher;METADATA_SECONDARY?:Fetcher};
  const persistence=await persistMetadata(publication,[bindings.METADATA_PRIMARY,bindings.METADATA_SECONDARY]);
  if(!await storage.head(`assets/${imageHash}`))await storage.put(`assets/${imageHash}`,bytes,{httpMetadata:{contentType:type,cacheControl:"public, max-age=31536000, immutable"}});
  if(!await storage.head(`assets/${metaHash}`))await storage.put(`assets/${metaHash}`,json,{httpMetadata:{contentType:"application/json",cacheControl:"public, max-age=31536000, immutable"}});
  await storage.put(`owners/${metaHash}/${draft.owner}`,JSON.stringify({createdAt:new Date().toISOString(),metadata,uri:publication.uri,profile:publication.profile,imageHash,signedPayloadHash:hash,persistence}));
  return Response.json({uri:publication.uri,metadataHash:metaHash,image:`${SITE.origin}/api/assets/${imageHash}`});
 }catch(error){return fail(error);}
}
