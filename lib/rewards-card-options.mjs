/** Rewards share-card style options: the one allow-list shared by the edge cache key and both card renderers, so a
 * key always names exactly one image. Pure; no colours, data or network. */
export const CARD_THEME_NAMES=Object.freeze(['white','cream','orange']);
/** Type: no illustration (the default). Receipt: a small paper receipt. Mascot joins later, with its own asset. */
export const CARD_ARTS=Object.freeze(['type','receipt']);
export const CARD_CURRENCIES=Object.freeze(['wXMR','USD','SOL']);

/** Seeded so a wallet's card draws the same art every time. */
export function seeded(seed){let h=2166136261;for(const c of String(seed))h=Math.imul(h^c.charCodeAt(0),16777619);return ()=>{h=Math.imul(h^h>>>15,2246822507);h=Math.imul(h^h>>>13,3266489909);h^=h>>>16;return (h>>>0)/4294967296;};}
export function defaultArt(){return 'type';}
const listed=(list,value)=>typeof value==='string'&&list.includes(value);
/** Canonical style for a wallet: unknown values become the renderer's defaults, and a missing or unknown art is the
 * wallet's own seeded art, written out, so "no art" and "the default art" are the same card and the same key. */
export function canonicalCardStyle({theme,art,currency}={},seed=''){
 return {theme:listed(CARD_THEME_NAMES,theme)?theme:'white',art:listed(CARD_ARTS,art)?art:defaultArt(seed),currency:listed(CARD_CURRENCIES,currency)?currency:'wXMR'};
}
