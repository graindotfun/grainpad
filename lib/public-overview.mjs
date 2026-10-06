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

/** Both stores contain finalized, chain-verified receipts, never pending worker plans.
 * Rewards' outer mint is the tax source; the nested receipt names the burn target.
 * An empty ledger stays unknown. Signatures deduplicate a transaction in both stores.
 * @param {string|null} officialMint
 */
export function recordedBurns(receipts, rewardReceipts = [], officialMint = null) {
 const burns = receipts.filter(row => row.kind === 'buyback').map(row => ({signature:row.signature,burned:row.burned}));
 for (const row of rewardReceipts) {
  if (row.kind !== 'burn' || !Number.isSafeInteger(row.verified_at) || row.verified_at <= 0) continue;
  const record = JSON.parse(row.record);
  if (!officialMint || record.receipt?.mint !== officialMint) continue;
  if (record.kind !== 'burn' || record.signature !== row.signature || record.mint !== row.mint
   || record.slot !== row.slot || record.receipt.slot !== row.slot || record.burnedRaw !== record.receipt.burnedRaw) throw Error('Invalid verified burn receipt');
  burns.push({signature:row.signature,burned:record.burnedRaw});
 }
 if (!burns.length) return null;
 let total = 0n;
 const seen = new Map();
 for (const row of burns) {
  if (typeof row.burned !== 'string' || !/^\d+$/.test(row.burned)) throw Error('Invalid recorded burn');
  if (row.signature && seen.has(row.signature)) {
   if (seen.get(row.signature) !== BigInt(row.burned)) throw Error('Conflicting recorded burn');
   continue;
  }
  if (row.signature) seen.set(row.signature,BigInt(row.burned));
  total += BigInt(row.burned);
 }
 return total.toString();
}

/** Exactly six decimals without converting atomic amounts through floating point. */
export function displayRecordedBurns(raw) {
 if (typeof raw !== 'string' || !/^\d+$/.test(raw)) throw Error('Invalid recorded burn');
 const amount = BigInt(raw);
 return `${amount / 1000000n}.${(amount % 1000000n).toString().padStart(6,'0')}`;
}
