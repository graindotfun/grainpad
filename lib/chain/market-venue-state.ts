/**
 * Which venue a displayed price belongs to. An initialized Uniswap v3 pool has a price (slot0) from the moment it is
 * created, even with zero liquidity and zero trades. That number is a configured starting point, not an observation.
 */
export type VenueState = "curve_trading" | "pool_initialized_no_liquidity" | "pool_active";

export type VenueFacts = {
  graduated: boolean;
  poolInitialized: boolean;
  /** Pool `liquidity()` (in-range). */
  poolLiquidity: bigint;
  /** Count of pool Swap events observed by our indexer (never synthesized). */
  observedSwaps: number;
};

export function venueState(f: VenueFacts): VenueState {
  if (!f.graduated) return "curve_trading";
  if (!f.poolInitialized || f.poolLiquidity <= 0n) return "pool_initialized_no_liquidity";
  return "pool_active";
}

export type PriceLabel = {
  source: "curve" | "pool_initial_price" | "pool_observed";
  /** May this value be shown as "price" / "market cap" without a qualifier? */
  presentAsObserved: boolean;
  caption: string;
};

/** Before graduation the pool is initialized (by the contract, to stop pre-initialization attacks) but has no liquidity. */
export function priceLabel(f: VenueFacts): PriceLabel {
  const state = venueState(f);
  if (state === "curve_trading") {
    return {source: "curve", presentAsObserved: false, caption: "Curve-implied price. The Uniswap pool is initialized but holds no liquidity and has not traded."};
  }
  if (state === "pool_initialized_no_liquidity") {
    return {source: "pool_initial_price", presentAsObserved: false, caption: "Initialization price only. No liquidity, no observed trades."};
  }
  if (f.observedSwaps === 0) {
    return {source: "pool_initial_price", presentAsObserved: false, caption: "Liquidity is in the pool; no swap has been observed yet."};
  }
  return {source: "pool_observed", presentAsObserved: true, caption: "Last observed pool swap."};
}

/** Valuation (price x total supply) is always a derived figure; never present it as traded value unless observed. */
export function valuationCaption(f: VenueFacts): string {
  return priceLabel(f).presentAsObserved ? "Market cap from the last observed pool swap" : "Implied valuation, not a traded market cap";
}
