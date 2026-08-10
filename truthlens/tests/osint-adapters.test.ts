// OSINT pivot adapters - pure helpers. Gates: host normalization strips
// scheme/port/*./www; dedupe is stable + capped; provider parsers read their
// real response shapes; adaptersForKind routes tracker ids vs domains; a pivot
// with no keys returns honest not-connected for every provider (rule 7).

import { describe, it, expect, afterEach } from "vitest";
import {
  normHost, dedupeDomains, parsePublicwwwCsv, parseSpyonwebItems, adaptersForKind, runPivot,
} from "@/lib/osint/adapters";

describe("normHost", () => {
  it("normalizes and rejects non-hosts", () => {
    expect(normHost("HTTPS://WWW.Example.com/path?x=1")).toBe("example.com");
    expect(normHost("*.news-pravda.com")).toBe("news-pravda.com");
    expect(normHost("host:8080")).toBe("");        // no TLD after stripping port
    expect(normHost("sub.example.co.uk")).toBe("sub.example.co.uk");
    expect(normHost("not a domain")).toBe("");
  });
});

describe("dedupeDomains", () => {
  it("dedupes case-insensitively and caps", () => {
    expect(dedupeDomains(["A.com", "a.com", "b.com", "bad"])).toEqual(["a.com", "b.com"]);
    expect(dedupeDomains(["a.com", "b.com", "c.com"], 2)).toEqual(["a.com", "b.com"]);
  });
});

describe("provider parsers", () => {
  it("parsePublicwwwCsv drops the total line and keeps hosts", () => {
    expect(parsePublicwwwCsv("total;123\nfoo.com;x\nbar.com;y\n")).toEqual(["foo.com", "bar.com"]);
  });
  it("parseSpyonwebItems reads analytics + adsense item maps", () => {
    const json = { result: { analytics: { "UA-1": { items: { "a.com": 1, "b.com": 1 } } } } };
    expect(parseSpyonwebItems(json, "UA-1")).toEqual(["a.com", "b.com"]);
    const ads = { result: { adsense: { "ca-pub-9": { items: { "c.com": 1 } } } } };
    expect(parseSpyonwebItems(ads, "ca-pub-9")).toEqual(["c.com"]);
  });
});

describe("adaptersForKind", () => {
  it("routes tracker ids to reverse-lookup and domains to enumeration", () => {
    expect(adaptersForKind("adsense_id")).toContain("reversetracker.spyonweb");
    expect(adaptersForKind("domain")).toEqual(["crtsh.certs", "securitytrails.subdomains", "urlscan.search"]);
    expect(adaptersForKind("nonsense")).toEqual([]);
  });
});

describe("runPivot without keys (honest not-connected)", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it("reports every gated provider as not connected and finds no members", async () => {
    delete process.env.SPYONWEB_API_KEY; delete process.env.PUBLICWWW_API_KEY; delete process.env.DNSLYTICS_API_KEY;
    const r = await runPivot("adsense_id", "ca-pub-5378976189690174");
    expect(r.connectedTools).toEqual([]);
    expect(r.notConnectedTools).toContain("reversetracker.spyonweb");
    expect(r.notConnectedTools).toContain("reversetracker.publicwww");
    expect(r.members).toEqual([]);
    expect(r.results.every((x) => x.connected === false)).toBe(true);
  });
});
