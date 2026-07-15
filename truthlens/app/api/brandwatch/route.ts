// Brand Watch — in-app, server-side. Collects public mentions of an entity
// across the narrative sources, scores the disinformation-attack indicators, and
// returns the result. All source/LLM access stays on the server. Runs on the
// same Vercel deployment as the rest of TruthLens — no external backend.

import { NextRequest, NextResponse } from "next/server";
import { collectMentions } from "@/lib/narrative/sources";
import { computeThreat } from "@/lib/narrative/threat";
import { extractNarratives } from "@/lib/narrative/clusters";
import { kvGetJson, kvSetJson, storeAvailable } from "@/lib/store";
import type { Mention, ThreatResult, NarrativeExtraction } from "@/lib/narrative/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_MS = 90_000; // short cache so auto-refresh doesn't hammer sources

export async function GET(req: NextRequest) {
  const entity = (req.nextUrl.searchParams.get("entity") || "").trim();
  // deep=1 adds the (paid, slower) LLM narrative layer — set on manual scans,
  // NOT on silent auto-refresh, and cached per day for reproducibility.
  const deep = req.nextUrl.searchParams.get("deep") === "1";
  if (entity.length < 2) {
    return NextResponse.json({ error: "entity must be at least 2 characters" }, { status: 400 });
  }
  const key = `bw:live:${entity.toLowerCase()}`;

  if (storeAvailable()) {
    const cached = await kvGetJson<ThreatResult>(key);
    if (cached && Date.now() - new Date(cached.generatedAt).getTime() < CACHE_MS && (!deep || cached.narratives)) {
      return NextResponse.json({ ...cached, cached: true });
    }
  }

  const results = await collectMentions(entity);
  const mentions: Mention[] = results.flatMap((r) => r.mentions);
  const result = computeThreat(entity, mentions, results.map((r) => r.status));

  if (deep) {
    const day = new Date().toISOString().slice(0, 10);
    const narrKey = `bw:narr:${entity.toLowerCase()}:${day}`;
    let narratives = storeAvailable() ? await kvGetJson<NarrativeExtraction>(narrKey) : null;
    if (!narratives) {
      narratives = await extractNarratives(entity, mentions);
      if (storeAvailable() && narratives.available) await kvSetJson(narrKey, narratives);
    }
    result.narratives = narratives;
  }

  if (storeAvailable()) await kvSetJson(key, result);
  return NextResponse.json(result);
}
