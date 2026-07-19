// Brand Watch — in-app, server-side. Collects public mentions of an entity
// across the narrative sources, scores the disinformation-attack indicators, and
// returns the result. All source/LLM access stays on the server. Runs on the
// same Vercel deployment as the rest of TruthLens — no external backend.

import { NextRequest, NextResponse } from "next/server";
import { collectMentions } from "@/lib/narrative/sources";
import { computeThreat } from "@/lib/narrative/threat";
import { extractNarratives } from "@/lib/narrative/clusters";
import { foreignEnrichment } from "@/lib/narrative/foreign";
import { detectMirroring } from "@/lib/narrative/mirroring";
import { kvGetJson, kvSetJson, storeAvailable } from "@/lib/store";
import type { Mention, ThreatResult, NarrativeExtraction, ForeignEnrichment, MirroringResult } from "@/lib/narrative/types";

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
  const day = new Date().toISOString().slice(0, 10);

  // The deep foreign-influence layer (infrastructure OSINT + LLM cross-language
  // mirroring) only runs on manual deep scans, and is cached per day so a report
  // for a given day is reproducible. Silent auto-refresh stays lexical-only.
  let foreign: ForeignEnrichment | undefined;
  let mirroring: MirroringResult | undefined;
  if (deep) {
    const fKey = `bw:foreign:${entity.toLowerCase()}:${day}`;
    const mKey = `bw:mirror:${entity.toLowerCase()}:${day}`;
    foreign = (storeAvailable() ? await kvGetJson<ForeignEnrichment>(fKey) : null) || undefined;
    if (!foreign) {
      foreign = await foreignEnrichment(mentions);
      if (storeAvailable() && foreign) await kvSetJson(fKey, foreign);
    }
    mirroring = (storeAvailable() ? await kvGetJson<MirroringResult>(mKey) : null) || undefined;
    if (!mirroring) {
      mirroring = await detectMirroring(entity, mentions);
      if (storeAvailable() && mirroring.available) await kvSetJson(mKey, mirroring);
    }
  }

  const result = computeThreat(entity, mentions, results.map((r) => r.status), undefined, { foreign, mirroring });

  if (deep) {
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
