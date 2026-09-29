// Site mark and official token artwork are separate assets. Token bytes also feed metadata.
import {OFFICIAL_ARTWORK} from './official-artwork.mjs';
export const BRAND_ASSETS = {
 mark: "/brand/grainpad-color.svg?v=17302e4499",
 token: `${OFFICIAL_ARTWORK.path}?v=${OFFICIAL_ARTWORK.sha256.slice(0,12)}`,
 favicon: "/favicon.svg?v=17302e4499",
} as const;
