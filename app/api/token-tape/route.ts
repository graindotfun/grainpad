import type {LaunchRecord} from '@/lib/launch-records';
import {quoteAsset} from '@/lib/quote-assets.mjs';
import {database} from '@/lib/server-owner';
import {sharedMarketCache} from '@/lib/server-cache';
import {takeBudget} from '@/lib/shared-market-cache.mjs';
import {grainpadPlatformId} from '@/lib/platform-policy';
import {indexedLaunchPage} from "@/lib/launch-index.mjs";
import {selectQuote,type TokenTapeData} from "@/lib/token-market";

async function refresh(): Promise<TokenTapeData> {
  const page = await indexedLaunchPage(database(), "mainnet-beta",grainpadPlatformId().toBase58());
  const recent = page.launches;
  const checkedAt = new Date().toISOString();
  let pairs: unknown = [];
  let failed = false;
  if (recent.length) {
    try {
      if(!await takeBudget(database(),'dex-minute',1,60,60_000))throw Error('Market provider limit');
      // Official batch API supports up to 30 exact token addresses per request.
      const mintAddresses=recent.map((row:LaunchRecord)=>row.mint).join(",");
      const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mintAddresses}`, {signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw Error("Market provider unavailable");
      pairs = await response.json();
      if (!Array.isArray(pairs)) throw Error("Invalid market response");
    } catch { failed = true; }
  }
  if(failed)throw Error('Market provider unavailable.');
  const official=await database().prepare('SELECT mint FROM official_token WHERE id=1').first<{mint:string}>();
  const tokens:TokenTapeData["tokens"] = recent.map((row:import("@/lib/launch-records").LaunchRecord) => ({...selectQuote(row.mint,pairs,checkedAt,quoteAsset(row.quoteAsset).mint),quoteAsset:quoteAsset(row.quoteAsset).symbol,official:row.mint===official?.mint,mint:row.mint,name:row.name,symbol:row.symbol,image:row.image,createdAt:row.createdAt}));
  return {tokens,total:page.total,checkedAt,marketStatus:tokens.some(token=>token.priceUsd===null)?"partial":"ready"};
}

export async function GET() {
  try {
    const result=await sharedMarketCache(database(),`token-tape:quotes:v5:${grainpadPlatformId().toBase58()}`,refresh,{ttl:60_000,maxStale:600_000});
    return Response.json({...result.data,...(result.stale?{marketStatus:'stale'}:{})},{headers:{"Cache-Control":"no-store"}});
  } catch {
    // An unreadable registry is not an empty launch history.
    return Response.json({error:"Launch feed is temporarily unavailable."},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
