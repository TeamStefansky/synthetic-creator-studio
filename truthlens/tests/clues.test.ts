import { describe, it, expect } from "vitest";
import { extractEntities, entityKey } from "../lib/clues/extract";

describe("clue layer - entity extraction", () => {
  it("pulls domain + IP + GA + AdSense + SSL SAN from a site report", () => {
    const result = {
      domain: "example.com",
      asn: "AS12345",
      ssl: { sanDomains: ["example.com", "cdn.example.com"] },
      trackers: { gaIds: ["G-ABC123XYZ"], adsenseIds: ["ca-pub-1234567890"] },
      infra: { serverIp: "203.0.113.9" },
    };
    const ents = extractEntities("site", "https://example.com", result);
    const keys = ents.map(entityKey);
    expect(keys).toContain("domain:example.com");
    expect(keys).toContain("ip:203.0.113.9");
    expect(keys).toContain("asn:as12345");
    expect(keys).toContain("ga_id:g-abc123xyz");
    expect(keys).toContain("adsense_id:ca-pub-1234567890");
    expect(keys).toContain("ssl_san:cdn.example.com");
  });

  it("ignores private IPs", () => {
    const ents = extractEntities("logs", "", { ips: ["10.0.0.1", "192.168.1.5", "8.8.8.8"] });
    const keys = ents.map(entityKey);
    expect(keys).toContain("ip:8.8.8.8");
    expect(keys).not.toContain("ip:10.0.0.1");
    expect(keys).not.toContain("ip:192.168.1.5");
  });

  it("extracts the origin IP + email domain from an email trace", () => {
    const ents = extractEntities("email", "headers…", { originIp: "198.51.100.7", domain: "sender.org" });
    const keys = ents.map(entityKey);
    expect(keys).toContain("ip:198.51.100.7");
    expect(keys).toContain("email_domain:sender.org");
  });

  it("extracts an account handle from a social post link", () => {
    const ents = extractEntities("post", "https://x.com/somebody/status/1", {});
    expect(ents.map(entityKey)).toContain("account:@somebody");
  });

  it("finds the SAME IP across two different check types (the link signal)", () => {
    const a = extractEntities("site", "https://a.com", { infra: { serverIp: "203.0.113.9" } });
    const b = extractEntities("email", "", { originIp: "203.0.113.9" });
    const shared = a.map(entityKey).filter((k) => b.map(entityKey).includes(k));
    expect(shared).toContain("ip:203.0.113.9");
  });

  it("links two sites on the same niche host via operator (nameserver ↔ origin ASN)", () => {
    // Real example: shovrimshtika.org uses nameserver ns0.1984.is (1984 ehf),
    // techforpalestine.org's leaked origin is ASN "1984 ehf". Different clue
    // shapes, SAME operator - the system must surface the link.
    const nsSite = extractEntities("site", "https://shovrimshtika.org", {
      geography: { dns: [{ host: "ns0.1984.is", country: "IS" }, { host: "ns1.virtualroad.info" }] },
    });
    const originSite = extractEntities("site", "https://techforpalestine.org", {
      originTrace: { likelyOrigin: { ip: "89.147.110.100", country: "IS", asnOrg: "1984 ehf" } },
    });
    const nsKeys = nsSite.map(entityKey);
    const originKeys = originSite.map(entityKey);
    expect(nsKeys).toContain("net_org:1984");
    expect(originKeys).toContain("net_org:1984");
    // the shared clue that draws the edge between the two searches
    const shared = nsKeys.filter((k) => originKeys.includes(k));
    expect(shared).toContain("net_org:1984");
    expect(nsKeys).toContain("domain:1984.is"); // nameserver registrable domain also captured
  });

  it("does NOT treat mega-providers (Cloudflare/Google) as an operator link", () => {
    const a = extractEntities("site", "https://a.com", { geography: { dns: [{ host: "augustus.ns.cloudflare.com" }] }, infrastructure: { hosting: { value: { asnOrg: "Google LLC" } } } });
    const keys = a.map(entityKey);
    expect(keys.some((k) => k.startsWith("net_org:"))).toBe(false);
  });
});
