// Attention + tone context for the SIGNAL console - REAL leading indicators
// from the operator's API catalog, replacing the uploaded dashboard's invented
// "trend vectors". Both sources are free, keyless, official endpoints:
//   - Wikipedia Pageviews (Wikimedia REST): public attention to the topic.
//   - GDELT DOC 2.0 timelinetone: average tone of global news coverage.
// Each degrades to a visible collected:false with a reason (rule 7). Direction
// is computed from the numbers, never asked from a model (rule 4).

import { getJson } from "@/lib/http";

export type TrendDirection = "up" | "down" | "flat";

export interface SeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface ContextSignal {
  key: "wikipedia" | "gdelt-tone";
  label: string;
  collected: boolean;
  reason?: string;
  /** Daily series, oldest -> newest (empty when not collected). */
  series: SeriesPoint[];
  /** Mean of the last 7 points vs. the prior 7 (null when too little data). */
  current: number | null;
  previous: number | null;
  changePct: number | null;
  direction: TrendDirection | null;
  note: string;
  sourceUrl?: string;
}

export interface SignalContext {
  entity: string;
  signals: ContextSignal[];
  generatedAt: string;
}

const UA = "TruthLens/0.1 (brand narrative monitoring)";

/** Split a series into (previous 7, last 7) means + direction. Pure. */
export function trendOf(series: SeriesPoint[]): {
  current: number | null; previous: number | null; changePct: number | null; direction: TrendDirection | null;
} {
  if (series.length < 4) return { current: null, previous: null, changePct: null, direction: null };
  const win = Math.min(7, Math.floor(series.length / 2));
  const last = series.slice(-win);
  const prior = series.slice(-win * 2, -win);
  const mean = (a: SeriesPoint[]) => a.reduce((s, p) => s + p.value, 0) / a.length;
  const current = mean(last);
  const previous = mean(prior);
  const changePct = previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
  let direction: TrendDirection = "flat";
  if (changePct !== null && changePct > 10) direction = "up";
  else if (changePct !== null && changePct < -10) direction = "down";
  return { current, previous, changePct, direction };
}

function notCollected(key: ContextSignal["key"], label: string, reason: string): ContextSignal {
  return { key, label, collected: false, reason, series: [], current: null, previous: null, changePct: null, direction: null, note: "" };
}

// ---- Wikipedia Pageviews (keyless, official Wikimedia REST) -------------------

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export async function wikipediaAttention(entity: string): Promise<ContextSignal> {
  const label = "Wikipedia attention";
  try {
    // Resolve the article title via the official opensearch endpoint.
    const search = await getJson<any>(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(entity)}&limit=1&namespace=0&format=json`,
      { timeoutMs: 10000, headers: { "User-Agent": UA } },
    );
    const title: string | undefined = search?.[1]?.[0];
    if (!title) return notCollected("wikipedia", label, `No Wikipedia article found for "${entity}".`);

    const end = new Date();
    end.setUTCDate(end.getUTCDate() - 1); // pageviews lag ~1 day
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 27); // 4 weeks -> two 7d windows + slack
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(
      title.replace(/ /g, "_"),
    )}/daily/${ymd(start)}/${ymd(end)}`;
    const data = await getJson<any>(url, { timeoutMs: 12000, headers: { "User-Agent": UA } });
    const series: SeriesPoint[] = (data?.items || []).map((it: any) => ({
      date: `${it.timestamp.slice(0, 4)}-${it.timestamp.slice(4, 6)}-${it.timestamp.slice(6, 8)}`,
      value: it.views || 0,
    }));
    if (!series.length) return notCollected("wikipedia", label, `No pageview data for "${title}".`);
    const t = trendOf(series);
    return {
      key: "wikipedia", label, collected: true, series, ...t,
      note: `Daily views of the "${title}" article - public attention, not sentiment.`,
      sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    };
  } catch (e: any) {
    return notCollected("wikipedia", label, `Pageviews unavailable: ${String(e?.message || "error").slice(0, 80)}.`);
  }
}

// ---- GDELT tone (keyless, official GDELT DOC 2.0) ------------------------------

export async function gdeltTone(entity: string): Promise<ContextSignal> {
  const label = "News tone (GDELT)";
  try {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(
      `"${entity}"`,
    )}&mode=timelinetone&format=json&timespan=4w`;
    const data = await getJson<any>(url, { timeoutMs: 15000, headers: { "User-Agent": UA } });
    const raw: any[] = data?.timeline?.[0]?.data || [];
    const series: SeriesPoint[] = raw
      .map((p: any) => ({ date: String(p.date || "").slice(0, 10).replace(/(\d{4})(\d{2})(\d{2}).*/, "$1-$2-$3"), value: Number(p.value) }))
      .filter((p) => p.date && isFinite(p.value));
    if (!series.length) return notCollected("gdelt-tone", label, "GDELT reported no tone series for this query.");
    const t = trendOf(series);
    return {
      key: "gdelt-tone", label, collected: true, series, ...t,
      note: "Average tone of global news coverage (GDELT scale, negative = harsher).",
    };
  } catch (e: any) {
    return notCollected("gdelt-tone", label, `GDELT tone unavailable: ${String(e?.message || "error").slice(0, 80)}.`);
  }
}

/** Collect all context signals in parallel; one failure never sinks the rest. */
export async function collectSignalContext(entity: string): Promise<SignalContext> {
  const [wiki, tone] = await Promise.all([wikipediaAttention(entity), gdeltTone(entity)]);
  return { entity, signals: [wiki, tone], generatedAt: new Date().toISOString() };
}
