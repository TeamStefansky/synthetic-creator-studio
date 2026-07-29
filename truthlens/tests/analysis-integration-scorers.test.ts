import { describe, it, expect } from "vitest";
import { computeThreat } from "@/lib/narrative/threat";
import { assessCoordination } from "@/lib/coordination";
import { bayesianCalibration, timelineDynamics, weightedScoreSensitivity, INTEGRATE_VERSION } from "@/lib/analysis/integrate";
import type { Mention, SourceStatus } from "@/lib/narrative/types";

const src: SourceStatus[] = [{ source: "bluesky", connected: true } as SourceStatus];
function mk(text: string, account: string, minute: number): Mention {
  return { source: "bluesky", id: `${account}-${minute}`, text, account, accountId: account, timestamp: new Date(Date.UTC(2024, 0, 1, 12, minute)).toISOString() };
}

describe("threat.ts — Bayesian calibration enrichment", () => {
  const mentions: Mention[] = [
    mk("boycott brand now", "a1", 0), mk("boycott brand now", "a2", 0),
    mk("boycott brand now", "a3", 1), mk("boycott brand now", "a4", 1),
    mk("boycott brand now", "a5", 2),
  ];

  it("attaches a calibrated posterior + sensitivity without touching score/status", () => {
    const r = computeThreat("brand", mentions, src);
    expect(r.analysis).toBeTruthy();
    expect(r.analysis!.version).toBe(INTEGRATE_VERSION);
    if (r.analysis!.band !== "Insufficient") {
      expect(r.analysis!.posterior!).toBeGreaterThanOrEqual(0);
      expect(r.analysis!.posterior!).toBeLessThanOrEqual(1);
    }
    expect(r.analysis!.sensitivity).toBeTruthy();
    // headline contract intact
    expect(["CALM", "ELEVATED", "UNDER_ATTACK", "UNKNOWN"]).toContain(r.status);
    expect(r.score === null || (typeof r.score === "number" && r.score >= 0 && r.score <= 100)).toBe(true);
  });

  it("empty input stays Unknown and carries no fabricated posterior band", () => {
    const r = computeThreat("brand", [], src);
    expect(r.status).toBe("UNKNOWN");
    // no indicators → analysis is Insufficient or absent, never a confident band
    if (r.analysis) expect(r.analysis.band === undefined || r.analysis.band === "Insufficient").toBe(true);
  });

  it("no actor/country field leaks through the enrichment", () => {
    const json = JSON.stringify(computeThreat("brand", mentions, src)).toLowerCase();
    expect(json).not.toContain('"actor"');
    expect(json).not.toContain('"country"');
  });
});

describe("coordination.ts — sensitivity enrichment", () => {
  it("preserves level/score and flags the load-bearing signal", () => {
    const r = assessCoordination({
      network: { nodes: Array.from({ length: 6 }, (_, i) => ({ id: `d${i}`, label: `d${i}`, kind: "domain" })), edges: [] } as any,
    });
    expect(r.level).toBe("Low"); // 5 siblings → weight 18 → Low (unchanged)
    expect(r.score).toBe(18);
    expect(r.analysis?.sensitivity?.mostInfluential).toBeTruthy();
  });
});

describe("integrate helpers", () => {
  it("bayesianCalibration: strong supporting indicators lift the posterior", () => {
    const a = bayesianCalibration(
      [
        { key: "copypasta", score: 90, confidence: 0.9, level: "High" },
        { key: "volume", score: 80, confidence: 0.8, level: "High" },
      ],
      { copypasta: 3, volume: 2 },
    );
    expect(a.posterior!).toBeGreaterThan(0.5);
  });

  it("bayesianCalibration: negligible indicators → Insufficient (Unknown)", () => {
    const a = bayesianCalibration([{ key: "x", score: 51, confidence: 0.1, level: "Low" }], { x: 1 });
    expect(a.band).toBe("Insufficient");
  });

  it("timelineDynamics: <5 dated points is Insufficient, not a trend", () => {
    const d = timelineDynamics([1000, 2000, 3000]);
    expect(d.dynamics?.insufficient).toBe(true);
  });

  it("timelineDynamics: a growing hourly series yields a positive growth rate", () => {
    // 1 event hour 0, 2 in hour 1, 4 in hour 2, 8 in hour 3 (exponential)
    const H = 3600000;
    const times: number[] = [];
    [1, 2, 4, 8, 16].forEach((c, h) => { for (let i = 0; i < c; i++) times.push(h * H + i); });
    const d = timelineDynamics(times);
    expect(d.dynamics?.insufficient).toBe(false);
    expect(d.dynamics?.growthRate!).toBeGreaterThan(0);
  });

  it("weightedScoreSensitivity flags a level-flipping signal", () => {
    const s = weightedScoreSensitivity(
      [{ label: "big", weight: 30 }, { label: "small", weight: 5 }],
      [25, 50],
    );
    expect(s.mostInfluential).toBe("big");
    expect(s.flips).toBe(true); // removing 30 drops 35→5, crossing the 25 threshold
  });
});
