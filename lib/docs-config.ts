// Editorial dates are explicit: never use a build date or the visitor's clock.
export const DOCS = {
  lastUpdated: "2026-09-29",
  // Set YYYY-MM-DD after verifying the activation transaction on mainnet.
  // /api/platform must also confirm the current policy before Docs says Active.
  feesActiveSince: null as string | null,
};

export function docsDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
