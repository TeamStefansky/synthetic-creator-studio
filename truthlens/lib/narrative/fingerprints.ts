// Temporal fingerprints - pure functions, no network. Classic influence-op tells:
// synchronized bursts, posting-hour concentration inconsistent with an organic
// spread, and account-creation clustering. Every output is an indicator with
// level + evidence + an innocent alternative; timing NEVER maps to a country.

export const BURST_WINDOW_MIN = 10;
export const HOUR_BAND_HOURS = 9;         // contiguous UTC band width
export const HOUR_BAND_MIN_SHARE = 0.7;   // ≥70% of posts inside the band …
export const HOUR_BAND_MIN_DAYS = 3;      // … sustained across ≥3 days
export const CREATION_WINDOW_DAYS = 14;
export const CREATION_MIN_ACCOUNTS = 3;

export interface TimedItem { t: number; account: string }

/** Synchronized-burst detection, O(n log n): sort + O(n) two-pointer window with
 * a running distinct-account count. Returns burst count and largest window. */
export function detectBursts(items: TimedItem[], windowMin = BURST_WINDOW_MIN): { bursts: number; biggest: number } {
  const arr = items.filter((x) => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
  const windowMs = windowMin * 60_000;
  const freq = new Map<string, number>();
  let lo = 0, distinct = 0, bursts = 0, biggest = 0;
  for (let hi = 0; hi < arr.length; hi++) {
    const a = arr[hi].account;
    const f = (freq.get(a) || 0) + 1; freq.set(a, f); if (f === 1) distinct++;
    while (arr[hi].t - arr[lo].t > windowMs) {
      const la = arr[lo].account;
      const lf = (freq.get(la) || 0) - 1; freq.set(la, lf); if (lf === 0) distinct--;
      lo++;
    }
    const size = hi - lo + 1;
    if (size >= 3 && distinct >= 2) { bursts++; biggest = Math.max(biggest, size); }
  }
  return { bursts, biggest };
}

/** Posting-hour concentration: the busiest contiguous HOUR_BAND_HOURS-wide UTC
 * band (circular), its share of posts, and how many distinct days it spans. */
export function hourBandConcentration(timestamps: number[]): {
  share: number; days: number; band: [number, number]; count: number; total: number;
} {
  const ts = timestamps.filter(Number.isFinite);
  const total = ts.length;
  if (!total) return { share: 0, days: 0, band: [0, 0], count: 0, total: 0 };
  const hist = new Array(24).fill(0);
  const dates = new Set<string>();
  for (const t of ts) {
    const d = new Date(t);
    hist[d.getUTCHours()]++;
    dates.add(d.toISOString().slice(0, 10));
  }
  let best = 0, bestStart = 0;
  for (let s = 0; s < 24; s++) {
    let sum = 0;
    for (let k = 0; k < HOUR_BAND_HOURS; k++) sum += hist[(s + k) % 24];
    if (sum > best) { best = sum; bestStart = s; }
  }
  return {
    share: best / total, days: dates.size,
    band: [bestStart, (bestStart + HOUR_BAND_HOURS) % 24], count: best, total,
  };
}

/** Account-creation clustering: the largest set of accounts created within a
 * CREATION_WINDOW_DAYS window. `dates` = creation ISO strings (undefined dropped). */
export function creationClustering(dates: (string | undefined)[]): {
  collected: number; clustered: number; windowDays: number; earliest?: string; latest?: string;
} {
  const ms = dates.filter(Boolean).map((d) => Date.parse(d!)).filter(Number.isFinite).sort((a, b) => a - b);
  const windowMs = CREATION_WINDOW_DAYS * 86_400_000;
  let best = 0, bestLo = 0, bestHi = 0, lo = 0;
  for (let hi = 0; hi < ms.length; hi++) {
    while (ms[hi] - ms[lo] > windowMs) lo++;
    if (hi - lo + 1 > best) { best = hi - lo + 1; bestLo = lo; bestHi = hi; }
  }
  return {
    collected: ms.length, clustered: best, windowDays: CREATION_WINDOW_DAYS,
    earliest: ms.length ? new Date(ms[bestLo]).toISOString().slice(0, 10) : undefined,
    latest: ms.length ? new Date(ms[bestHi]).toISOString().slice(0, 10) : undefined,
  };
}
