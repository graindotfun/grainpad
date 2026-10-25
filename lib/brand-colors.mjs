/** Canonical Grainpad orange for renderers that cannot read CSS custom properties (the /api/og share card).
 * Keep in step with --grain-orange in app/globals.css and #f60 in public/brand/grainpad-color.svg. */
export const GRAIN_ORANGE='#ff6600';
/** The same orange as [r,g,b], for canvas drawing code. */
export const GRAIN_ORANGE_RGB=Object.freeze([1,3,5].map(i=>parseInt(GRAIN_ORANGE.slice(i,i+2),16)));
/** Light-theme orange text ink for renderers without CSS variables; keep in step with --grain-orange-ink.
 * Orange on white or cream is below 3:1, so orange text on those grounds uses this ink. */
export const GRAIN_ORANGE_INK='#ad4400';
