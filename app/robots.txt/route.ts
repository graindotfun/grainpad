import {SITE} from '@/lib/site-config';
export const dynamic='force-static';
// /api/rewards/card is the share card image that X and other unfurlers fetch for /rewards/share links; crawlers that
// honour robots.txt (Twitterbot does) drop the image when it is disallowed. The rest of /api/ stays disallowed.
export function GET(){return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nAllow: /api/og/\nAllow: /api/rewards/card\nDisallow: /owner/\nDisallow: /below-the-index\n\nSitemap: ${SITE.origin}/sitemap.xml\n`,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=3600'}});}
