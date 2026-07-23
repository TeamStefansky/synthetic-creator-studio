// Polymarket prediction-market adapter - one shared, reusable module for every
// tool that has a query/entity (Brand Mentions, SIGNAL, Geopolitics). Official
// keyless read API (Gamma). Real-money market probabilities are a forward-looking
// signal; we surface the market question + current probability + volume + a link
// to the source market, never a claim that the outcome is certain.

import { getJson } from "@/lib/http";

export interface PredictionMarket {
  id: string;
  question: string;
  url: string;
  /** Yes-side probability 0-1 (null when unavailable). */
  probability: number | null;
  volume24h: number | null;
  endDate?: string;
}

const GAMMA = "https://gamma-api.polymarket.com/markets";
const UA = "TruthLens/0.1 (prediction-market context)";

function terms(query: string): string[] {
  return query.toLowerCase().replace(/["']/g, " ").split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 2);
}

/** Filter + normalize raw Gamma markets to those matching the query. Pure. */
export function filterMarkets(raw: any[], query: string, limit = 12): PredictionMarket[] {
  const want = terms(query);
  const out: PredictionMarket[] = [];
  for (const m of Array.isArray(raw) ? raw : []) {
    const q = String(m?.question || "");
    const hay = q.toLowerCase();
    if (want.length && !want.some((t) => hay.includes(t))) continue;
    let prob: number | null = null;
    try {
      const prices = typeof m.outcomePrices === "string" ? JSON.parse(m.outcomePrices) : m.outcomePrices;
      if (Array.isArray(prices) && prices.length) { const p = Number(prices[0]); prob = isFinite(p) ? p : null; }
    } catch { prob = null; }
    out.push({
      id: String(m?.id || m?.slug || q),
      question: q,
      url: m?.slug ? `https://polymarket.com/market/${m.slug}` : "https://polymarket.com",
      probability: prob,
      volume24h: m?.volume24hr != null ? Number(m.volume24hr) : null,
      endDate: m?.endDate || m?.startDate,
    });
    if (out.length >= limit) break;
  }
  // Highest 24h volume first (most liquid = most informative), then soonest end.
  return out.sort((a, b) => (b.volume24h ?? -1) - (a.volume24h ?? -1));
}

/** Search Polymarket for active markets matching a query. Keyless; over-fetch by
 * volume then keyword-filter (Gamma has no full-text search). */
export async function searchPredictions(query: string, limit = 12): Promise<PredictionMarket[]> {
  const url = `${GAMMA}?closed=false&order=volume24hr&ascending=false&limit=${Math.min(500, limit * 20)}`;
  const raw = await getJson<any>(url, { timeoutMs: 15000, headers: { "User-Agent": UA } });
  return filterMarkets(raw, query, limit);
}
