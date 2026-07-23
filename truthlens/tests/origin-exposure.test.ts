// Origin-exposure audit - DEFENSIVE, public/passive only. Network (crt.sh + CF
// ranges) is stubbed via global fetch; DNS via a mocked dns/promises Resolver.
// Ethics gates covered: only PUBLIC records are read (no probe/connect to origin);
// a non-CDN IP is a POSSIBLE lead, not proof (band + alternative present); an
// invalid domain returns insufficient_data without any network.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock DNS before importing the module under test.
const RESOLVE = vi.hoisted(() => ({
  v4: (_name: string): string[] => [],
  v6: (_name: string): string[] => [],
}));
vi.mock("dns/promises", () => {
  class Resolver {
    setServers() {}
    async resolve4(name: string) { return RESOLVE.v4(name); }
    async resolve6(name: string) { return RESOLVE.v6(name); }
  }
  return { Resolver };
});

import {
  ipInAnyCidr, isInRanges, ipInCidr, auditOriginExposure,
} from "../lib/origin-exposure";

const realFetch = globalThis.fetch;

// CF ranges served to loadCloudflareRanges(); crt.sh returns [] (no CT names).
const CF_V4 = "104.16.0.0/13\n172.64.0.0/13\n173.245.48.0/20\n";
const CF_V6 = "2606:4700::/32\n";
// Minimal RDAP payload → owner "DigitalOcean, LLC" so provider = DigitalOcean.
const RDAP = JSON.stringify({
  name: "DIGITALOCEAN-1",
  entities: [{ handle: "DO", vcardArray: ["vcard", [["fn", {}, "text", "DigitalOcean, LLC"]]] }],
});
function stubFetch() {
  globalThis.fetch = vi.fn(async (input: any) => {
    const url = String(input);
    const text =
      url.includes("ips-v4") ? CF_V4 :
      url.includes("ips-v6") ? CF_V6 :
      url.includes("rdap.org") ? RDAP :
      "[]";
    return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text || "[]") } as any;
  }) as any;
}

const RUN = Math.random().toString(36).slice(2, 8);
beforeEach(() => { RESOLVE.v4 = () => []; RESOLVE.v6 = () => []; });
afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

describe("IP-range math", () => {
  it("classifies v4 IPs inside/outside Cloudflare ranges", () => {
    const cf = ["104.16.0.0/13", "172.64.0.0/13"];
    expect(ipInAnyCidr("104.16.5.9", cf)).toBe(true);    // inside 104.16.0.0/13
    expect(ipInAnyCidr("104.23.255.1", cf)).toBe(true);  // top of /13 (104.16-104.23)
    expect(ipInAnyCidr("104.31.255.1", cf)).toBe(false); // 104.31 is outside /13
    expect(ipInAnyCidr("203.0.113.5", cf)).toBe(false);  // documentation range, not CF
    expect(ipInAnyCidr("8.8.8.8", cf)).toBe(false);
  });
  it("classifies v6 IPs and never cross-matches families", () => {
    expect(ipInAnyCidr("2606:4700::1234", ["2606:4700::/32"])).toBe(true);
    expect(ipInAnyCidr("2001:db8::1", ["2606:4700::/32"])).toBe(false);
    expect(ipInAnyCidr("104.16.5.9", ["2606:4700::/32"])).toBe(false); // v4 vs v6 range
    expect(ipInAnyCidr("2606:4700::1", ["104.16.0.0/13"])).toBe(false); // v6 vs v4 range
  });
  it("ipInCidr/isInRanges are consistent for edge prefixes", () => {
    expect(ipInAnyCidr("173.245.48.0", ["173.245.48.0/20"])).toBe(true);
    expect(ipInAnyCidr("173.245.63.255", ["173.245.48.0/20"])).toBe(true);
    expect(ipInAnyCidr("173.245.64.0", ["173.245.48.0/20"])).toBe(false);
  });
});

describe("auditOriginExposure", () => {
  it("invalid domain → insufficient_data, and NO network is attempted", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as any;
    const r = await auditOriginExposure("not a domain");
    expect(r.band).toBe("insufficient_data");
    expect(spy).not.toHaveBeenCalled();
  });

  it("apex Cloudflare-fronted + a subdomain on a non-CF IP → possible_exposure with an alternative", async () => {
    const domain = `origincheck-${RUN}.com`;
    stubFetch();
    RESOLVE.v4 = (name) => {
      if (name === domain || name === `www.${domain}`) return ["104.16.10.20"]; // Cloudflare
      if (name === `dev.${domain}`) return ["203.0.113.77"];                    // leak
      return [];
    };
    const r = await auditOriginExposure(domain);
    expect(r.cdnFronted).toBe(true);
    expect(r.band).toBe("possible_exposure");
    expect(r.uniqueExposedIps).toContain("203.0.113.77");
    expect(r.exposed.some((e) => e.name === `dev.${domain}`)).toBe(true);
    // Provider enrichment via public RDAP.
    expect(r.provider).toBe("DigitalOcean");
    expect(r.candidates.some((c) => c.ip === "203.0.113.77" && c.provider === "DigitalOcean")).toBe(true);
    // Defensive: we NEVER confirm the origin - only surface candidates.
    expect(r.originFound).toBe(false);
    expect(r.confidenceScore).toBeGreaterThan(0);
    // Historical DNS is env-gated → not connected without the key.
    expect(r.historical.available).toBe(false);
    // Rule 3: a leak is a lead, not proof - alternative explanation required.
    expect(r.alternative.toLowerCase()).toContain("not proof");
    expect(r.recommendations.length).toBeGreaterThan(0);
    // Honesty: the note states we never probe/connect to the origin.
    expect(r.note.toLowerCase()).toContain("never probes");
  });

  it("apex Cloudflare-fronted, nothing outside CF → no_exposure_observed", async () => {
    const domain = `clean-${RUN}.com`;
    stubFetch();
    RESOLVE.v4 = (name) =>
      name === domain || name === `www.${domain}` ? ["172.64.5.5"] : [];
    const r = await auditOriginExposure(domain);
    expect(r.cdnFronted).toBe(true);
    expect(r.band).toBe("no_exposure_observed");
    expect(r.uniqueExposedIps.length).toBe(0);
  });

  it("apex not in CF ranges → not_cdn_fronted (serving IP is public by design)", async () => {
    const domain = `direct-${RUN}.com`;
    stubFetch();
    RESOLVE.v4 = (name) => (name === domain ? ["198.51.100.9"] : []);
    const r = await auditOriginExposure(domain);
    expect(r.cdnFronted).toBe(false);
    expect(r.band).toBe("not_cdn_fronted");
  });
});
