import nacl from "tweetnacl";
import bs58 from "bs58";
import { SITE, identityPolicy } from "@/lib/site-config";
import { reservedIdentity } from "@/lib/launch-identity.mjs";
import { bucket, fail, limitedJSON, sameOrigin, sha256 } from "@/lib/server-utils";
import { metadataMessage,metadataPayload,metadataLink,type MetadataDraft } from "@/lib/metadata-shared";
export async function POST(request:Request){
 try{
  sameOrigin(request);
  const body=await limitedJSON(request,2_800_000);const draft=body.draft as MetadataDraft;
  if(!draft||typeof draft.name!=="string"||!draft.name.trim()||new TextEncoder().encode(draft.name.trim()).length>32)throw new Error("Name must be 1–32 UTF-8 bytes.");
  if(typeof draft.symbol!=="string"||!/^[$A-Za-z0-9]{1,10}$/.test(draft.symbol))throw new Error("Ticker must have 1–10 letters or digits.");
  if(typeof draft.description!=="string"||draft.description.length>1000)throw new Error("Description is too long.");
  if(typeof draft.imageBase64!=="string"||draft.imageBase64.length>2_700_000)throw new Error("Choose an image below 2 MB.");
  if(!Number.isSafeInteger(draft.expires)||draft.expires<Date.now()||draft.expires>Date.now()+15*60*1000)throw new Error("Metadata signature expired. Please sign again.");
  const website=metadataLink(draft.website,"website"),twitter=metadataLink(draft.twitter,"twitter");
  const payload=metadataPayload(draft);const hash=await sha256(payload);
  const owner=bs58.decode(draft.owner),sig=bs58.decode(body.signature);
  if(owner.length!==32||sig.length!==64||!nacl.sign.detached.verify(new TextEncoder().encode(metadataMessage(new URL(request.url).origin,hash)),sig,owner))throw new Error("Wallet signature did not verify.");
  const bytes=Uint8Array.from(atob(draft.imageBase64),c=>c.charCodeAt(0));
  const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const webp=String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  const type=png?"image/png":jpeg?"image/jpeg":webp?"image/webp":"";
  if(!type||draft.imageType!==type||bytes.length>2_000_000)throw new Error("Upload a valid PNG, JPEG or WebP below 2 MB.");
  const storage=bucket();const imageHash=await sha256(bytes);
  const reserved=reservedIdentity({name:draft.name,symbol:draft.symbol,imageHash,website,twitter},identityPolicy(draft.owner));if(reserved)throw new Error(reserved);
  const links={...(website?{website}:{}),...(twitter?{twitter}:{})};
  const metadata={name:draft.name.trim(),symbol:draft.symbol.trim(),description:draft.description.trim(),image:`${SITE.origin}/api/assets/${imageHash}`,...(website?{external_url:website}:{}),...links,...(Object.keys(links).length?{extensions:links}:{}),properties:{category:"image",files:[{uri:`${SITE.origin}/api/assets/${imageHash}`,type}]}};
  const json=JSON.stringify(metadata);const metaHash=await sha256(json);
  const rateKey=`quotas/${new Date().toISOString().slice(0,10)}/${draft.owner}`;
  const rate=Number(await (await storage.get(rateKey))?.text()||"0");
  if(rate>=20)throw new Error("This wallet reached its daily metadata upload limit.");
  if(!await storage.head(`assets/${imageHash}`))await storage.put(`assets/${imageHash}`,bytes,{httpMetadata:{contentType:type,cacheControl:"public, max-age=31536000, immutable"}});
  if(!await storage.head(`assets/${metaHash}`))await storage.put(`assets/${metaHash}`,json,{httpMetadata:{contentType:"application/json",cacheControl:"public, max-age=31536000, immutable"}});
  await storage.put(`owners/${metaHash}/${draft.owner}`,JSON.stringify({createdAt:new Date().toISOString(),metadata}));
  await storage.put(rateKey,String(rate+1));
  return Response.json({uri:`${SITE.origin}/api/assets/${metaHash}`,metadataHash:metaHash,image:metadata.image});
 }catch(error){return fail(error);}
}
