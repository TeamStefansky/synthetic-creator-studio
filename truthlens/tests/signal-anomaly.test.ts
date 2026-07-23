// Anomaly detection over collected series. Gates: z-score is computed against
// the PRIOR window (never the point itself); too little history -> "insufficient"
// (honest Unknown, not a fabricated spike); a flat baseline only fires when the
// latest point actually breaks it; daily volume buckets by calendar day.

import { describe, it, expect } from "vitest";
import { anomalyReport, dailyVolume, detectAnomaly, MIN_BASELINE } from "../lib/signal-anomaly";
import type { SeriesPoint } from "../lib/signal-context";
import type { Mention } from "../lib/narrative/types";

const series = (values: number[]): SeriesPoint[] =>
  values.map((value, i) => ({ date: `2026-07-${String(i + 1).padStart(2, "0")}`, value }));

describe("detectAnomaly", () => {
  it("flags a spike when the latest point is far above baseline", () => {
    const r = detectAnomaly(series([5, 5, 6, 5, 5, 6, 40]));
    expect(r.status).toBe("spike");
    expect(r.z).toBeGreaterThan(2);
    expect(r.latest).toBe(40);
  });

  it("flags a drop when the latest point is far below baseline", () => {
    const r = detectAnomaly(series([50, 52, 48, 51, 49, 50, 2]));
    expect(r.status).toBe("drop");
    expect(r.z).toBeLessThan(-2);
  });

  it("stays normal for ordinary variation", () => {
    const r = detectAnomaly(series([10, 11, 9, 10, 12, 8, 11]));
    expect(r.status).toBe("normal");
  });

  it("returns insufficient (Unknown) without enough history - never a guess", () => {
    const r = detectAnomaly(series([1, 2, 3]));
    expect(r.status).toBe("insufficient");
    expect(r.z).toBeNull();
    expect(r.note).toMatch(new RegExp(`${MIN_BASELINE + 1}`));
  });

  it("only fires on a flat baseline when the latest point breaks it", () => {
    expect(detectAnomaly(series([7, 7, 7, 7, 7, 7, 7])).status).toBe("normal");
    expect(detectAnomaly(series([7, 7, 7, 7, 7, 7, 9])).status).toBe("spike");
  });

  it("computes the baseline from prior points only (excludes the latest)", () => {
    const r = detectAnomaly(series([10, 10, 10, 10, 10, 10, 10]));
    expect(r.baselineMean).toBe(10);
    expect(r.window).toBe(6);
  });
});

describe("dailyVolume", () => {
  it("buckets mentions by calendar day, oldest -> newest", () => {
    const ms: Mention[] = [
      { source: "x", id: "1", text: "a", timestamp: "2026-07-02T10:00:00Z" },
      { source: "x", id: "2", text: "b", timestamp: "2026-07-02T20:00:00Z" },
      { source: "x", id: "3", text: "c", timestamp: "2026-07-01T09:00:00Z" },
      { source: "x", id: "4", text: "d" }, // no timestamp -> ignored
    ];
    const v = dailyVolume(ms);
    expect(v).toEqual([
      { date: "2026-07-01", value: 1 },
      { date: "2026-07-02", value: 2 },
    ]);
  });
});

describe("anomalyReport", () => {
  it("ranks anomalies first and marks uncollected series insufficient", () => {
    // 1 mention/day for six days, then 20 on the last -> a volume spike.
    const perDay = [1, 1, 1, 1, 1, 1, 20];
    const mentions: Mention[] = [];
    perDay.forEach((n, d) => {
      const date = `2026-07-${String(d + 1).padStart(2, "0")}`;
      for (let k = 0; k < n; k++) mentions.push({ source: "x", id: `${d}-${k}`, text: "m", timestamp: `${date}T0${k % 9}:00:00Z` });
    });
    const report = anomalyReport(mentions, [
      { key: "wikipedia", label: "Wikipedia attention", collected: false, series: [] },
      { key: "gdelt-tone", label: "News tone", collected: true, series: series([0, 0, 0, 0, 0, 0, 0]) },
    ]);
    expect(report[0].key).toBe("volume");
    expect(report[0].status).toBe("spike");
    expect(report.find((r) => r.key === "wikipedia")?.status).toBe("insufficient");
  });
});
