// Casebook dossier builder. Gates: assembled ONLY from collected searches
// (never fabricated); a distinctive shared identifier (GA id) yields an
// Association with confidence + an alternative; generic overlap alone never
// exceeds "Weak association"; the conclusion is capped at Association; a single
// search → Insufficient data; deterministic (same input → same dossier);
// gaps (what wasn't scanned) are always stated.

import { describe, it, expect } from "vitest";
import { buildDossier, type DossierCheck } from "@/lib/casebook/dossier";

const AT = "2026-08-09T00:00:00.000Z";

// Two site reports sharing a Google Analytics id (the "1984" signature link).
const siteA: DossierCheck = {
  id: "a", type: "site", input: "shovrimshtika.org", headline: "shovrimshtika.org — likely legitimate",
  level: "Low", createdAt: AT,
  result: { risk: { score: 33, confidence: "High" }, trackers: { gaIds: ["UA-23181380-2"] }, ip: "35.201.107.91" },
};
const siteB: DossierCheck = {
  id: "b", type: "site", input: "techforpalestine.org", headline: "techforpalestine.org — high risk",
  level: "High", createdAt: AT,
  result: { risk: { score: 83, confidence: "Medium" }, trackers: { gaIds: ["UA-23181380-2"] }, ip: "35.201.107.91" },
};

describe("buildDossier", () => {
  it("needs ≥2 searches — a single search is Insufficient data", () => {
    const d = buildDossier({ caseId: "c1", name: "Case", checks: [siteA], generatedAt: AT });
    expect(d.conclusionLevel).toBe("Insufficient data");
    expect(d.bluf).toMatch(/add at least two/i);
  });

  it("surfaces a shared GA id as a High-confidence Association with an alternative", () => {
    const d = buildDossier({ caseId: "c1", name: "BtS ↔ TfP", checks: [siteA, siteB], generatedAt: AT });
    const ga = d.evidence.find((e) => e.kind === "ga_id");
    expect(ga).toBeTruthy();
    expect(ga!.value).toBe("UA-23181380-2");
    expect(ga!.confidence).toBe("High");
    expect(ga!.alternative).toMatch(/copied|agency/i); // never presented as proof
    expect(ga!.searches.sort()).toEqual(["a", "b"]);
    expect(d.conclusionLevel).toBe("Association");
    expect(d.conclusionConfidence).toBe("High");
  });

  it("is strongest-first: distinctive GA id ranks above a shared IP", () => {
    const d = buildDossier({ caseId: "c1", name: "x", checks: [siteA, siteB], generatedAt: AT });
    expect(d.evidence[0].kind).toBe("ga_id");
    expect(d.evidence.some((e) => e.kind === "ip")).toBe(true);
  });

  it("generic infrastructure overlap alone never exceeds Weak association", () => {
    const ipOnlyA: DossierCheck = { id: "a", type: "site", input: "one.example", headline: "one", createdAt: AT, result: { ip: "104.20.28.231" } };
    const ipOnlyB: DossierCheck = { id: "b", type: "site", input: "two.example", headline: "two", createdAt: AT, result: { ip: "104.20.28.231" } };
    const d = buildDossier({ caseId: "c1", name: "ip", checks: [ipOnlyA, ipOnlyB], generatedAt: AT });
    expect(d.conclusionLevel).toBe("Weak association");
    expect(["Association"]).not.toContain(d.conclusionLevel); // capped
  });

  it("no shared distinctive entity → No link established (Unknown is valid)", () => {
    const c1: DossierCheck = { id: "a", type: "site", input: "alpha.example", headline: "alpha", createdAt: AT, result: { ip: "1.2.3.4" } };
    const c2: DossierCheck = { id: "b", type: "site", input: "beta.example", headline: "beta", createdAt: AT, result: { ip: "9.8.7.6" } };
    const d = buildDossier({ caseId: "c1", name: "none", checks: [c1, c2], generatedAt: AT });
    expect(d.conclusionLevel).toBe("No link established");
  });

  it("builds subject cards with the collected risk scores", () => {
    const d = buildDossier({ caseId: "c1", name: "x", checks: [siteA, siteB], generatedAt: AT });
    expect(d.subjects).toHaveLength(2);
    const tfp = d.subjects.find((s) => s.domain === "techforpalestine.org")!;
    expect(tfp.risk).toBe(83);
    expect(d.bluf).toMatch(/83\/100/);
  });

  it("lists infrastructure from origin/linkboard searches", () => {
    const origin: DossierCheck = {
      id: "o", type: "origin", input: "shovrimshtika.org", headline: "origin",
      createdAt: AT, result: { asn: "AS44925", asnOrg: "THE-1984-AS" },
    };
    const d = buildDossier({ caseId: "c1", name: "x", checks: [siteA, siteB, origin], generatedAt: AT });
    expect(d.infrastructure.some((f) => f.value === "AS44925")).toBe(true);
    expect(d.toolsUsed).toContain("Origin Exposure");
  });

  it("always states gaps and never drops the disclaimer", () => {
    const d = buildDossier({ caseId: "c1", name: "x", checks: [siteA, siteB], generatedAt: AT });
    expect(d.gaps.length).toBeGreaterThan(0);
    expect(d.gaps.join(" ")).toMatch(/not shared ownership/i);
    expect(d.disclaimer).toMatch(/not a verdict/i);
  });

  it("surfaces documented host conduct (1984/AS44925) at High, cited, in the BLUF", () => {
    const origin: DossierCheck = {
      id: "o", type: "origin", input: "shovrimshtika.org", headline: "origin",
      createdAt: AT, result: { asn: "AS44925", asnOrg: "THE-1984-AS" },
    };
    const d = buildDossier({ caseId: "c1", name: "x", checks: [siteA, siteB, origin], generatedAt: AT });
    expect(d.hostConduct.length).toBeGreaterThan(0);
    const h = d.hostConduct[0];
    expect(h.org).toBe("1984 ehf");
    expect(h.confidence).toBe("High");
    expect(h.topSeverity).toBe("high");
    // the load-bearing, citable finding leads the bottom line, WITH the client caveat
    expect(d.bluf).toMatch(/1984 ehf/);
    expect(d.bluf).toMatch(/not proof that any particular client/i);
  });

  it("does not attach host conduct when no host on file is in the case", () => {
    const d = buildDossier({ caseId: "c1", name: "x", checks: [siteA, siteB], generatedAt: AT });
    expect(d.hostConduct).toEqual([]);
  });

  it("is deterministic (same input → identical dossier)", () => {
    const a = buildDossier({ caseId: "c1", name: "x", checks: [siteA, siteB], generatedAt: AT });
    const b = buildDossier({ caseId: "c1", name: "x", checks: [siteA, siteB], generatedAt: AT });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
