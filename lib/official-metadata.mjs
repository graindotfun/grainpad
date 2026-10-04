/** Owner-approved official GRAIN metadata. Publication is not activation approval.
 * Preview, the owner upload and launch preparation all use buildOfficialMetadataPublication. */
import {OFFICIAL_ARTWORK} from './official-artwork.mjs';
import {validateImage} from './image-validation.mjs';
import {buildMetadataPublication,contentHash} from './metadata-publication.mjs';
import {canonicalTokenWebsite} from './token-website.mjs';
import {OFFICIAL_DECLARED_CREATOR_BUY} from './official-launch-policy.mjs';
export const OFFICIAL_METADATA_STATUS='publication-verified-2026-10-03';
/** Owner-approved wording; kept under the compatibility export used by all builders. */
export const OFFICIAL_METADATA_DESCRIPTION_DRAFT='GRAIN is Grainpad\'s token. Trading tax from this mint is paid to holders in wXMR.';
export const OFFICIAL_METADATA_MISSING=Object.freeze([]);
export const OFFICIAL_METADATA_DOCUMENT=Object.freeze({
 name:'Grainpad',
 symbol:'GRAIN',
 description:OFFICIAL_METADATA_DESCRIPTION_DRAFT,
 origin:'https://grainpad.fun',
 twitter:'https://x.com/GrainXMR',
 image:`https://grainpad.fun/api/assets/${OFFICIAL_ARTWORK.sha256}`,
 declaredCreatorBuy:OFFICIAL_DECLARED_CREATOR_BUY,
});
export function officialMetadataDocumentBytes(){return Buffer.from(JSON.stringify(OFFICIAL_METADATA_DOCUMENT));}
/** The publication hash includes the mint identity; the website remains the approved root URL. */
export async function buildOfficialMetadataPublication({mint,imageBytes}){
 const image=imageBytes instanceof Uint8Array?imageBytes:Uint8Array.from(imageBytes);
 const checked=validateImage(image,'image/png');
 if(checked.type!=='image/png')throw Error('Official artwork must be the approved PNG.');
 if(await contentHash(image)!==OFFICIAL_ARTWORK.sha256)throw Error('Official artwork bytes do not match the approved image.');
 const website=canonicalTokenWebsite(mint,{official:true});
 const publication=await buildMetadataPublication({
  name:OFFICIAL_METADATA_DOCUMENT.name,
  symbol:OFFICIAL_METADATA_DOCUMENT.symbol,
  description:OFFICIAL_METADATA_DOCUMENT.description,
  imageType:'image/png',
  mint,
  twitter:OFFICIAL_METADATA_DOCUMENT.twitter,
  website,
  declaredCreatorBuy:OFFICIAL_DECLARED_CREATOR_BUY,
  quoteAsset:'wXMR',
 },image,'https://grainpad.fun');
 if(publication.metadata.description!==OFFICIAL_METADATA_DESCRIPTION_DRAFT||publication.metadata.external_url!==website)throw Error('Official metadata draft was not the published document.');
 return publication;
}
/** Signed upload body. The server rebuilds the publication from these fields and the same image bytes. */
export function officialMetadataUploadDraft({mint,owner,imageBase64,expires}){
 return {
  name:OFFICIAL_METADATA_DOCUMENT.name,
  symbol:OFFICIAL_METADATA_DOCUMENT.symbol,
  description:OFFICIAL_METADATA_DOCUMENT.description,
  imageBase64,
  imageType:'image/png',
  owner,
  expires,
  mint,
  twitter:OFFICIAL_METADATA_DOCUMENT.twitter,
 };
}
