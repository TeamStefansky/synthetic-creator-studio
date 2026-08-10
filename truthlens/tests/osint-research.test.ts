// OSINT research orchestrator - pure parts. Gates: query classification;
// watchlist matching by domain/ASN/AdSense; confidence derived FROM EVIDENCE and
// capped; report assembly fills real rows and stays honest (org-level actor,
// null hypothesis always present) with no network access.

import { describe, it, expect } from "vitest";
import {
  classifyQuery, matchWatchlist, deriveConfidence, assembleReportInput, type ResearchFindings,
} from "@/lib/osint/research";
import { getResolvedRules } from "@/lib/osint/watchlist";

const rules = getResolvedRules({} as any); // no keys

describe("classifyQuery", () => {
  it("routes each selector shape", () => {
    expect(classifyQuery("AS44925")).toEqual({ kind: "asn", value: "AS44925" });
    expect(classifyQuery("ca-pub-5378976189690174")).toEqual({ kind: "adsense_id", value: "ca-pub-5378976189690174" });
    expect(classifyQuery("UA-23181380-2").kind).toBe("ga_id");
    expect(classifyQuery("https://techforpalestine.org/x")).toEqual({ kind: "domain", value: "techforpalestine.org" });
    expect(classifyQuery("Portal Kombat")).toEqual({ kind: "freetext", value: "Portal Kombat" });
  });
});

describe("matchWatchlist", () => {
  it("matches a documented cluster by ASN and by AdSense id", () => {
    expect(matchWatchlist("asn", "AS63949", rules)?.id).toBe("copycop-fingerprint");
    expect(matchWatchlist("adsense_id", "ca-pub-5378976189690174", rules)?.id).toBe("paperwall-adsense-pivot");
    expect(matchWatchlist("domain", "regional.news-pravda.com", rules)?.id).toBe("pravda-new-subdomains");
    expect(matchWatchlist("domain", "totally-unrelated.com", rules)).toBeNull();
  });
});

function findings(over: Partial<ResearchFindings> = {}): ResearchFindings {
  return {
    kind: "domain", value: "example.com", watchlist: null,
    trackers: { gaIds: [], adsenseIds: [] }, pivots: [], toolsLive: ["crtsh.certs"], toolsNotConfigured: [], log: [], ...over,
  };
}

describe("deriveConfidence (from evidence, capped)", () => {
  it("Low with only crt.sh, Moderate with an anchor, High only with a documented anchor + corroboration", () => {
    expect(deriveConfidence(findings())).toBe("Low");
    expect(deriveConfidence(findings({ hostConduct: { matched: true } as any }))).toBe("Moderate");
    const wlHigh = rules.find((r) => r.confidence === "high")!;
    expect(deriveConfidence(findings({ watchlist: wlHigh, hostConduct: { matched: true } as any }))).toBe("High");
    // high-confidence watchlist but no corroboration → still only Moderate
    expect(deriveConfidence(findings({ watchlist: wlHigh }))).toBe("Moderate");
  });
});

describe("assembleReportInput", () => {
  it("produces a valid, org-level report with the null hypothesis and honest gaps", () => {
    const wl = rules.find((r) => r.id === "paperwall-adsense-pivot")!;
    const f = findings({
      kind: "adsense_id", value: "ca-pub-5378976189690174", watchlist: wl,
      pivots: [{ kind: "adsense_id", value: "ca-pub-5378976189690174", results: [], members: ["a.com", "b.com", "c.com"], connectedTools: ["reversetracker.spyonweb"], notConnectedTools: [] }],
      toolsLive: ["crtsh.certs", "reversetracker.spyonweb"], toolsNotConfigured: ["reversetracker.publicwww"],
    });
    const input = assembleReportInput(f, "2026-08-10", "run-x");
    expect(input.assessed_actor).toBe(wl.attribution);
    expect(input.overall_confidence).toBe("High"); // high wl + 3 pivot members
    expect(input.asset_table_rows).toMatch(/a\.com/);
    expect(input.ach_table_rows).toMatch(/null/i); // null hypothesis always present
    expect(input.gaps).toMatch(/publicwww/i); // not-connected disclosed
    expect(input.sources_numbered_with_links).toMatch(/Citizen Lab/);
  });

  it("folds an Early-Warning Radar forecast into the impact section", () => {
    const f = findings({ forecast: { available: true, band: "Warning", hazard: 0.78, horizonDays: 7, confidence: "Medium", estimative: "Likely", alternative: "An organic news cycle can explain the same rise.", indicators: [], evidence: [], version: "x" } as any });
    const input = assembleReportInput(f, "2026-08-10", "run-z");
    expect(input.impact_evidence).toMatch(/Early-Warning Radar: Warning/);
    expect(input.impact_evidence).toMatch(/hazard 78%/);
  });

  it("no match → Undetermined actor, Low confidence, null hypothesis only", () => {
    const input = assembleReportInput(findings(), "2026-08-10", "run-y");
    expect(input.assessed_actor).toBe("Undetermined");
    expect(input.overall_confidence).toBe("Low");
    expect(input.ach_table_rows).toMatch(/no coordinated operation/i);
  });
});
