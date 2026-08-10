// GET /api/v1/radar?entity=…&horizon=7&baseScore=50 - programmatic early-warning
// forecast. Keyless upstream (Wikipedia attention + GDELT tone); key-authed at
// the API edge. Honest not-collected when no public series exists.

import { NextResponse } from "next/server";
import { collectSignalContext } from "@/lib/signal-context";
import { forecastNarrativeRisk, reScoreRisk } from "@/lib/forecast/radar";
import { apiOk, apiError, apiOptions, withApiAuth } from "@/lib/api/respond";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export function OPTIONS() { return apiOptions(); }

export async function GET(req: Request) {
  return withApiAuth(req, async () => {
    const sp = new URL(req.url).searchParams;
    const entity = (sp.get("entity") || "").trim();
    if (entity.length < 2) return apiError(400, "Query param 'entity' is required (>= 2 chars).");
    const horizon = Number(sp.get("horizon"));
    const baseScore = Number(sp.get("baseScore"));

    const ctx = await collectSignalContext(entity);
    const wiki = ctx.signals.find((s) => s.key === "wikipedia");
    const tone = ctx.signals.find((s) => s.key === "gdelt-tone");
    const volume = (wiki?.collected ? wiki.series : []).map((p) => ({ date: p.date, value: p.value }));
    const toneSeries = (tone?.collected ? tone.series : []).map((p) => ({ date: p.date, value: p.value }));

    if (volume.length === 0) {
      return apiOk({
        entity,
        forecast: { available: false, reason: `No public attention series for “${entity}”.`, band: "Unknown" },
        sources: { wikipedia: !!wiki?.collected, tone: !!tone?.collected },
      });
    }
    const forecast = forecastNarrativeRisk({ volume, tone: toneSeries, horizonDays: isFinite(horizon) ? horizon : undefined });
    const reScore = isFinite(baseScore) ? reScoreRisk(baseScore, forecast) : undefined;
    return apiOk({ entity, forecast, reScore, sources: { wikipedia: !!wiki?.collected, tone: !!tone?.collected } });
  });
}
