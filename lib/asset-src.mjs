import {SITE} from './site-config.ts';
const OWN_ASSET=/^\/api\/assets\/[a-f0-9]{64}$/;
/** Token artwork stored by grainpad is recorded as an absolute https://grainpad.fun/api/assets/<sha256> URL. Render it
 * as the same-origin path: identical in production, and a preview deployment then loads it from its own origin under
 * the unchanged img-src 'self' policy. Every other source is returned unchanged.
 * @param {string|undefined|null} src */
export function displayAssetSrc(src){
 if(typeof src!=='string'||!src.startsWith('https://'))return src??undefined;
 try{const url=new URL(src);return url.origin===SITE.origin&&OWN_ASSET.test(url.pathname)&&!url.search&&!url.hash?url.pathname:src;}catch{return src;}
}
