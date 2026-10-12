import {database} from '@/lib/server-owner';
import {readOverviewVolume} from '@/lib/server-homepage';

import {sharedMarketCache} from '@/lib/server-cache';
import {grainpadPlatformId,platformCacheKey} from '@/lib/platform-policy';
import {canShowLaunchClaims, recordedBurns} from '@/lib/public-overview.mjs';
import {TOKEN_CREATION_ENABLED} from '@/lib/platform-settings.mjs';
import {PREVIOUS_OFFICIAL_MINTS} from '@/lib/previous-official-mints.mjs';
import {HERO_FEATURES} from '@/lib/brand-presentation';

export const dynamic = 'force-dynamic';

export async function GET() {
 try {
  const db = database(), platformId = grainpadPlatformId().toBase58();
  const stats = await sharedMarketCache(db, `public-overview:v4:${platformId}`, async () => {
   const retired=PREVIOUS_OFFICIAL_MINTS.map(row=>row.mint);
   const count = await db.prepare(`SELECT count(*) AS total FROM launch_index WHERE network=? AND platform_id=?${retired.length?` AND mint NOT IN (${retired.map(()=>'?').join(',')})`:''}`).bind('mainnet-beta',platformId,...retired).first<{total:number}>();
   const official = await db.prepare('SELECT mint FROM official_token WHERE id=1').first<{mint:string}>();
   const [receipts, rewards] = official ? await Promise.all([
    db.prepare('SELECT signature, kind, burned FROM treasury_receipts WHERE kind=?').bind('buyback').all(),
    // This public store is written only after finalized chain verification. No RPC per viewer.
    db.prepare('SELECT signature, mint, kind, slot, record, verified_at FROM holder_reward_receipt WHERE kind=? AND verified_at>0').bind('burn').all(),
   ]) : [null, null];
   const volume = await readOverviewVolume(db,platformId);
   return {
    launches: count?.total ?? null,
    // Available trade-volume observations, never reserves or collected taxes.
    ...volume,
    burned: receipts ? recordedBurns(receipts.results, rewards?.results ?? [], official?.mint) : null,
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
