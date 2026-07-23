// Polymarket adapter - pure filter/normalize. Gates: matches by query terms,
// parses the stringified outcomePrices into a 0-1 probability, sorts by 24h
// volume, and respects the limit. No network here.

import { describe, it, expect } from "vitest";
import { filterMarkets } from "../lib/polymarket";

const raw = [
  { id: "1", question: "Will Nike release X by 2026?", slug: "nike-x", outcomePrices: "[\"0.62\",\"0.38\"]", volume24hr: 5000, endDate: "2026-12-31" },
  { id: "2", question: "Unrelated election market", slug: "elec", outcomePrices: "[\"0.5\",\"0.5\"]", volume24hr: 99999 },
  { id: "3", question: "Nike stock above $100?", slug: "nike-100", outcomePrices: "[\"0.8\"]", volume24hr: 20000 },
  { id: "4", question: "NIKE lawsuit resolved?", slug: "nike-suit", outcomePrices: "bad-json", volume24hr: 100 },
];

describe("filterMarkets", () => {
  it("keeps only markets matching the query terms", () => {
    const out = filterMarkets(raw, "Nike");
    expect(out.map((m) => m.id).sort()).toEqual(["1", "3", "4"]); // not the election one
  });

  it("parses probability from stringified outcomePrices, null on bad json", () => {
    const out = filterMarkets(raw, "Nike");
    expect(out.find((m) => m.id === "3")?.probability).toBeCloseTo(0.8);
    expect(out.find((m) => m.id === "4")?.probability).toBeNull();
  });

  it("sorts by 24h volume desc and builds the market url", () => {
    const out = filterMarkets(raw, "Nike");
    expect(out[0].id).toBe("3"); // 20000 > 5000 > 100
    expect(out[0].url).toBe("https://polymarket.com/market/nike-100");
  });

  it("respects the limit", () => {
    expect(filterMarkets(raw, "Nike", 1)).toHaveLength(1);
  });

  it("returns [] for a non-matching query", () => {
    expect(filterMarkets(raw, "zzznotathing")).toEqual([]);
  });
});
