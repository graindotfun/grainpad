// Site mark and official token artwork are separate assets. Token bytes also feed metadata.
import {OFFICIAL_ARTWORK} from './official-artwork.mjs';
export const BRAND_ASSETS = {
 mark: "/brand/grainpad-color.svg?v=17302e4499",
 token: `${OFFICIAL_ARTWORK.path}?v=${OFFICIAL_ARTWORK.sha256.slice(0,12)}`,
 favicon: "/favicon.svg?v=17302e4499",
 // Palette-aligned logos for the D "grains" layout. There is no reversed logo: dark theme sets them on a white plate.
 logoHorizontal: "/brand/grainpad-logo-horizontal-core.svg?v=b9dc175079",
 logoSymbol: "/brand/grainpad-logo-symbol-core.svg?v=c3152ce1d4",
 logoWordmark: "/brand/grainpad-logo-wordmark-core.svg?v=dcdea27dcf",
} as const;
