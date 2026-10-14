/** Where a graduated token trades. Derived from the verified migrated pool, never hard-coded in a component.
 * Grainpad launches migrate into a Raydium CPMM pool (the snapshot reader rejects any other pool owner), so route `cpmm` means Raydium. */
export type TradingVenue = {id: "raydium"; label: "Raydium"; href: string | null};

export function tradingVenue(input: {route?: string | null; state?: string | null; mint?: string; quoteMint?: string | null}): TradingVenue | null {
  if (input.route !== "cpmm" && input.state !== "graduated") return null;
  const href = input.mint && input.quoteMint
    ? `https://raydium.io/swap/?inputMint=${encodeURIComponent(input.quoteMint)}&outputMint=${encodeURIComponent(input.mint)}`
    : null;
  return {id: "raydium", label: "Raydium", href};
}
