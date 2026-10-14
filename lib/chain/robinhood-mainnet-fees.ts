/** Owner-selected on 2026-10-13. Mainnet only; testnet sample rates are separate. */
export const ROBINHOOD_MAINNET_FEES = Object.freeze({
  platformFeeBps: 35, creatorFeeBps: 65, tradeFeeBps: 0, totalFeeBps: 100,
});

/** Fail closed if a deployment proposal changes or adds to the approved curve fees. */
export function assertRobinhoodMainnetFees(input: {platformFeeBps: number; creatorFeeBps: number; tradeFeeBps: number}) {
  for (const key of ["platformFeeBps", "creatorFeeBps", "tradeFeeBps"] as const) {
    if (!Number.isInteger(input[key]) || input[key] !== ROBINHOOD_MAINNET_FEES[key]) throw new Error("Mainnet fee proposal differs from the owner-selected 35/65/0 bps policy.");
  }
}

/** Exact quote-asset arithmetic; amounts are uint256 base units, never floats. */
export function splitRobinhoodMainnetFees(amount: bigint) {
  if (typeof amount !== "bigint" || amount < 0n || amount > (1n << 256n) - 1n) throw new Error("Quote amount must be uint256 base units.");
  const platformFee = amount * BigInt(ROBINHOOD_MAINNET_FEES.platformFeeBps) / 10000n;
  const creatorFee = amount * BigInt(ROBINHOOD_MAINNET_FEES.creatorFeeBps) / 10000n;
  return {platformFee, creatorFee, net: amount - platformFee - creatorFee};
}
