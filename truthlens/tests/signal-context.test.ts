// Attention/tone context signals. Gates: direction is COMPUTED from the series
// (never model-given); too little data -> nulls (Unknown), not zeros; the
// 10% dead-band keeps noise from reading as a trend.

import { describe, it, expect } from "vitest";
import { trendOf, type SeriesPoint } from "../lib/signal-context";

const days = (values: number[]): SeriesPoint[] =>
  values.map((value, i) => ({ date: `2026-07-${String(i + 1).padStart(2, "0")}`, value }));

describe("trendOf", () => {
  it("computes last-7 vs prior-7 means and an up direction", () => {
    const t = trendOf(days([10, 10, 10, 10, 10, 10, 10, 20, 20, 20, 20, 20, 20, 20]));
    expect(t.previous).toBe(10);
    expect(t.current).toBe(20);
    expect(t.changePct).toBe(100);
    expect(t.direction).toBe("up");
  });

  it("flags a drop as down", () => {
    const t = trendOf(days([20, 20, 20, 20, 20, 20, 20, 10, 10, 10, 10, 10, 10, 10]));
    expect(t.direction).toBe("down");
  });

  it("treats <=10% movement as flat (dead-band against noise)", () => {
    const t = trendOf(days([100, 100, 100, 100, 100, 100, 100, 105, 105, 105, 105, 105, 105, 105]));
    expect(t.direction).toBe("flat");
  });

  it("returns nulls (Unknown) on too little data - never fabricated zeros", () => {
    const t = trendOf(days([5, 6]));
    expect(t.current).toBeNull();
    expect(t.direction).toBeNull();
  });

  it("adapts the window for short series", () => {
    const t = trendOf(days([1, 1, 1, 9, 9, 9])); // window 3
    expect(t.previous).toBe(1);
    expect(t.current).toBe(9);
    expect(t.direction).toBe("up");
  });
});
