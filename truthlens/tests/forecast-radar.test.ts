// Early-Warning Radar forecaster. Gates: below the data floor → Unknown (never a
// guess); a flat/quiet series → Calm with the baseline logged (value in quiet
// periods); an accelerating + harshening series → Elevated/Warning with the
// growth indicator dominant; every forecast carries confidence + evidence + an
// alternative; deterministic (same history → same forecast); the re-score is
// bounded and reversible.

import { describe, it, expect } from "vitest";
import {
  forecastNarrativeRisk,
  reScoreRisk,
  updateBaseline,
  RADAR_MIN_POINTS,
  RESCORE_MAX_DELTA,
  BAND_THRESHOLDS,
} from "@/lib/forecast/radar";

const flat = (n: number, v = 10) => Array.from({ length: n }, () => ({ value: v }));
const ramp = (n: number) => Array.from({ length: n }, (_, i) => ({ value: Math.round(4 * Math.pow(1.6, i)) }));

describe("forecastNarrativeRisk", () => {
  it("returns Unknown below the data floor (never a forecast from a handful of points)", () => {
    const f = forecastNarrativeRisk({ volume: flat(RADAR_MIN_POINTS - 1) });
    expect(f.available).toBe(false);
    expect(f.band).toBe("Unknown");
    expect(f.reason).toMatch(/history points/i);
  });

  it("a quiet, flat series → Calm, and logs the baseline (value in quiet periods)", () => {
    const f = forecastNarrativeRisk({ volume: flat(20, 12) });
    expect(f.available).toBe(true);
    expect(f.band).toBe("Calm");
    expect(f.hazard).toBeLessThan(BAND_THRESHOLDS.watch);
    expect(f.evidence.join(" ")).toMatch(/quiet-period baseline/i);
    expect(f.alternative).toMatch(/organic news cycle|not proof/i);
  });

  it("an accelerating volume curve raises the hazard, growth indicator present", () => {
    const f = forecastNarrativeRisk({ volume: ramp(12) });
    expect(f.available).toBe(true);
    expect(f.hazard).toBeGreaterThan(BAND_THRESHOLDS.watch);
    expect(f.indicators.some((i) => i.key === "growth" && i.contribution > 0)).toBe(true);
    expect(["Watch", "Elevated", "Warning"]).toContain(f.band);
    expect(f.estimative).toBeTruthy();
  });

  it("accelerating volume + harshening tone escalates further than volume alone", () => {
    const volume = ramp(14);
    const calmTone = flat(14, 0);
    const harshTone = Array.from({ length: 14 }, (_, i) => ({ value: -i * 0.6 })); // increasingly negative
    const base = forecastNarrativeRisk({ volume, tone: calmTone });
    const worse = forecastNarrativeRisk({ volume, tone: harshTone });
    expect(worse.hazard).toBeGreaterThan(base.hazard);
    expect(worse.indicators.some((i) => i.key === "tone" && i.contribution > 0)).toBe(true);
  });

  it("always carries confidence + evidence + alternative", () => {
    const f = forecastNarrativeRisk({ volume: ramp(12) });
    expect(["Low", "Medium", "High"]).toContain(f.confidence);
    expect(f.evidence.length).toBeGreaterThan(0);
    expect(f.alternative.length).toBeGreaterThan(0);
  });

  it("is deterministic (same history → identical forecast)", () => {
    const v = ramp(13);
    expect(JSON.stringify(forecastNarrativeRisk({ volume: v }))).toBe(JSON.stringify(forecastNarrativeRisk({ volume: v })));
  });
});

describe("reScoreRisk", () => {
  it("raises the score on a warning forecast, bounded and reversible", () => {
    const f = forecastNarrativeRisk({ volume: ramp(16) });
    const r = reScoreRisk(50, f);
    expect(r.score).toBeGreaterThanOrEqual(50);
    expect(Math.abs(r.delta)).toBeLessThanOrEqual(RESCORE_MAX_DELTA);
    expect(r.rationale).toMatch(/forecast|reversible/i);
  });

  it("gently eases the score in a sustained calm", () => {
    const f = forecastNarrativeRisk({ volume: flat(22, 8) });
    const r = reScoreRisk(50, f);
    expect(r.delta).toBeLessThanOrEqual(0);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it("does nothing when no forecast is available", () => {
    const f = forecastNarrativeRisk({ volume: flat(3) });
    expect(reScoreRisk(50, f)).toMatchObject({ score: 50, delta: 0 });
  });

  it("never pushes a score out of [0,100]", () => {
    const f = forecastNarrativeRisk({ volume: ramp(18) });
    expect(reScoreRisk(95, f).score).toBeLessThanOrEqual(100);
    const calm = forecastNarrativeRisk({ volume: flat(22, 8) });
    expect(reScoreRisk(3, calm).score).toBeGreaterThanOrEqual(0);
  });
});

describe("updateBaseline (loop tightening / EWMA)", () => {
  it("seeds on the first observation, then blends toward new levels", () => {
    expect(updateBaseline(null, 10)).toBe(10);
    const b = updateBaseline(10, 20, 0.3);
    expect(b).toBeGreaterThan(10);
    expect(b).toBeLessThan(20);
  });
});
