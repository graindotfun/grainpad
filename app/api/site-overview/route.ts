import {database} from '@/lib/server-owner';
import {bucket} from '@/lib/server-utils';
import {sharedMarketCache} from '@/lib/server-cache';
import {readLaunchRecords} from '@/lib/launch-records';
import {grainpadPlatformId,platformCacheKey} from '@/lib/platform-policy';
import {canShowLaunchClaims, recordedBurns} from '@/lib/public-overview.mjs';
import {TOKEN_CREATION_ENABLED} from '@/lib/platform-settings.mjs';
import {HERO_FEATURES} from '@/lib/brand-presentation';

export const dynamic = 'force-dynamic';

export async function GET() {
 try {
  const db = database(), platformId = grainpadPlatformId().toBase58();
  const stats = await sharedMarketCache(db, `public-overview:v1:${platformId}`, async () => {
   const rows = await readLaunchRecords(bucket(), 'mainnet-beta', platformId);
   const official = await db.prepare('SELECT mint FROM official_token WHERE id=1').first();
   const receipts = official ? await db.prepare('SELECT kind, burned FROM treasury_receipts WHERE kind=?').bind('buyback').all() : null;
   return {
    launches: rows.length || null,
    // No volume indexer exists. Reserves and fee collections are not trade volume.
    volume: null,
    burned: receipts ? recordedBurns(receipts.results) : null,
   };
  }, {ttl:60_000, maxStale:300_000});
  // Read the existing platform cache; never add per-viewer RPC requests or alter verification.
  const [platformRow, official] = await Promise.all([
   db.prepare('SELECT value, updated_at, expires_at FROM market_cache WHERE key=?').bind(platformCacheKey(platformId)).first(),
   db.prepare('SELECT mint, pool, approval FROM official_token WHERE id=1').first(),
  ]);
  const verified = TOKEN_CREATION_ENABLED && canShowLaunchClaims(platformRow, official, platformId);
  return Response.json({...stats.data, checkedAt:new Date(stats.updatedAt).toISOString(), stale:stats.stale,
   claimsValidUntil:verified ? Number(platformRow?.updated_at) + 30_000 : 0,
   features:{pairedLaunches:verified && HERO_FEATURES.pairedLaunches, onChainRules:verified && HERO_FEATURES.onChainRules},
  }, {headers:{'Cache-Control':'no-store'}});
 } catch {
  return Response.json({launches:null, volume:null, burned:null, checkedAt:null, stale:true,
   features:{pairedLaunches:false, onChainRules:false},
  }, {status:503, headers:{'Cache-Control':'no-store'}});
 }
}
