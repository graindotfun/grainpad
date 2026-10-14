/** Shared launch and graduation time rules. Cards, the token page, the discovery filter and tests all read this module. */

/** How long a token carries the NEW badge, measured from its on-chain launch time. */
export const NEW_TOKEN_WINDOW_MS = 12 * 60 * 60 * 1000;
/** A timestamp this far ahead of the viewer's clock is treated as clock skew for relative labels only. */
const CLOCK_SKEW_MS = 60_000;
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Absolute epoch milliseconds, or null. Strings must be ISO-8601 with an explicit zone; numbers are epoch milliseconds. */
export function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string" || !ISO_WITH_ZONE.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/** NEW only inside [launch, launch + window). Missing, invalid and future launch times are never new. */
export function isNewLaunch(launchedAt: unknown, now: number, windowMs: number = NEW_TOKEN_WINDOW_MS): boolean {
  const launched = parseTimestamp(launchedAt);
  if (launched === null || !Number.isFinite(now)) return false;
  const age = now - launched;
  return age >= 0 && age < windowMs;
}

/** Epoch ms at which a launch stops being new, or null when it never was. */
export function newExpiry(launchedAt: unknown, windowMs: number = NEW_TOKEN_WINDOW_MS): number | null {
  const launched = parseTimestamp(launchedAt);
  return launched === null ? null : launched + windowMs;
}

/** `<1m`, `12m`, `2h 34m`, `1d 4h`. Null for invalid or negative durations. */
export function formatDuration(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

/** `just now`, `24 minutes ago`, `3 hours ago`, `8 days ago`, then weeks, months, years. Null when the time is invalid or in the future. */
export function formatRelativeTime(timestamp: unknown, now: number): string | null {
  const at = parseTimestamp(timestamp);
  if (at === null || !Number.isFinite(now)) return null;
  const elapsed = now - at;
  if (elapsed < -CLOCK_SKEW_MS) return null;
  const minutes = Math.floor(Math.max(0, elapsed) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 14) return plural(days, "day");
  if (days < 60) return plural(Math.floor(days / 7), "week");
  if (days < 365) return plural(Math.floor(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
}

/** `2026-10-14 09:30 UTC`, stable between server and browser. */
export function formatExactUtc(timestamp: unknown): string | null {
  const at = parseTimestamp(timestamp);
  return at === null ? null : `${new Date(at).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export type GraduationTiming = {
  /** Launch to graduation, for example `2h 34m`. Null unless both times are valid and ordered. */
  duration: string | null;
  /** Time since graduation, for example `8 days ago`. Null unless the graduation time is valid. */
  ago: string | null;
  /** Exact graduation time for a tooltip. */
  exact: string | null;
  /** ISO graduation time for a `dateTime` attribute. */
  iso: string | null;
};

/** Timing for a graduated token. The "ago" value counts from graduation, never from launch. Nothing is inferred when a timestamp is missing. */
export function graduationTiming(input: {launchedAt?: unknown; graduatedAt?: unknown; now: number}): GraduationTiming {
  const graduated = parseTimestamp(input.graduatedAt);
  // A graduation time ahead of the clock cannot be a past event; show no timing at all.
  if (graduated === null || graduated - input.now > CLOCK_SKEW_MS) return {duration: null, ago: null, exact: null, iso: null};
  const launched = parseTimestamp(input.launchedAt);
  return {
    duration: launched === null ? null : formatDuration(graduated - launched),
    ago: formatRelativeTime(graduated, input.now),
    exact: formatExactUtc(graduated),
    iso: new Date(graduated).toISOString(),
  };
}

/** Next epoch ms at which any displayed time label or NEW badge can change, or null. Drives precise live updates. */
export function nextTimeBoundary(now: number, times: readonly (number | null)[], windowMs: number = NEW_TOKEN_WINDOW_MS): number | null {
  let next: number | null = null;
  for (const time of times) {
    if (time === null || !Number.isFinite(time)) continue;
    const boundary = time + windowMs;
    if (boundary > now && (next === null || boundary < next)) next = boundary;
  }
  return next;
}
