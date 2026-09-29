export type MarketQuote = {
  priceUsd: number | null; marketCapUsd: number | null; change24h: number | null;
  pairAddress: string | null; fetchedAt: string | null;
};
export type TapeToken = MarketQuote & {official?:boolean;quoteAsset?:string;mint: string; name: string; symbol: string; image: string; createdAt: string};
export type TokenTapeData = {
  tokens: TapeToken[]; total: number; checkedAt: string;
  marketStatus: "ready" | "partial" | "unavailable" | "stale";
};
type DexPair = {
  chainId?: string; pairAddress?: string; baseToken?: {address?: string}; quoteToken?: {address?:string};
  priceUsd?: string; marketCap?: number | null; fdv?: number | null;
  priceChange?: {h24?: number | null}; liquidity?: {usd?: number | null}; volume?: {h24?: number};
};
export const emptyQuote = (): MarketQuote => ({priceUsd:null,marketCapUsd:null,change24h:null,pairAddress:null,fetchedAt:null});
const positive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

export function selectQuote(mint: string, pairs: unknown, fetchedAt: string,quoteMint?:string): MarketQuote {
  if (!Array.isArray(pairs)) return emptyQuote();
  const eligible = (pairs as DexPair[]).filter(pair => pair && pair.chainId === "solana"
    && pair.baseToken?.address === mint && (!quoteMint||pair.quoteToken?.address===quoteMint) && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pair.pairAddress || "")
    && positive(Number(pair.priceUsd)) !== null && positive(pair.liquidity?.usd) !== null);
  eligible.sort((a,b) => b.liquidity!.usd! - a.liquidity!.usd! || (positive(b.volume?.h24) || 0) - (positive(a.volume?.h24) || 0));
  const pair = eligible[0];
  if (!pair) return emptyQuote();
  const change = pair.priceChange?.h24;
  return {priceUsd: positive(Number(pair.priceUsd)), marketCapUsd: positive(pair.marketCap),
    // FDV is deliberately not used as a fallback for market cap.
    change24h: typeof change === "number" && Number.isFinite(change) ? change : null,
    pairAddress: pair.pairAddress!, fetchedAt};
}

export function formatMarketCap(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return "—";
  return new Intl.NumberFormat("en-US", {style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:2}).format(value);
}

export function formatChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value !== 0 && Math.abs(value) < 0.01) return value > 0 ? "+<0.01%" : "−<0.01%";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
}
