import {QUOTES} from './quote-assets.mjs';

// Flipping the generic issuance switch cannot waive the required rewards system.
export const REWARDS_OPERATIONAL = false;
export function assertHolderRewardsOperational(){
  if(!REWARDS_OPERATIONAL)throw Error('Holder rewards and tax-funded GRAIN burns must be operational before token creation.');
}

/** Owner requirement, 29 Sep 2026: holder distribution is required before launch. */
export const REWARDS_POLICY = Object.freeze({
  version: 'wxmr-holders-v1',
  required: true,
  payoutMint: QUOTES.wXMR.mint,
  payoutDecimals: 12,
  quoteAsset: 'wXMR',
  // The program supports whole basis points. The launch slider moves by 0.1%.
  transferFeeBps: Object.freeze(Array.from({length:201},(_,i)=>100+i)),
  minimumTaxBps: 100,
  maximumTaxBps: 300,
  sliderStepBps: 10,
  baseTokenPayouts: false,
  creatorFeeRedirect: false,
  grainBuybackBurnRequired: true,
  revenueSplit: null,
});

export const REWARDS_RELEASE_CHECKS = Object.freeze([
  'policyApproved', 'grainpadPlatformAttributionVerified', 'grainpadCollectorControlVerified', 'taxedLaunchVerified', 'curveBuySellVerified',
  'graduatedBuySellVerified', 'withheldCollectionVerified',
  'wxmrConversionVerified', 'completeHolderSnapshotVerified',
  'proRataPayoutFinalized', 'duplicatePayoutRejected',
  'restartRecoveryVerified', 'schedulerVerified', 'signerConfigured',
  'publicReceiptsVerified', 'solOperatingBudgetFunded',
  'revenueSplitApproved', 'grainBuybackBurnFinalized', 'burnBudgetIsolated',
]);

export function assertRewardsRelease(evidence) {
  const missing = REWARDS_RELEASE_CHECKS.filter(k => evidence?.checks?.[k] !== true);
  if (evidence?.payoutMint !== REWARDS_POLICY.payoutMint) missing.push('wXMR-only payout');
  if (evidence?.network !== 'mainnet-beta') missing.push('mainnet proof');
  if (!evidence?.firstPayoutSignature) missing.push('first finalized payout receipt');
  if (missing.length) throw Error(`Holder rewards are not ready: ${missing.join(', ')}.`);
}
