import type {LaunchRecord} from '@/lib/launch-records';
import {quoteAsset} from '@/lib/quote-assets.mjs';
import {database} from '@/lib/server-owner';
import {sharedMarketCache} from '@/lib/server-cache';
import {grainpadPlatformId} from '@/lib/platform-policy';
import {indexedLaunchPage} from "@/lib/launch-index.mjs";
import {loadQuoteUsd,quoteUsdFor} from "@/lib/quote-usd.mjs";
import {nativeTapeQuote} from "@/lib/native-market.mjs";
import {serverMarket} from "@/lib/server-market";
import type {TokenTapeData} from "@/lib/token-market";

async function snapshots(db:ReturnType<typeof database>,platform:string,mints:string[]){
 const rows=mints.length?await db.prepare(`SELECT key,value,updated_at FROM market_cache WHERE key IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(mints.map(mint=>`market:v3:${platform}:${mint}`))).all<{key:string;value:string;updated_at:number}>():{results:[]};
 return new Map((rows.results||[]).map(row=>[row.key,row]));
}
async function refresh(): Promise<TokenTapeData> {
  const db=database(),platform=grainpadPlatformId().toBase58();
  const page = await indexedLaunchPage(db, "mainnet-beta",platform);
  const recent = page.launches as LaunchRecord[];
  const checkedAt = new Date().toISOString();
  const newest=recent[0];
  if(newest){
   const key=`market:v3:${platform}:${newest.mint}`;
   const current=await db.prepare('SELECT updated_at FROM market_cache WHERE key=?').bind(key).first<{updated_at:number}>();
   if(!current||Date.now()-current.updated_at>15_000){try{await serverMarket(newest.mint,{viewer:true});}catch{/* The tape still lists the launch when the snapshot cannot refresh. */}}
  }
  let quotes:Awaited<ReturnType<typeof loadQuoteUsd>>|null=null;
  try{quotes=await loadQuoteUsd(db,{refresh:true});}catch{quotes=null;}
  const cached=await snapshots(db,platform,recent.map(row=>row.mint));
  const official=await db.prepare('SELECT mint FROM official_token WHERE id=1').first<{mint:string}>();
  const tokens:TokenTapeData["tokens"] = recent.map((row:LaunchRecord) => {
   const saved=cached.get(`market:v3:${platform}:${row.mint}`);
   const snapshot=saved?.value?JSON.parse(saved.value):null;
   const quote=nativeTapeQuote(row,snapshot,quoteUsdFor(quotes,quoteAsset(row.quoteAsset).symbol),checkedAt);
   return {...quote,quoteAsset:quoteAsset(row.quoteAsset).symbol,official:row.mint===official?.mint,mint:row.mint,name:row.name,symbol:row.symbol,image:row.image,createdAt:row.createdAt};
  });
  return {tokens,total:page.total,checkedAt,marketStatus:tokens.some(token=>token.priceUsd===null)?"partial":"ready"};
}

export async function GET() {
  try {
    const result=await sharedMarketCache(database(),`token-tape:quotes:v6:${grainpadPlatformId().toBase58()}`,refresh,{ttl:15_000,maxStale:600_000});
    return Response.json({...result.data,...(result.stale?{marketStatus:'stale'}:{})},{headers:{"Cache-Control":"no-store"}});
  } catch {
    return Response.json({error:"Launch feed is temporarily unavailable."},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
