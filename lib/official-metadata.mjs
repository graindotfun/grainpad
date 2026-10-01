/** Draft official GRAIN metadata. Not an approval and not an activation pin.
 * Preview, the owner upload and launch preparation all use buildOfficialMetadataPublication. */
import {OFFICIAL_ARTWORK} from './official-artwork.mjs';
import {validateImage} from './image-validation.mjs';
import {buildMetadataPublication,contentHash} from './metadata-publication.mjs';
import {canonicalTokenWebsite} from './token-website.mjs';
export const OFFICIAL_METADATA_STATUS='proposed-not-approved';
/** Words that would be published if the owner approves them. Approval is a later pin, not this constant. */
export const OFFICIAL_METADATA_DESCRIPTION_DRAFT='GRAIN is Grainpad\'s token. Trading tax from this mint is paid to holders in wXMR.';
export const OFFICIAL_METADATA_MISSING=Object.freeze([
 'confirmed mint',
 'canonical token website',
 'telegram',
 'declaredCreatorBuy',
]);
export const OFFICIAL_METADATA_DOCUMENT=Object.freeze({
 name:'Grainpad',
 symbol:'GRAIN',
 description:OFFICIAL_METADATA_DESCRIPTION_DRAFT,
 origin:'https://grainpad.fun',
 twitter:'https://x.com/GrainXMR',
 image:`https://grainpad.fun/api/assets/${OFFICIAL_ARTWORK.sha256}`,
});
export function officialMetadataDocumentBytes(){return Buffer.from(JSON.stringify(OFFICIAL_METADATA_DOCUMENT));}
/** The publication hash depends on the mint because the token page URL is inside the bytes. */
export async function buildOfficialMetadataPublication({mint,imageBytes}){
 const image=imageBytes instanceof Uint8Array?imageBytes:Uint8Array.from(imageBytes);
 const checked=validateImage(image,'image/png');
 if(checked.type!=='image/png')throw Error('Official artwork must be the approved PNG.');
 if(await contentHash(image)!==OFFICIAL_ARTWORK.sha256)throw Error('Official artwork bytes do not match the approved image.');
 const website=canonicalTokenWebsite(mint);
 const publication=await buildMetadataPublication({
  name:OFFICIAL_METADATA_DOCUMENT.name,
  symbol:OFFICIAL_METADATA_DOCUMENT.symbol,
  description:OFFICIAL_METADATA_DOCUMENT.description,
  imageType:'image/png',
  mint,
  twitter:OFFICIAL_METADATA_DOCUMENT.twitter,
  website,
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
