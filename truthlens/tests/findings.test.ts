import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildFindings, findingsToMarkdown, type FindingsReport } from "../lib/clues/findings";

// Minimal localStorage + window shim so the browser-local case-board engine runs
// under the node test environment.
function shim(store: Record<string, string>) {
  const m = new Map(Object.entries(store));
  (globalThis as any).window = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}
afterEach(() => { delete (globalThis as any).window; delete (globalThis as any).localStorage; });

const check = (id: string, headline: string) => ({ id, type: "site", input: id, headline, createdAt: "2026-01-01T00:00:00Z" });

describe("case board - findings synthesis", () => {
  beforeEach(() => {
    shim({
      "tl:checks": JSON.stringify([check("c1", "shovrimshtika.org"), check("c2", "techforpalestine.org"), check("c3", "unrelated.com")]),
      // c1 & c2 share the niche host operator "1984" and an ASN; c3 is alone.
      "tl:clueindex": JSON.stringify({
        "net_org:1984": ["c1", "c2"],
        "asn:as9009": ["c1", "c2"],
        "ga_id:g-abc123": ["c1", "c2"],
        "domain:solo.example": ["c3"],
      }),
    });
  });

  it("turns shared entities into leads, ranked by discriminating power", () => {
    const r = buildFindings();
    // net_org, asn, ga_id are each shared by 2 searches -> 3 leads; the solo domain is not.
    expect(r.findings).toHaveLength(3);
    // GA id (near-unique) must outrank the ASN (spans thousands of customers).
    expect(r.findings[0].band).toBe("High");
    expect(r.findings[0].kind).toBe("ga_id");
    expect(r.findings.find((f) => f.kind === "asn")?.band).toBe("Low");
    expect(r.findings.find((f) => f.kind === "net_org")?.band).toBe("Medium");
  });

  it("every lead carries evidence, an alternative, and next-step pivots", () => {
    const f = buildFindings().findings.find((x) => x.kind === "net_org")!;
    expect(f.evidence).toContain("1984");
    expect(f.alternative.length).toBeGreaterThan(10);
    expect(f.nextSteps.length).toBeGreaterThan(0);
    expect(f.nextSteps.some((n) => n.href.includes("/tools/sanctions"))).toBe(true);
  });

  it("clusters the transitively-linked searches (c1+c2), excluding the lone c3", () => {
    const r = buildFindings();
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0].searches.map((s) => s.id).sort()).toEqual(["c1", "c2"]);
    expect(r.clusters[0].band).toBe("High"); // inherits the strongest binding
    expect(r.linkedSearches).toBe(2);
    expect(r.searchCount).toBe(3);
  });

  it("no shared entities -> no connections found (a valid result)", () => {
    shim({ "tl:checks": JSON.stringify([check("c1", "a.com")]), "tl:clueindex": JSON.stringify({ "domain:a.com": ["c1"] }) });
    const r = buildFindings();
    expect(r.findings).toHaveLength(0);
    expect(r.clusters).toHaveLength(0);
    expect(findingsToMarkdown(r)).toContain("No connections found");
  });

  it("markdown brief lists leads with evidence + alternative", () => {
    const md = findingsToMarkdown(buildFindings());
    expect(md).toContain("case brief");
    expect(md).toContain("Could also be");
    expect(md).toContain("1984");
  });
});
