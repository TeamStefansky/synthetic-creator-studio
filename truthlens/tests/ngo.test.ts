// Nonprofit registry lookup. Gates: aggregation de-duplicates by id, sorts
// funded orgs first, passes an honest not-connected source through, and the
// normalized record carries organization-level facts only (no person fields).

import { describe, it, expect } from "vitest";
import { aggregateNgo, type NgoResult, type NgoRecord } from "../lib/ngo";

const rec = (p: Partial<NgoRecord>): NgoRecord =>
  ({ source: "propublica", id: Math.random().toString(36), name: "Org", country: "US", ...p } as NgoRecord);

describe("aggregateNgo", () => {
  const results: NgoResult[] = [
    {
      status: { source: "propublica", connected: true, count: 3 },
      records: [
        rec({ id: "propublica:1", name: "Alpha Fund", revenue: 5_000_000 }),
        rec({ id: "propublica:2", name: "Beta Trust", revenue: 20_000_000 }),
        rec({ id: "propublica:3", name: "Zeta Org" }), // no revenue
      ],
    },
    {
      status: { source: "propublica", connected: true, count: 1 },
      records: [rec({ id: "propublica:1", name: "Alpha Fund (dup)", revenue: 5_000_000 })], // dup id
    },
    { status: { source: "charity-commission", connected: false, reason: "Set CHARITY_COMMISSION_KEY", count: 0 }, records: [] },
  ];

  it("de-duplicates by id across sources", () => {
    const agg = aggregateNgo(results);
    expect(agg.total).toBe(3); // 1,2,3 (dup 1 dropped)
  });

  it("sorts organizations with reported revenue first (desc)", () => {
    const agg = aggregateNgo(results);
    expect(agg.records.map((r) => r.id)).toEqual(["propublica:2", "propublica:1", "propublica:3"]);
  });

  it("passes an honest not-connected registry through", () => {
    const agg = aggregateNgo(results);
    const cc = agg.sources.find((s) => s.source === "charity-commission");
    expect(cc?.connected).toBe(false);
    expect(cc?.reason).toMatch(/CHARITY_COMMISSION_KEY/);
  });

  it("records are organization-level only (no person fields)", () => {
    const agg = aggregateNgo(results);
    const keys = new Set(agg.records.flatMap((r) => Object.keys(r)));
    for (const forbidden of ["trustee", "officer", "person", "director", "ceo", "contact"]) {
      expect([...keys].some((k) => k.toLowerCase().includes(forbidden))).toBe(false);
    }
  });
});
