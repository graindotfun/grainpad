import {quoteAsset} from '@/lib/quote-assets.mjs';
import {database} from '@/lib/server-owner';
import {sharedMarketCache} from '@/lib/server-cache';
import {takeBudget} from '@/lib/shared-market-cache.mjs';
import {grainpadPlatformId} from '@/lib/platform-policy';
import {bucket} from "@/lib/server-utils";
import {readLaunchRecords} from "@/lib/launch-records";
import {selectQuote,type TokenTapeData} from "@/lib/token-market";

async function refresh(): Promise<TokenTapeData> {
  const rows = await readLaunchRecords(bucket(), "mainnet-beta",grainpadPlatformId().toBase58());
  const recent = rows.slice(0,30);
  const checkedAt = new Date().toISOString();
  let pairs: unknown = [];
  let failed = false;
  if (recent.length) {
    try {
      if(!await takeBudget(database(),'dex-minute',1,60,60_000))throw Error('Market provider limit');
      // Official batch API supports up to 30 exact token addresses per request.
      const response = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${recent.map(row=>row.mint).join(",")}`, {signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw Error("Market provider unavailable");
      pairs = await response.json();
      if (!Array.isArray(pairs)) throw Error("Invalid market response");
    } catch { failed = true; }
  }
  if(failed)throw Error('Market provider unavailable.');
  const official=await database().prepare('SELECT mint FROM official_token WHERE id=1').first<{mint:string}>();
  const tokens = recent.map(row => ({...selectQuote(row.mint,pairs,checkedAt,quoteAsset(row.quoteAsset).mint),quoteAsset:quoteAsset(row.quoteAsset).symbol,official:row.mint===official?.mint,mint:row.mint,name:row.name,symbol:row.symbol,image:row.image,createdAt:row.createdAt}));
  return {tokens,total:rows.length,checkedAt,marketStatus:tokens.some(token=>token.priceUsd===null)?"partial":"ready"};
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
