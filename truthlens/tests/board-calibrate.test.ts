// Link Board calibration gates (FROZEN - add, never loosen). These prove that
// breadth cannot outrun calibration: common-by-default facts never create edges,
// only a Strong-tier artifact yields a Strong edge, and every artifact carries a
// tier + calibration + alternative.

import { describe, it, expect } from "vitest";
import { ALL_BOARD_ARTIFACT_KINDS } from "../lib/board/types";
import {
  CALIBRATION, calibrateOverlap, combineStrength, buildPairEdge, BOARD_RUBRIC_VERSION,
} from "../lib/board/calibrate";
import type { BoardArtifactKind } from "../lib/board/types";

const ctx = (over: Partial<Parameters<typeof calibrateOverlap>[3]> = {}) => ({
  shareCount: 2, totalEntities: 2, source: "test", ...over,
});

describe("rubric completeness", () => {
  it("every artifact kind has a calibration entry, and vice versa", () => {
    const keys = Object.keys(CALIBRATION).sort();
    expect(keys).toEqual([...ALL_BOARD_ARTIFACT_KINDS].sort());
  });
  it("every entry has a tier, calibration and a non-empty alternative", () => {
    for (const k of ALL_BOARD_ARTIFACT_KINDS) {
      const e = CALIBRATION[k];
      expect(e.tier).toBeTruthy();
      expect(e.calibration.length).toBeGreaterThan(0);
      expect(e.alternative.length).toBeGreaterThan(0);
    }
  });
  it("has a versioned rubric", () => {
    expect(BOARD_RUBRIC_VERSION).toMatch(/^board-/);
  });
});

describe("strong-by-default artifacts", () => {
  it("a shared exact non-wildcard cert SAN is Strong", () => {
    const o = calibrateOverlap("ssl_san", "vpn.example.com", "vpn.example.com", ctx({ wildcardOrCdnCert: false }));
    expect(o.tier).toBe("strong");
    expect(o.strength).toBe("High");
    expect(combineStrength([o])).toBe("High");
  });
  it("a shared wildcard / CDN cert is down-tiered to Weak and does not count", () => {
    const o = calibrateOverlap("ssl_san", "*.example.com", "*.example.com", ctx({ wildcardOrCdnCert: true }));
    expect(o.tier).toBe("weak");
    expect(o.countsToward).toBe(false);
    expect(combineStrength([o])).toBe("Unknown"); // no meaningful edge
  });
  it("a rare shared self-hosted analytics id (Matomo) is Strong", () => {
    const o = calibrateOverlap("matomo_id", "analytics.acme.com#4", "Matomo site 4", ctx());
    expect(o.strength).toBe("High");
    expect(combineStrength([o])).toBe("High");
  });
});

describe("common-by-default facts never make an edge", () => {
  it("shared nginx alone -> Weak, no edge", () => {
    const o = calibrateOverlap("server_header", "nginx", "nginx", ctx());
    expect(o.strength).toBe("Low");
    expect(o.countsToward).toBe(false);
    expect(combineStrength([o])).toBe("Unknown");
  });
  it("shared WordPress + nginx + same country -> still no edge", () => {
    const items = [
      calibrateOverlap("cms", "wordpress", "WordPress", ctx()),
      calibrateOverlap("server_header", "nginx", "nginx", ctx()),
      calibrateOverlap("hosting_country", "us", "US", ctx()),
    ];
    expect(combineStrength(items)).toBe("Unknown");
  });
  it("two sites behind the same CDN (IP + ASN + org all CDN) -> no meaningful edge", () => {
    const items = [
      calibrateOverlap("ip", "104.18.0.1", "104.18.0.1", ctx({ cdn: true, neighborCount: 9999 })),
      calibrateOverlap("asn", "AS13335", "AS13335", ctx({ cdn: true })),
      calibrateOverlap("as_org", "Cloudflare, Inc.", "Cloudflare", ctx({ cdn: true })),
    ];
    expect(items.every((i) => !i.countsToward)).toBe(true);
    expect(combineStrength(items)).toBe("Unknown");
  });
  it("shared big managed DNS / mail provider -> informational only", () => {
    expect(calibrateOverlap("ns_set", "kate.ns.cloudflare.com", "cloudflare NS", ctx()).countsToward).toBe(false);
    expect(calibrateOverlap("mx_host", "aspmx.l.google.com", "google MX", ctx()).countsToward).toBe(false);
  });
  it("registrar is unknown-commonness -> Weak, does not count", () => {
    const o = calibrateOverlap("registrar", "godaddy.com, llc", "GoDaddy", ctx());
    expect(o.tier).toBe("weak");
    expect(o.countsToward).toBe(false);
  });
});

describe("calibrated distinctive facts", () => {
  it("a dedicated shared IP (few neighbours, not CDN) is Moderate and counts", () => {
    const o = calibrateOverlap("ip", "203.0.113.5", "203.0.113.5", ctx({ cdn: false, neighborCount: 2 }));
    expect(o.strength).toBe("Medium");
    expect(o.countsToward).toBe(true);
    expect(o.commonness).toBe(2);
    expect(combineStrength([o])).toBe("Medium");
  });
  it("a busy shared IP (many neighbours) is informational", () => {
    const o = calibrateOverlap("ip", "203.0.113.5", "203.0.113.5", ctx({ cdn: false, neighborCount: 500 }));
    expect(o.countsToward).toBe(false);
    expect(combineStrength([o])).toBe("Unknown");
  });
  it("a shared boutique nameserver counts as weak", () => {
    const o = calibrateOverlap("ns_set", "ns1.boutique-dns.net", "boutique NS", ctx());
    expect(o.countsToward).toBe(true);
    expect(o.strength).toBe("Low");
  });
});

describe("combination rule", () => {
  it("two independent distinctive-weak overlaps raise Low -> Medium (one band)", () => {
    const items = [
      calibrateOverlap("ns_set", "ns1.boutique-dns.net", "NS", ctx()),
      calibrateOverlap("third_party_origin", "widgets.obscurehost.io", "origin", ctx()),
    ];
    expect(combineStrength(items)).toBe("Medium");
  });
  it("four weak overlaps never sum to Strong", () => {
    const items = [
      calibrateOverlap("ns_set", "ns1.boutique-dns.net", "NS", ctx()),
      calibrateOverlap("third_party_origin", "widgets.obscurehost.io", "origin", ctx()),
      calibrateOverlap("outbound_domain", "obscure-partner.io", "link", ctx()),
      calibrateOverlap("ptr_pattern", "hostpattern", "ptr", ctx()),
    ];
    expect(combineStrength(items)).not.toBe("High");
    expect(combineStrength(items)).toBe("Medium");
  });
  it("only a Strong artifact yields a High edge", () => {
    const weakOnly = [calibrateOverlap("ip_24", "203.0.113.0/24", "/24", ctx({ cdn: false }))];
    expect(combineStrength(weakOnly)).not.toBe("High");
    const withStrong = [...weakOnly, calibrateOverlap("ga_id", "UA-12345-1", "GA", ctx())];
    expect(combineStrength(withStrong)).toBe("High");
  });
});

describe("whole-board saturation", () => {
  it("a non-strong fact shared by ~all entities in a big board stops contributing", () => {
    const o = calibrateOverlap("ip", "203.0.113.5", "203.0.113.5",
      ctx({ cdn: false, neighborCount: 2, shareCount: 5, totalEntities: 5 }));
    expect(o.countsToward).toBe(false);
  });
  it("but a strong id shared across a whole board still counts (same operator)", () => {
    const o = calibrateOverlap("ga_id", "UA-999-1", "GA", ctx({ shareCount: 5, totalEntities: 5 }));
    expect(o.tier).toBe("strong");
    expect(o.strength).toBe("High");
  });
});

describe("determinism + evidence ordering", () => {
  it("buildPairEdge is deterministic and ranks strongest first", () => {
    const items = [
      calibrateOverlap("cms", "wordpress", "WordPress", ctx()),
      calibrateOverlap("ga_id", "UA-1-1", "GA", ctx()),
      calibrateOverlap("ip", "203.0.113.5", "203.0.113.5", ctx({ neighborCount: 2 })),
    ];
    const e1 = buildPairEdge("a.com", "b.com", items);
    const e2 = buildPairEdge("a.com", "b.com", [...items].reverse());
    expect(e1.strength).toBe("High");
    expect(e1.top?.kind).toBe("ga_id");
    expect(e1.items.map((i) => i.kind)).toEqual(e2.items.map((i) => i.kind));
  });
});
