/** Marketing claims fail closed on missing, stale, or mismatched evidence. */
export function canShowLaunchClaims(platformRow, official, expectedPlatform, now = Date.now()) {
 try {
  if (!platformRow?.value || !Number.isFinite(platformRow.updated_at) || !Number.isFinite(platformRow.expires_at)
   || platformRow.expires_at <= now || platformRow.updated_at > now || now - platformRow.updated_at >= 30_000) return false;
  const platform = JSON.parse(platformRow.value);
  const verification = JSON.parse(official?.approval || '{}').verification;
  return Boolean(expectedPlatform) && platform.platformId === expectedPlatform
   && platform.active === true && platform.policyMatches === true && !platform.stale
   && platform.kind === 'grainpad'
   && platform.restrictionFlags?.globalConfig === 1 && platform.restrictionFlags?.curveParam === 1
   && Array.isArray(platform.rules)
   && (platform.rewards?.configurationReady===true
    ? platform.rewards.operational===true&&platform.rules.length===1&&platform.rules[0].symbol==='wXMR'
    : platform.rules.length===2&&['SOL','wXMR'].every(symbol=>platform.rules.some(rule=>rule.symbol===symbol)))
   && verification?.status === 'PASS' && verification.readOnly === true
   && Array.isArray(verification.checks) && verification.checks.length > 0
   && verification.checks.every(check => check.status === 'PASS')
   && verification.mint === official?.mint && verification.pool === official?.pool
   && verification.platform === platform.platformId;
 } catch { return false; }
}

/** An empty or unavailable ledger is unknown here, not a fabricated zero. */
export function recordedBurns(receipts) {
 const burns = receipts.filter(row => row.kind === 'buyback');
 if (!burns.length) return null;
 let total = 0n;
 for (const row of burns) {
  if (typeof row.burned !== 'string' || !/^\d+$/.test(row.burned)) throw Error('Invalid recorded burn');
  total += BigInt(row.burned);
 }
 return total.toString();
}
