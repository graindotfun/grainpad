import {acquireResourceLease} from '@/lib/resource-leases.mjs';
import {renderPng} from '@/lib/og/render';
import {Buffer} from 'buffer';
import albertSans from '@/lib/og/albert-sans-500.ttf?inline';
import plexMono from '@/lib/og/ibm-plex-mono-500.woff?inline';
import albertSansBold from '@/lib/og/albert-sans-600.ttf?inline';
import logo from '@/public/brand/grainpad-logo-horizontal-core.svg?inline';
import {shareToken,validMint} from '@/lib/share-data';
import {crewCard,tokenCard} from '@/lib/og/cards';
import {crewRecord} from '@/lib/launch-room.mjs';
import {database} from '@/lib/server-owner';
import {bucket} from '@/lib/server-utils';
import {SITE} from '@/lib/site-config';
export const dynamic='force-dynamic';
/** Designed share cards (layouts in lib/og/cards.tsx). Data comes from D1 and existing caches only; rendering never reads the chain. */
const font=(uri:string)=>Buffer.from(uri.slice(uri.indexOf(',')+1),'base64');
const fonts=[{name:'Albert',data:font(albertSans),weight:500 as const,style:'normal' as const},{name:'Albert',data:font(albertSansBold),weight:600 as const,style:'normal' as const},{name:'Plex',data:font(plexMono),weight:500 as const,style:'normal' as const}];
// Vite inlines SVG as a URL-encoded data URI; the card renderer is given base64, the form previewed and tested.
const base64Svg=(uri:string)=>uri.includes(';base64,')?uri:`data:image/svg+xml;base64,${Buffer.from(decodeURIComponent(uri.slice(uri.indexOf(',')+1))).toString('base64')}`;
const assets={logo:base64Svg(logo)};
async function tokenImage(uri:string){
 try{const url=new URL(uri);if(url.origin!==SITE.origin||!/^\/api\/assets\/[a-f0-9]{64}$/.test(url.pathname))return null;
  const object=await bucket().get('assets/'+url.pathname.split('/').pop());if(!object||object.size>1_500_000)return null;
  const bytes=new Uint8Array(await object.arrayBuffer());
  const type=bytes[0]===0x89&&bytes[1]===0x50?'image/png':bytes[0]===0xff&&bytes[1]===0xd8?'image/jpeg':null;
  return type?`data:${type};base64,${Buffer.from(bytes).toString('base64')}`:null;
 }catch{return null;}
}
async function crewElement(wallet:string){
 const rows=await crewRecord(database(),wallet,{limit:200});
 return crewCard(wallet,{contributions:rows.length,approved:rows.filter(r=>r.approved).length,paid:rows.filter(r=>r.payments.length).length,projects:new Set(rows.map(r=>r.mint)).size},assets);
}
export async function GET(request:Request,{params}:{params:Promise<{kind:string;id:string}>}){
 const {kind,id}=await params;
 if(!validMint(id)||!['token','receipt','room','crew'].includes(kind))return new Response('Not found',{status:404});
 const cache=(globalThis as unknown as {caches?:{default?:Cache}}).caches?.default,key=new Request(`${SITE.origin}/api/og/${kind}/${id}`);
 const hit=await cache?.match(key).catch(()=>undefined);if(hit)return hit;
 let release:(()=>Promise<void>)|null=null;
 try{
  release=await acquireResourceLease(database(),'og-render',{slots:2,ttlMs:60_000});
  if(!release)return new Response('Share card busy',{status:429,headers:{'Retry-After':'10','Cache-Control':'no-store'}});
  // Fixed ten cold attempts per rolling minute, including nonexistent IDs.
  // Do not release these quota tokens early; cached hits bypass this path.
  if(!await acquireResourceLease(database(),'og-cold',{slots:10,ttlMs:60_000}))return new Response('Share card busy',{status:429,headers:{'Retry-After':'60','Cache-Control':'no-store'}});
  let element;
  if(kind==='crew')element=await crewElement(id);
  else{const t=await shareToken(id);if(!t)return new Response('Not found',{status:404});element=tokenCard(t,kind as 'token'|'receipt'|'room',await tokenImage(t.record.image),assets);}
  const bytes=await renderPng(element,{width:1200,height:630,fonts}),response=new Response(bytes as Uint8Array<ArrayBuffer>,{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=600, s-maxage=600','X-Content-Type-Options':'nosniff'}});
  await cache?.put(key,response.clone()).catch(()=>undefined);
  return response;
 }catch(error){console.error('grainpad_og',JSON.stringify({kind,message:error instanceof Error?error.message.slice(0,300):'render failed'}));return new Response('Share card unavailable',{status:503,headers:{'Cache-Control':'no-store'}});}finally{await release?.();}
}
