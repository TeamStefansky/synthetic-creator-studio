// Early-Warning Radar API - forecasts narrative-escalation risk for a watch term
// from its recent PUBLIC signal history (keyless: Wikipedia attention + GDELT
// tone via lib/signal-context). The forecast is computed deterministically
// (lib/forecast/radar) and cached briefly for reproducibility. Honest
// not-collected when the upstream series are unavailable.

import { NextRequest, NextResponse } from "next/server";
import { collectSignalContext } from "@/lib/signal-context";
import { forecastNarrativeRisk, reScoreRisk } from "@/lib/forecast/radar";
import { cacheGet, cacheSet } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const CACHE_MS = 15 * 60_000; // same term → same forecast within the window
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: NextRequest) {
  const entity = (req.nextUrl.searchParams.get("entity") || "").trim();
  const baseScoreRaw = Number(req.nextUrl.searchParams.get("baseScore"));
  const horizon = Number(req.nextUrl.searchParams.get("horizon"));
  if (entity.length < 2) {
    return NextResponse.json({ error: "entity must be at least 2 characters" }, { status: 400, headers: NO_STORE });
  }

  const ck = `radar:${entity.toLowerCase()}:${isFinite(horizon) ? horizon : "d"}`;
  const cached = await cacheGet<any>(ck, CACHE_MS);
  if (cached) return NextResponse.json({ ...cached, cached: true }, { headers: NO_STORE });

  try {
    const ctx = await collectSignalContext(entity);
    const wiki = ctx.signals.find((s) => s.key === "wikipedia");
    const tone = ctx.signals.find((s) => s.key === "gdelt-tone");

    const volume = (wiki?.collected ? wiki.series : []).map((p) => ({ date: p.date, value: p.value }));
    const toneSeries = (tone?.collected ? tone.series : []).map((p) => ({ date: p.date, value: p.value }));

    if (volume.length === 0) {
      return NextResponse.json({
        entity,
        forecast: { available: false, reason: `No public attention series collected for “${entity}” (Wikipedia/GDELT not available for this term).`, band: "Unknown" },
        sources: { wikipedia: !!wiki?.collected, tone: !!tone?.collected },
        generatedAt: new Date().toISOString(),
      }, { headers: NO_STORE });
    }

    const forecast = forecastNarrativeRisk({ volume, tone: toneSeries, horizonDays: isFinite(horizon) ? horizon : undefined });
    const reScore = isFinite(baseScoreRaw) ? reScoreRisk(baseScoreRaw, forecast) : undefined;

    const payload = {
      entity,
      forecast,
      reScore,
      sources: { wikipedia: !!wiki?.collected, tone: !!tone?.collected },
      generatedAt: new Date().toISOString(),
    };
    await cacheSet(ck, payload);
    return NextResponse.json(payload, { headers: NO_STORE });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Radar forecast failed" }, { status: 500, headers: NO_STORE });
  }
}
