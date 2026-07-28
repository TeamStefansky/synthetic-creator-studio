// Origin Map pure helpers. Frozen-rule surfaces proven here:
//   - Rule 2: EARLIEST_LABEL says "not the true source"; earliestObserved picks
//     the earliest DATED, geolocated observation (a lead, never "the origin").
//   - No-person-nodes: the amplifier network contains ONLY the term (target) and
//     publisher DOMAIN nodes — never an account handle or a person.
//   - Rule 3/7: infrastructure pins are derived only from real report candidates
//     with a resolvable country; nothing is invented.

import { describe, it, expect } from "vitest";
import {
  EARLIEST_LABEL, ORIGIN_SERVER_ALT,
  looksLikeUrl, toDomain, domainOf,
  earliestObserved, timeSpan, plottablePoints,
  buildAmplifierNetwork, buildOriginExposureNetwork, originServerPoints,
} from "../lib/origin-map";
import type { MapMention } from "../lib/mentions-map";
import type { OriginExposureReport } from "../lib/origin-exposure";

const mk = (over: Partial<MapMention>): MapMention => ({
  source: "gdelt", id: Math.random().toString(36), text: "x", sourceType: "news", ...over,
});

describe("EARLIEST_LABEL (rule 2)", () => {
  it("carries the mandatory not-the-true-source wording", () => {
    expect(EARLIEST_LABEL).toMatch(/earliest observed/i);
    expect(EARLIEST_LABEL).toMatch(/not the true source/i);
  });
});

describe("input classification", () => {
  it("distinguishes URLs/domains from free-text terms", () => {
    expect(looksLikeUrl("example.com")).toBe(true);
    expect(looksLikeUrl("https://sub.example.com/x")).toBe(true);
    expect(looksLikeUrl("Wolt")).toBe(false);
    expect(looksLikeUrl("monday dot com")).toBe(false);
    expect(looksLikeUrl("")).toBe(false);
  });
  it("normalizes a URL/domain to a bare host", () => {
    expect(toDomain("https://www.Example.com/path?q=1")).toBe("example.com");
    expect(toDomain("EXAMPLE.com")).toBe("example.com");
    expect(domainOf("https://www.reddit.com/r/x")).toBe("reddit.com");
    expect(domainOf(undefined)).toBe("");
  });
});

describe("earliestObserved + timeSpan (rule 2)", () => {
  const mentions: MapMention[] = [
    mk({ id: "a", lat: 40, lon: -74, timestamp: "2024-06-03T00:00:00Z" }),
    mk({ id: "b", lat: 31, lon: 34, timestamp: "2024-06-01T00:00:00Z" }), // earliest dated + geo
    mk({ id: "c", lat: 51, lon: 0, timestamp: "2024-06-05T00:00:00Z" }),
    mk({ id: "d", timestamp: "2024-01-01T00:00:00Z" }),                    // earlier but NOT geolocated
    mk({ id: "e", lat: 1, lon: 1 }),                                       // geo but undated
  ];

  it("returns the earliest DATED, geolocated observation", () => {
    const e = earliestObserved(mentions);
    expect(e).not.toBeNull();
    expect(mentions[e!.idx].id).toBe("b"); // not "d" (unplottable) — a plottable lead
  });

  it("computes the [min,max] span over dated, geolocated points", () => {
    const span = timeSpan(mentions);
    expect(span).not.toBeNull();
    expect(new Date(span![0]).toISOString().slice(0, 10)).toBe("2024-06-01");
    expect(new Date(span![1]).toISOString().slice(0, 10)).toBe("2024-06-05");
  });

  it("plottablePoints skips mentions without coordinates", () => {
    expect(plottablePoints(mentions).map((p) => mentions[p.idx].id).sort()).toEqual(["a", "b", "c", "e"]);
  });

  it("returns null when nothing is dated + geolocated", () => {
    expect(earliestObserved([mk({ id: "z" }), mk({ id: "y", timestamp: "2024-01-01T00:00:00Z" })])).toBeNull();
    expect(timeSpan([mk({ id: "z", lat: 1, lon: 1 })])).toBeNull();
  });
});

describe("buildAmplifierNetwork (no person nodes)", () => {
  const mentions: MapMention[] = [
    mk({ source: "gdelt", url: "https://www.a.com/1", account: "Jane Doe" }),
    mk({ source: "reddit", url: "https://reddit.com/r/x/1", account: "u/someone" }),
    mk({ source: "gdelt", url: "https://a.com/2" }),   // second hit for a.com
    mk({ source: "x", url: "https://x.com/@handle/1", account: "@handle" }),
    mk({ source: "gdelt" }),                            // no url — ignored
  ];

  it("nodes are the term (target) + publisher DOMAINS only — never accounts/people", () => {
    const { network, domains } = buildAmplifierNetwork("MyBrand", mentions);
    const kinds = new Set(network.nodes.map((n) => n.kind));
    expect(kinds).toEqual(new Set(["target", "domain"]));
    // No account handle / person name leaks into any node.
    for (const n of network.nodes) {
      expect(n.label).not.toMatch(/Jane Doe|u\/someone|@handle/);
    }
    const domainNames = domains.map((d) => d.domain);
    expect(domainNames).toContain("a.com");
    expect(domainNames).toContain("reddit.com");
    expect(domainNames).toContain("x.com");
    // a.com appears twice → ranked first with count 2.
    expect(domains[0]).toEqual({ domain: "a.com", count: 2 });
  });

  it("returns an empty graph when no mention has a resolvable domain", () => {
    const { network, domains } = buildAmplifierNetwork("t", [mk({}), mk({})]);
    expect(network.nodes).toHaveLength(0);
    expect(domains).toHaveLength(0);
  });
});

describe("buildOriginExposureNetwork + originServerPoints", () => {
  const report: OriginExposureReport = {
    available: true, domain: "example.com", cdnFronted: true, cdn: "Cloudflare",
    namesChecked: 40,
    exposed: [{ name: "mail.example.com", ip: "203.0.113.7", version: "v4", source: "current DNS", country: "US", city: "Ashburn" }],
    proxiedCount: 3, uniqueExposedIps: ["203.0.113.7"],
    candidates: [
      { ip: "203.0.113.7", version: "v4", country: "US", provider: "DigitalOcean", sources: ["current DNS"] },
      { ip: "198.51.100.9", version: "v4", country: "Nowhereland", sources: ["historical DNS"] }, // unresolvable country
    ],
    provider: "DigitalOcean", originFound: false,
    historical: { available: true, candidates: [{ ip: "198.51.100.9" }], note: "" },
    band: "possible_exposure", confidence: "Low", confidenceScore: 35,
    evidence: ["mail.example.com resolves to a non-CDN IP"],
    alternative: "A non-CDN IP is often a third-party mail host.",
    recommendations: [], note: "", collectedAt: "2024-06-01T00:00:00Z",
  };

  it("builds an infra graph with a target + subdomain + IP nodes (no person nodes)", () => {
    const net = buildOriginExposureNetwork(report);
    const kinds = new Set(net.nodes.map((n) => n.kind));
    expect(kinds.has("target")).toBe(true);
    expect(kinds.has("ip")).toBe(true);
    expect([...kinds].every((k) => ["target", "domain", "ip"].includes(k))).toBe(true);
    expect(net.nodes.find((n) => n.id === "example.com")?.kind).toBe("target");
  });

  it("pins only candidates whose country resolves to a centroid (nothing invented)", () => {
    const pts = originServerPoints(report);
    expect(pts).toHaveLength(1); // Nowhereland is dropped, not faked
    expect(pts[0].ip).toBe("203.0.113.7");
    expect(pts[0].countryLabel).toMatch(/United States/i);
    expect(typeof pts[0].lat).toBe("number");
  });

  it("empty report → empty graph and no pins", () => {
    expect(buildOriginExposureNetwork(null).nodes).toHaveLength(0);
    expect(originServerPoints(null)).toHaveLength(0);
  });

  it("exposes an innocent alternative constant (rule 3)", () => {
    expect(ORIGIN_SERVER_ALT).toMatch(/shared host|relay/i);
  });
});
