import {SITE} from '@/lib/site-config';
import {database} from '@/lib/server-owner';
import {grainpadPlatformId} from '@/lib/platform-policy';
export const dynamic='force-dynamic';
const PAGES=['/','/launch','/markets','/markets/wxmr','/rooms','/fees','/treasury','/rewards','/transparency','/authority','/platform','/docs','/roadmap','/lab'];
/** Public pages plus every indexed Grainpad token, its receipt and its crew room. D1 only. */
export async function GET(){
 let tokens:{mint:string;created_at:string}[]=[];
 try{tokens=(await database().prepare('SELECT mint,created_at FROM launch_index WHERE network=? AND platform_id=? ORDER BY created_at DESC LIMIT 15000').bind('mainnet-beta',grainpadPlatformId().toBase58()).all<{mint:string;created_at:string}>()).results;}catch{/* Static pages still publish. */}
 const url=(path:string,lastmod?:string)=>`<url><loc>${SITE.origin}${path}</loc>${lastmod?`<lastmod>${new Date(lastmod).toISOString()}</lastmod>`:''}</url>`;
 const body=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${PAGES.map(p=>url(p)).join('')}${tokens.flatMap(t=>[url(`/token/${t.mint}`,t.created_at),url(`/token/${t.mint}/receipt`,t.created_at),url(`/token/${t.mint}/room`,t.created_at)]).join('')}</urlset>`;
 return new Response(body,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=900'}});
}
