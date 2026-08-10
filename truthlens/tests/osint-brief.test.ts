// Brief-mode selector extraction. Gates: pulls AdSense/ASN/GA/domains out of a
// pasted brief; strips wildcards + noise; dedupes + caps; a title is derived.

import { describe, it, expect } from "vitest";
import { extractSelectors, selectorCount, briefTitle } from "@/lib/osint/brief";

const BRIEF = `# Russia/China FIMI Distribution
Hard selectors to pivot from:
- AdSense ca-pub-5378976189690174; backlink hub timesnewswire.com; Tencent Cloud AS132203.
- CopyCop fingerprint hosting near 72.14.185.187 (AS63949); GA UA-23181380-2 and G-ABCDEF12.
- Pravda schema: *.news-pravda.com, moldova-news.com, and see example.com for noise.`;

describe("extractSelectors", () => {
  const s = extractSelectors(BRIEF);
  it("extracts AdSense pub ids", () => expect(s.adsense).toContain("ca-pub-5378976189690174"));
  it("extracts ASNs (uppercased, deduped)", () => expect(s.asn.sort()).toEqual(["AS132203", "AS63949"]));
  it("extracts GA/GTM ids", () => { expect(s.ga).toContain("UA-23181380-2"); expect(s.ga).toContain("G-ABCDEF12"); });
  it("extracts domains, strips *. wildcard, drops noise (example.com)", () => {
    expect(s.domains).toContain("timesnewswire.com");
    expect(s.domains).toContain("news-pravda.com");
    expect(s.domains).toContain("moldova-news.com");
    expect(s.domains).not.toContain("example.com");
  });
  it("counts selectors and derives a title from the first heading", () => {
    expect(selectorCount(s)).toBeGreaterThanOrEqual(6);
    expect(briefTitle(BRIEF)).toBe("Russia/China FIMI Distribution");
  });
  it("empty text → empty selectors", () => {
    const e = extractSelectors("");
    expect(selectorCount(e)).toBe(0);
  });
});
