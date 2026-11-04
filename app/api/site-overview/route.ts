import {verifiedCatalogWitnesses} from '@/lib/verified-monero-catalog.mjs';
import {recordLaunchConfirmations,countConfirmedLaunches,readIndexedVolume} from '@/lib/site-stats.mjs';
import {loadQuoteUsd} from '@/lib/quote-usd.mjs';
import {database} from '@/lib/server-owner';
import {readSupplyBurn} from '@/lib/server-homepage';

import {sharedMarketCache} from '@/lib/server-cache';
import {grainpadPlatformId,platformCacheKey} from '@/lib/platform-policy';
import {canShowLaunchClaims,ageOverview,overviewRefreshFailed,OVERVIEW_TTL_MS} from '@/lib/public-overview.mjs';
import {TOKEN_CREATION_ENABLED} from '@/lib/platform-settings.mjs';
import {PREVIOUS_OFFICIAL_MINTS} from '@/lib/previous-official-mints.mjs';
import {HERO_FEATURES} from '@/lib/brand-presentation';

export const dynamic = 'force-dynamic';

export async function GET() {
 try {
  const db = database(), platformId = grainpadPlatformId().toBase58();
  const stats = await sharedMarketCache(db, `public-overview:v7:${platformId}`, async () => {
   const retired=PREVIOUS_OFFICIAL_MINTS.map(row=>row.mint);
   // Keep each fresh ten-confirmation witness; the count no longer drops a launch when its observation ages out.
   try{await recordLaunchConfirmations(db,await verifiedCatalogWitnesses(db,{network:'mainnet-beta'}));}catch{/* Unrecorded launches show as awaiting confirmation. */}
   let prices=null;
   try{prices=await loadQuoteUsd(db);}catch{prices=null;}
   // Each figure stands alone: one failing source never blanks the others.
   const [launches,volume,burn,paid]=await Promise.allSettled([
    countConfirmedLaunches(db,platformId,retired),
    // Every confirmed launch's finalized indexed trades; reserves and collected taxes are never volume.
    readIndexedVolume(db,platformId,{retired,prices}),
    readSupplyBurn(db),
    Promise.resolve(null),
   ]);
   const supply=burn.status==='fulfilled'?burn.value:null;
   return {...(launches.status==='fulfilled'?launches.value:{launches:null,launchesAwaiting:null,launchesUnresolved:null}),
    ...(volume.status==='fulfilled'?volume.value:{volume:null,volumeTokens:0,volumeCoverage:'partial',volumeIndexedThrough:null,volumeSource:'indexed-trades'}),
    burned:supply?.burned??null,
    paid:null,
    burn:supply?{source:'mint-supply',initialSupply:supply.initialSupply,currentSupply:supply.currentSupply,decimals:supply.decimals,slot:supply.slot,checkedAt:new Date(supply.checkedAt).toISOString(),stale:supply.stale}:null};
  }, {ttl:OVERVIEW_TTL_MS, maxStale:300_000});
  // Each figure ages from its own evidence time, not the overview refresh: an older burn read is marked and
  // past its limit withheld; volume completeness lapses with its coverage proof.
  const now=Date.now(),aged=ageOverview(stats.data,now);
  // Read the existing platform cache; never add per-viewer RPC requests or alter verification.
  const [platformRow, official] = await Promise.all([
   db.prepare('SELECT value, updated_at, expires_at FROM market_cache WHERE key=?').bind(platformCacheKey(platformId)).first(),
   db.prepare('SELECT mint, pool, approval FROM official_token WHERE id=1').first(),
  ]);
  const verified = TOKEN_CREATION_ENABLED && canShowLaunchClaims(platformRow, official, platformId);
  return Response.json({...aged, servedAt:new Date(now).toISOString(), checkedAt:new Date(stats.updatedAt).toISOString(), stale:overviewRefreshFailed(stats),
   claimsValidUntil:verified ? Number(platformRow?.updated_at) + 30_000 : 0,
   features:{pairedLaunches:verified && HERO_FEATURES.pairedLaunches, onChainRules:verified && HERO_FEATURES.onChainRules},
  }, {headers:{'Cache-Control':'no-store'}});
 } catch {
  return Response.json({launches:null, volume:null, burned:null, checkedAt:null, stale:true,
   features:{pairedLaunches:false, onChainRules:false},
  }, {status:503, headers:{'Cache-Control':'no-store'}});
 }
}
