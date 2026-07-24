// Link Board comparison + no-personal-data gates. compareFingerprints is pure
// (no network), so these use synthetic fingerprints.

import { describe, it, expect } from "vitest";
import { compareFingerprints, orgEmail } from "../lib/board/links";
import type { Fingerprint, Artifact } from "../lib/board/types";

function fp(entity: string, arts: [Artifact["kind"], string][], over: Partial<Fingerprint> = {}): Fingerprint {
  return {
    entity,
    artifacts: arts.map(([kind, value]) => ({ kind, value: value.toLowerCase(), display: value })),
    neighborCount: null, cdn: false, wildcardCertOrCdnIssuer: false, errors: [], ...over,
  };
}

describe("compareFingerprints - meaningful vs noise", () => {
  it("two sites sharing only nginx + WordPress + same country draw NO edge", () => {
    const r = compareFingerprints([
      fp("a.com", [["server_header", "nginx"], ["cms", "wordpress"], ["hosting_country", "US"]]),
      fp("b.com", [["server_header", "nginx"], ["cms", "wordpress"], ["hosting_country", "US"]]),
    ]);
    expect(r.edges).toHaveLength(0);
    expect(r.matrix[0][1]).toBeNull();
  });

  it("two sites behind the same CDN draw no edge", () => {
    const r = compareFingerprints([
      fp("a.com", [["ip", "104.18.0.1"], ["asn", "AS13335"], ["as_org", "Cloudflare, Inc."]], { cdn: true, neighborCount: 9999 }),
      fp("b.com", [["ip", "104.18.0.1"], ["asn", "AS13335"], ["as_org", "Cloudflare, Inc."]], { cdn: true, neighborCount: 9999 }),
    ]);
    expect(r.edges).toHaveLength(0);
  });

  it("a shared unique GA id draws a Strong edge", () => {
    const r = compareFingerprints([
      fp("a.com", [["ga_id", "UA-555-1"], ["cms", "wordpress"]]),
      fp("b.com", [["ga_id", "UA-555-1"], ["server_header", "nginx"]]),
    ]);
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0].strength).toBe("High");
    expect(r.edges[0].top?.kind).toBe("ga_id");
    expect(r.matrix[0][1]).toBe("High");
  });

  it("a dedicated shared IP + a boutique nameserver draws a Medium edge", () => {
    const r = compareFingerprints([
      fp("a.com", [["ip", "203.0.113.9"], ["ns_set", "ns1.boutique-dns.net"]], { neighborCount: 3 }),
      fp("b.com", [["ip", "203.0.113.9"], ["ns_set", "ns1.boutique-dns.net"]], { neighborCount: 3 }),
    ]);
    expect(r.edges).toHaveLength(1);
    expect(r.edges[0].strength).toBe("Medium");
  });

  it("prunes /24 and /16 when the exact IP already matched", () => {
    const r = compareFingerprints([
      fp("a.com", [["ip", "203.0.113.9"], ["ip_24", "203.0.113.0/24"], ["ip_16", "203.0.0.0/16"]], { neighborCount: 2 }),
      fp("b.com", [["ip", "203.0.113.9"], ["ip_24", "203.0.113.0/24"], ["ip_16", "203.0.0.0/16"]], { neighborCount: 2 }),
    ]);
    expect(r.edges[0].items.some((i) => i.kind === "ip_24" || i.kind === "ip_16")).toBe(false);
  });

  it("is deterministic across two runs (same matrix + edges)", () => {
    const build = () => compareFingerprints([
      fp("a.com", [["ga_id", "UA-1-1"], ["ip", "203.0.113.9"]], { neighborCount: 2 }),
      fp("b.com", [["ga_id", "UA-1-1"], ["ip", "203.0.113.9"]], { neighborCount: 2 }),
    ]);
    const r1 = build(), r2 = build();
    expect(r1.matrix).toEqual(r2.matrix);
    expect(r1.edges.map((e) => [e.a, e.b, e.strength])).toEqual(r2.edges.map((e) => [e.a, e.b, e.strength]));
  });
});

describe("no-personal-data gate", () => {
  it("accepts role mailboxes as org contact", () => {
    expect(orgEmail("info@acme.com")).toBe("info@acme.com");
    expect(orgEmail("Contact@Acme.com")).toBe("contact@acme.com");
    expect(orgEmail("support@acme.com")).toBe("support@acme.com");
  });
  it("rejects personal addresses (never an artifact)", () => {
    expect(orgEmail("john.doe@acme.com")).toBeNull();
    expect(orgEmail("j.smith@gmail.com")).toBeNull();
    expect(orgEmail("sarah@acme.com")).toBeNull();
    expect(orgEmail("not-an-email")).toBeNull();
  });
});
