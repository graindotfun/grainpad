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
