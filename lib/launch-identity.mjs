import {canonicalTokenWebsite} from './token-website.mjs';
import {OFFICIAL_LAUNCH_CREATOR} from './official-launch-policy.mjs';

/** Provenance is an exact PlatformConfig match. Names, symbols and logos confer no status. */
export function isOwnPlatform(platformId, expected){return typeof expected==='string'&&expected.length>0&&platformId===expected;}
export function pinOfficial(rows, officialMint){
 return rows.map(row=>({...row,official:Boolean(officialMint&&row.mint===officialMint)}))
  .sort((a,b)=>Number(b.official)-Number(a.official));
}
/** Fold common brand impersonation glyphs, then drop everything that is not a letter. */
export function brandSkeleton(value){
 return String(value||'').normalize('NFKD').toLowerCase()
  .replace(/[ɡցԍ]/gu,'g').replace(/[гᴦᏒꭱ]/gu,'r').replace(/[аɑα]/gu,'a')
  .replace(/[іıιӏⅼl1]/gu,'i').replace(/[ոпην]/gu,'n').replace(/[рρ]/gu,'p').replace(/[ԁɗ]/gu,'d')
  .replace(/[^a-z]/gu,'');
}
/** A caution label, never an identity decision. */
export function resemblesGrain(value){return brandSkeleton(value).includes('grain');}
/** Exact GRAIN or Grainpad, including homoglyphs and a thin official wrapper. Not every English word that contains “grain”.
 * Wrappers are matched after brandSkeleton, which folds l and 1 into i. */
export function isReservedBrand(value){
 return /^(?:the|reai|officiai|og)?(?:grainpad|grain)(?:token|coin|soi|officiai|soiana)?$/.test(brandSkeleton(value));
}
export function grainImpersonation(row){return !row.official&&(resemblesGrain(row.name)||resemblesGrain(row.symbol));}
const hostname=value=>{try{return new URL(value).hostname.toLowerCase();}catch{return '';}};
const xHandle=value=>{try{return new URL(value).pathname.replace(/\//g,'').toLowerCase();}catch{return '';}};
/**
 * The official identity is reserved for the platform admin wallet. Returns a refusal reason, or null.
 * @param {{name:string,symbol:string,imageHash?:string,website?:string,twitter?:string,mint?:string}} draft
 * @param {{owner:string,admin:string,artworkHash:string,siteHost:string,twitterHandle:string}} policy
 * @returns {string|null}
 */
export function reservedIdentity({name,symbol,imageHash,website,twitter,mint},{owner,admin,artworkHash,siteHost,twitterHandle}){
 if(typeof admin==='string'&&admin.length>0&&owner===admin)return null;
 if(owner===OFFICIAL_LAUNCH_CREATOR)return null;
 if(brandSkeleton(symbol)==='grainu')return 'GRAINU is reserved for the registered pilot token.';
 if(isReservedBrand(name)||isReservedBrand(symbol))return 'GRAIN and Grainpad names and tickers are reserved for the official token.';
 if(imageHash&&imageHash===artworkHash)return 'The official GRAIN artwork is reserved for the official token.';
 const host=hostname(website);
 let tokenPage=false;try{tokenPage=website===canonicalTokenWebsite(mint);}catch{/* Unbound brand links remain reserved. */}
 if(host&&(host===siteHost||host.endsWith('.'+siteHost))&&!tokenPage)return 'Grainpad’s own website cannot be used as a token link.';
 if(twitter&&xHandle(twitter)===String(twitterHandle).toLowerCase())return 'Grainpad’s X account cannot be used as a token link.';
 return null;
}

/** Compatibility wrapper for the exact brand reservation shared by all publishers. */
export function assertReservedIdentity(draft,{admin,imageHash,officialImageHash}){
 const reason=reservedIdentity({...draft,imageHash},{owner:draft.owner,admin,artworkHash:officialImageHash,siteHost:'grainpad.fun',twitterHandle:'GrainXMR'});
 if(reason)throw Error('Identity is reserved. '+reason);
}
