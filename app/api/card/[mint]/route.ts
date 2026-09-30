import {PublicKey} from '@solana/web3.js';
import {database} from '@/lib/server-owner';
import {grainpadPlatformId} from '@/lib/platform-policy';
import {SITE} from '@/lib/site-config';
import {decodePng,renderSharePng,renderShareSvg,shareCardModel} from '@/lib/share-card.mjs';
import {readCreatorProfile} from '@/lib/creator-profile.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{mint:string}>}){
 try{
  const mint=new PublicKey((await params).mint).toBase58(),url=new URL(request.url);
  const variant=url.searchParams.get('variant')||'market';
  const format=url.searchParams.get('format')==='svg'?'svg':'png';
  const db=database();
  const saved=await db.prepare('SELECT record FROM launch_index WHERE network=? AND platform_id=? AND mint=?').bind('mainnet-beta',grainpadPlatformId().toBase58(),mint).first<{record:string}>();
  if(!saved)return new Response('Not found',{status:404});
  const project=JSON.parse(saved.record);
  const marketRow=await db.prepare('SELECT value FROM market_cache WHERE key=?').bind(`market:v3:${project.platformId}:${mint}`).first<{value:string}>();
  const profile=await readCreatorProfile(db,mint).catch(()=>null);
  const model=shareCardModel({project,market:marketRow?.value?JSON.parse(marketRow.value):null,profile:profile?.current,variant,origin:SITE.origin});
  const headers={'Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'};
  if(format==='svg')return new Response(renderShareSvg(model),{headers:{...headers,'Content-Type':'image/svg+xml; charset=utf-8'}});
  let thumbnail=null;
  if(/^https:\/\/grainpad\.fun\/api\/assets\/[a-f0-9]{64}$/.test(project.image||'')){
   try{
    const image=await fetch(project.image,{signal:AbortSignal.timeout(4000)});
    if(image.ok)thumbnail=await decodePng(new Uint8Array(await image.arrayBuffer()));
   }catch{thumbnail=null;}
  }
  const png=await renderSharePng(model,thumbnail);
  return new Response(png,{headers:{...headers,'Content-Type':'image/png'}});
 }catch{return new Response('Card unavailable',{status:404});}
}
