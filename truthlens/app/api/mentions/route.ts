// Brand Mentions - "where does my brand appear?". Reuses the narrative source
// layer (collectMentions) and returns a de-duplicated, most-recent-first list
// plus a by-source and by-country geographic breakdown. Public data only; cached
// briefly so repeated views do not hammer the sources (reproducibility).
//
// ?sentiment=1 additionally classifies the sentiment of the COLLECTED mentions
// toward the entity, server-side (lib/signal-sentiment). Per-mention labels with
// confidence; the overall score is computed from those labels, never invented.
// Without ANTHROPIC_API_KEY the sentiment block reports available:false - the
// mentions themselves are unaffected.

import { NextRequest, NextResponse } from "next/server";
import { collectMentions } from "@/lib/narrative/sources";
import { aggregateMentions, enrichMentionsForMap, type MapMention } from "@/lib/mentions-map";
import { classifySentiment, type SentimentResult, type SentimentSummary } from "@/lib/signal-sentiment";
import { clusterNarratives, type NarrativesResult } from "@/lib/signal-narratives";
import { cacheGet, cacheSet } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_MS = 90_000;
// Same mention set -> same labels; cache longer so repeat views within a
// session never re-spend LLM calls (reproducibility + rate discipline).
const SENTIMENT_CACHE_MS = 15 * 60_000;

function idsHash(mentions: MapMention[]): string {
  let h = 0;
  for (const m of mentions) {
    const s = m.id || m.url || "";
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** Attach per-mention labels + return the summary (labels array not exposed
 * separately - each label lives on its mention, traceable to its source). */
function applySentiment(mentions: MapMention[], result: SentimentResult): SentimentSummary {
  const byId = new Map(result.labels.map((l) => [l.id, l]));
  for (const m of mentions) {
    const l = byId.get(m.id || m.url || "");
    if (l) {
      (m as any).sentiment = l.label;
      (m as any).sentimentConfidence = l.confidence;
    }
  }
  const { labels: _labels, ...summary } = result;
  return summary;
}

export async function GET(req: NextRequest) {
  const entity = (req.nextUrl.searchParams.get("entity") || "").trim();
  const wantSentiment = req.nextUrl.searchParams.get("sentiment") === "1";
  const wantNarratives = req.nextUrl.searchParams.get("narratives") === "1";
  if (entity.length < 2) {
    return NextResponse.json({ error: "entity must be at least 2 characters" }, { status: 400 });
  }

  const ck = `mentions:${entity.toLowerCase()}`;
  let out = await cacheGet<any>(ck, CACHE_MS);
  let fromCache = !!out;

  if (!out) {
    try {
      const results = await collectMentions(entity);
      const agg = aggregateMentions(results);
      // Enrich each mention with a sourceType + a plottable lat/lon (country
      // centroid or the outlet's home country) so map-based clients get ready-
      // to-plot data. MapMention extends Mention; list consumers unaffected.
      out = {
        entity,
        ...agg,
        mentions: enrichMentionsForMap(agg.mentions),
        generatedAt: new Date().toISOString(),
      };
      await cacheSet(ck, out);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Mention scan failed" }, { status: 500 });
    }
  }

  if (!wantSentiment && !wantNarratives) return NextResponse.json({ ...out, cached: fromCache });

  const mentions: MapMention[] = out.mentions || [];
  const mhash = idsHash(mentions);

  // AI layers are cached separately, keyed by the exact mention set, so a
  // repeat view of the same scan reuses the same result (reproducibility).
  // Both run in parallel; transient failures (rate limit etc.) are not cached
  // so a retry can succeed.
  const cacheable = (reason?: string) => /not connected|No mention text|Not enough/i.test(reason || "");
  const [sentiment, narratives] = await Promise.all([
    (async (): Promise<SentimentResult | null> => {
      if (!wantSentiment) return null;
      const sk = `sentiment:${entity.toLowerCase()}:${mhash}`;
      let s = await cacheGet<SentimentResult>(sk, SENTIMENT_CACHE_MS);
      if (!s) {
        s = await classifySentiment(entity, mentions);
        if (s.available || cacheable(s.reason)) await cacheSet(sk, s);
      }
      return s;
    })(),
    (async (): Promise<NarrativesResult | null> => {
      if (!wantNarratives) return null;
      const nk = `narratives:${entity.toLowerCase()}:${mhash}`;
      let n = await cacheGet<NarrativesResult>(nk, SENTIMENT_CACHE_MS);
      if (!n) {
        n = await clusterNarratives(entity, mentions);
        if (n.available || cacheable(n.reason)) await cacheSet(nk, n);
      }
      return n;
    })(),
  ]);

  // Work on a copy so the enrichment-free cached aggregate stays pristine.
  const withLabels = mentions.map((m) => ({ ...m }));
  const payload: any = { ...out, mentions: withLabels, cached: fromCache };
  if (sentiment) payload.sentiment = applySentiment(withLabels, sentiment);
  if (narratives) payload.narratives = narratives;
  return NextResponse.json(payload);
}
