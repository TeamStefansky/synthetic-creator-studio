// Geopolitics layer. Gates: region tagging matches countries + terms and falls
// back to "global"; aggregation de-duplicates by uid, splits events vs forecasts,
// sorts forecasts by probability, and passes unconnected sources through honestly.

import { describe, it, expect } from "vitest";
import { matchRegion, type GeoResult, type GeoRecord } from "../lib/geopolitics";
import { aggregateGeopolitics } from "../lib/geopolitics-agg";

describe("matchRegion", () => {
  it("tags Middle East countries and terms", () => {
    expect(matchRegion("Israel")).toBe("israel_me");
    expect(matchRegion("Airstrike near Gaza border")).toBe("israel_me");
    expect(matchRegion("Hezbollah statement")).toBe("israel_me");
  });
  it("tags Europe/US countries and terms", () => {
    expect(matchRegion("Ukraine")).toBe("europe_us");
    expect(matchRegion("NATO summit communique")).toBe("europe_us");
  });
  it("falls back to global", () => {
    expect(matchRegion("Typhoon near the Philippines")).toBe("global");
    expect(matchRegion("")).toBe("global");
  });
});

describe("aggregateGeopolitics", () => {
  const rec = (p: Partial<GeoRecord>): GeoRecord =>
    ({ uid: Math.random().toString(36), source: "ucdp", kind: "conflict", title: "t", region: "global", ...p } as GeoRecord);

  const results: GeoResult[] = [
    {
      status: { source: "ucdp", connected: true, count: 2 },
      records: [
        rec({ uid: "u1", kind: "conflict", region: "israel_me", ts: "2026-07-20", score: 5, scoreKind: "fatalities" }),
        rec({ uid: "u2", kind: "conflict", region: "europe_us", ts: "2026-07-22" }),
      ],
    },
    {
      status: { source: "polymarket", connected: true, count: 2 },
      records: [
        rec({ uid: "p1", source: "polymarket", kind: "forecast", title: "Ceasefire by Q4?", region: "israel_me", score: 0.35 }),
        rec({ uid: "p2", source: "polymarket", kind: "forecast", title: "Election upset?", region: "europe_us", score: 0.72 }),
      ],
    },
    {
      status: { source: "worldbank", connected: true, count: 1 },
      records: [rec({ uid: "wb1", source: "worldbank", kind: "macro", title: "Political stability: Israel", country: "Israel", region: "israel_me", score: -0.9, scoreKind: "stability-index" })],
    },
    { status: { source: "ucdp", connected: true, count: 1 }, records: [rec({ uid: "u1" })] }, // dup uid
    { status: { source: "acled", connected: false, reason: "Set ACLED_KEY + ACLED_EMAIL", count: 0 }, records: [] },
  ];

  it("de-duplicates by uid across sources", () => {
    const agg = aggregateGeopolitics(results);
    expect(agg.total).toBe(5); // u1, u2, p1, p2, wb1 (dup u1 dropped)
  });

  it("splits events / forecasts / macro and sorts forecasts by probability desc", () => {
    const agg = aggregateGeopolitics(results);
    expect(agg.events.map((e) => e.uid).sort()).toEqual(["u1", "u2"]);
    expect(agg.forecasts.map((f) => f.uid)).toEqual(["p2", "p1"]); // 0.72 before 0.35
    expect(agg.macro.map((m) => m.uid)).toEqual(["wb1"]); // macro kept separate from events
  });

  it("breaks down by region and kind", () => {
    const agg = aggregateGeopolitics(results);
    expect(agg.byRegion.find((r) => r.key === "israel_me")?.count).toBe(3); // u1 + p1 + wb1
    expect(agg.byRegion.find((r) => r.key === "europe_us")?.count).toBe(2);
    expect(agg.byKind.find((k) => k.kind === "conflict")?.count).toBe(2);
    expect(agg.byKind.find((k) => k.kind === "forecast")?.count).toBe(2);
    expect(agg.byKind.find((k) => k.kind === "macro")?.count).toBe(1);
  });

  it("passes an honest not-connected source through", () => {
    const agg = aggregateGeopolitics(results);
    const acled = agg.sources.find((s) => s.source === "acled");
    expect(acled?.connected).toBe(false);
    expect(acled?.reason).toMatch(/ACLED_KEY/);
  });
});
