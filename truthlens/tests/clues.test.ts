import { describe, it, expect } from "vitest";
import { extractEntities, entityKey } from "../lib/clues/extract";

describe("clue layer — entity extraction", () => {
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
});
