import {SITE} from '@/lib/site-config';
export const dynamic='force-static';
export function GET(){return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nAllow: /api/og/\nDisallow: /owner/\n\nSitemap: ${SITE.origin}/sitemap.xml\n`,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=3600'}});}
