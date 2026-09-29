/** Provenance is an exact PlatformConfig match. Names, symbols and logos confer no status. */
export function isOwnPlatform(platformId, expected){return typeof expected==='string'&&expected.length>0&&platformId===expected;}
export function pinOfficial(rows, officialMint){
 return rows.map(row=>({...row,official:Boolean(officialMint&&row.mint===officialMint)}))
  .sort((a,b)=>Number(b.official)-Number(a.official));
}
/** A caution label, never an identity decision. Fold common brand impersonation glyphs. */
export function resemblesGrain(value){
 const skeleton=String(value||'').normalize('NFKD').toLowerCase()
  .replace(/[ɡցԍ]/gu,'g').replace(/[гᴦᏒꭱ]/gu,'r').replace(/[аɑα]/gu,'a')
  .replace(/[іıιӏⅼl1]/gu,'i').replace(/[ոпην]/gu,'n').replace(/[рρ]/gu,'p').replace(/[ԁɗ]/gu,'d')
  .replace(/[^a-z]/gu,'');
 return skeleton.includes('grain');
}
export function grainImpersonation(row){return !row.official&&(resemblesGrain(row.name)||resemblesGrain(row.symbol));}
const hostname=value=>{try{return new URL(value).hostname.toLowerCase();}catch{return '';}};
const xHandle=value=>{try{return new URL(value).pathname.replace(/\//g,'').toLowerCase();}catch{return '';}};
/**
 * The official identity is reserved for the platform admin wallet. Returns a refusal reason, or null.
 * @param {{name:string,symbol:string,imageHash?:string,website?:string,twitter?:string}} draft
 * @param {{owner:string,admin:string,artworkHash:string,siteHost:string,twitterHandle:string}} policy
 * @returns {string|null}
 */
export function reservedIdentity({name,symbol,imageHash,website,twitter},{owner,admin,artworkHash,siteHost,twitterHandle}){
 if(typeof admin==='string'&&admin.length>0&&owner===admin)return null;
 if(resemblesGrain(name)||resemblesGrain(symbol))return 'GRAIN and Grainpad names and tickers are reserved for the official token.';
 if(imageHash&&imageHash===artworkHash)return 'The official GRAIN artwork is reserved for the official token.';
 const host=hostname(website);
 if(host&&(host===siteHost||host.endsWith('.'+siteHost)))return 'Grainpad’s own website cannot be used as a token link.';
 if(twitter&&xHandle(twitter)===String(twitterHandle).toLowerCase())return 'Grainpad’s X account cannot be used as a token link.';
 return null;
}
