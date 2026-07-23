// Anomaly detection over the SIGNAL console's collected time series - the
// "next stage" above raw collection + sentiment. Pure statistics (rolling
// z-score) over REAL series only:
//   - daily mention volume (from the collected mentions),
//   - Wikipedia attention + GDELT news-tone (from /api/signal-context).
// No fabrication: a series with too little history returns status "insufficient"
// (an honest Unknown, rule 4), never a made-up spike. This is decision-support -
// a flag with the numbers behind it, never a verdict.

import type { SeriesPoint } from "./signal-context";
import type { Mention } from "./narrative/types";

export type AnomalyStatus = "spike" | "drop" | "normal" | "insufficient";

export interface AnomalyResult {
  status: AnomalyStatus;
  /** Latest observed value + the baseline it is judged against. */
  latest: number | null;
  baselineMean: number | null;
  baselineStd: number | null;
  /** Standard deviations from the baseline (signed; null when insufficient). */
  z: number | null;
  /** Points of history used for the baseline. */
  window: number;
  note: string;
}

export interface SeriesAnomaly extends AnomalyResult {
  key: string;
  label: string;
  /** Higher = more unusual; used to sort the anomaly list. Abs(z), 0 if none. */
  magnitude: number;
}

/** Minimum baseline points before we will call anything (below this = Unknown). */
export const MIN_BASELINE = 5;
const DEFAULT_THRESHOLD = 2.0; // |z| >= 2 sigma

function mean(a: number[]): number {
  return a.reduce((s, v) => s + v, 0) / a.length;
}
function std(a: number[], m: number): number {
  if (a.length < 2) return 0;
  const v = a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1);
  return Math.sqrt(v);
}

/** Roll a z-score on the LAST point against the mean/std of the points before
 * it. Pure; no time assumptions beyond "series is oldest -> newest". */
export function detectAnomaly(series: SeriesPoint[], threshold = DEFAULT_THRESHOLD): AnomalyResult {
  if (series.length < MIN_BASELINE + 1) {
    return { status: "insufficient", latest: null, baselineMean: null, baselineStd: null, z: null, window: Math.max(0, series.length - 1), note: `Need ${MIN_BASELINE + 1}+ points; have ${series.length}.` };
  }
  const values = series.map((p) => p.value);
  const latest = values[values.length - 1];
  const baseline = values.slice(0, -1);
  const m = mean(baseline);
  const sd = std(baseline, m);
  if (sd === 0) {
    // Flat baseline: only call it if the latest actually differs.
    const changed = latest !== m;
    return {
      status: changed ? (latest > m ? "spike" : "drop") : "normal",
      latest, baselineMean: m, baselineStd: 0, z: changed ? (latest > m ? Infinity : -Infinity) : 0,
      window: baseline.length,
      note: changed ? "Flat baseline broken by the latest point." : "No variation in the series.",
    };
  }
  const z = (latest - m) / sd;
  let status: AnomalyStatus = "normal";
  if (z >= threshold) status = "spike";
  else if (z <= -threshold) status = "drop";
  const pct = m === 0 ? null : Math.round(((latest - m) / Math.abs(m)) * 100);
  const note =
    status === "normal"
      ? `Within normal range (${z.toFixed(1)}σ from baseline).`
      : `${status === "spike" ? "Above" : "Below"} baseline by ${Math.abs(z).toFixed(1)}σ${pct !== null ? ` (${pct > 0 ? "+" : ""}${pct}%)` : ""}.`;
  return { status, latest, baselineMean: m, baselineStd: sd, z, window: baseline.length, note };
}

/** Daily mention-volume series from collected mentions (oldest -> newest). */
export function dailyVolume(mentions: Mention[]): SeriesPoint[] {
  const byDay = new Map<string, number>();
  for (const m of mentions) {
    if (!m.timestamp) continue;
    const d = new Date(m.timestamp);
    if (isNaN(d.getTime())) continue;
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) || 0) + 1);
  }
  return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, value }));
}

/** Run anomaly detection across the console's series and rank by magnitude.
 * `contextSignals` are the collected series from /api/signal-context. */
export function anomalyReport(
  mentions: Mention[],
  contextSignals: { key: string; label: string; collected: boolean; series: SeriesPoint[] }[],
  threshold = DEFAULT_THRESHOLD,
): SeriesAnomaly[] {
  const out: SeriesAnomaly[] = [];
  const vol = dailyVolume(mentions);
  const volA = detectAnomaly(vol, threshold);
  out.push({ key: "volume", label: "Mention volume", ...volA, magnitude: volA.z === null ? 0 : Math.min(99, Math.abs(volA.z)) });
  for (const s of contextSignals) {
    if (!s.collected) {
      out.push({ key: s.key, label: s.label, status: "insufficient", latest: null, baselineMean: null, baselineStd: null, z: null, window: 0, magnitude: 0, note: "Series not collected." });
      continue;
    }
    const a = detectAnomaly(s.series, threshold);
    out.push({ key: s.key, label: s.label, ...a, magnitude: a.z === null ? 0 : Math.min(99, Math.abs(a.z)) });
  }
  // Anomalies first (by magnitude), then normal, then insufficient.
  const rank = (s: SeriesAnomaly) => (s.status === "spike" || s.status === "drop" ? 2 : s.status === "normal" ? 1 : 0);
  return out.sort((a, b) => rank(b) - rank(a) || b.magnitude - a.magnitude);
}
