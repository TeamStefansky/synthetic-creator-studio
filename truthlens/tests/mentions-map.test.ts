// Brand-mentions aggregation - "where does my brand appear?". Pure function.
// Gates: cross-source de-duplication by URL, most-recent-first, geographic
// breakdown by country (+ honest unknown bucket), and source statuses passed
// through verbatim (so a "not connected" source is shown, never faked).

import { describe, it, expect } from "vitest";
import { aggregateMentions, centroidForCountry } from "../lib/mentions-map";
import type { SourceResult } from "../lib/narrative/sources";

const results: SourceResult[] = [
  {
    status: { source: "gdelt", connected: true, count: 3 },
    mentions: [
      { source: "gdelt", id: "g1", text: "A", url: "https://x.example/a", country: "US", timestamp: "2024-06-03T00:00:00Z" },
      { source: "gdelt", id: "g2", text: "B", url: "https://y.example/b", country: "US", timestamp: "2024-06-01T00:00:00Z" },
      { source: "gdelt", id: "g3", text: "C", url: "https://z.example/c", country: "IL", timestamp: "2024-06-02T00:00:00Z" },
    ],
  },
  {
    status: { source: "reddit", connected: true, count: 2 },
    mentions: [
      // duplicate URL of g1 across sources -> de-duplicated
      { source: "reddit", id: "r1", text: "A dup", url: "https://x.example/a", timestamp: "2024-06-03T05:00:00Z" },
      { source: "reddit", id: "r2", text: "D", url: "https://r.example/d", timestamp: "2024-06-04T00:00:00Z" },
    ],
  },
  { status: { source: "x", connected: false, reason: "Set X_BEARER_TOKEN", count: 0 }, mentions: [] },
];

describe("aggregateMentions", () => {
  it("de-duplicates across sources by URL", () => {
    const agg = aggregateMentions(results);
    expect(agg.total).toBe(4); // g1/g2/g3/r2 (r1 is a dup of g1)
    expect(agg.mentions.filter((m) => m.url === "https://x.example/a").length).toBe(1);
  });

  it("sorts most-recent first", () => {
    const agg = aggregateMentions(results);
    expect(agg.mentions[0].url).toBe("https://r.example/d"); // 2024-06-04
    expect(agg.mentions[agg.mentions.length - 1].url).toBe("https://y.example/b"); // 2024-06-01
  });

  it("breaks down by country with labels/flags and an unknown bucket", () => {
    const agg = aggregateMentions(results);
    const us = agg.byCountry.find((c) => c.key === "US");
    const il = agg.byCountry.find((c) => c.key === "IL");
    expect(us?.count).toBe(2);
    expect(il?.count).toBe(1);
    expect(agg.byCountry[0].key).toBe("US"); // sorted by count desc
    expect(us?.label).toBeTruthy();
    expect(agg.countryUnknown).toBe(1); // r2 has no country
    // Coordinates attached for map plotting.
    expect(us?.code).toBe("US");
    expect(typeof us?.lat).toBe("number");
    expect(typeof us?.lon).toBe("number");
  });

  it("infers a home country for fixed-home outlets when none is reported", () => {
    const agg = aggregateMentions([
      {
        status: { source: "guardian", connected: true, count: 1 },
        mentions: [{ source: "guardian", id: "gu1", text: "X", url: "https://gu.example/1" }],
      },
      {
        status: { source: "nyt", connected: true, count: 1 },
        mentions: [{ source: "nyt", id: "ny1", text: "Y", url: "https://ny.example/1" }],
      },
      {
        status: { source: "reddit", connected: true, count: 1 },
        mentions: [{ source: "reddit", id: "rd1", text: "Z", url: "https://rd.example/1" }],
      },
    ]);
    expect(agg.byCountry.find((c) => c.key === "GB")?.count).toBe(1); // Guardian -> UK
    expect(agg.byCountry.find((c) => c.key === "US")?.count).toBe(1); // NYT -> US
    expect(agg.countryUnknown).toBe(1); // reddit has no fixed home
  });

  it("centroidForCountry resolves both ISO codes and English names", () => {
    expect(centroidForCountry("IL")?.code).toBe("IL");
    expect(centroidForCountry("Israel")?.code).toBe("IL");
    expect(centroidForCountry("United States")?.code).toBe("US");
    expect(centroidForCountry("Nowhereland")).toBeNull();
    expect(centroidForCountry("")).toBeNull();
  });

  it("passes source statuses through, including an honest not-connected one", () => {
    const agg = aggregateMentions(results);
    const x = agg.sources.find((s) => s.source === "x");
    expect(x?.connected).toBe(false);
    expect(x?.reason).toMatch(/X_BEARER_TOKEN/);
  });
});
