// OSINT research orchestrator - pure parts. Gates: query classification;
// watchlist matching by domain/ASN/AdSense; confidence derived FROM EVIDENCE and
// capped; report assembly fills real rows and stays honest (org-level actor,
// null hypothesis always present) with no network access.

import { describe, it, expect } from "vitest";
import {
  classifyQuery, matchWatchlist, deriveConfidence, assembleReportInput, type ResearchFindings,
} from "@/lib/osint/research";
import { getResolvedRules } from "@/lib/osint/watchlist";
import { buildAnnex } from "@/lib/osint/annex";

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
    trackers: { gaIds: [], adsenseIds: [] }, pivots: [], articles: [], toolsLive: ["crtsh.certs"], toolsNotConfigured: [], log: [], ...over,
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

  it("resolved-ASN host conduct + RDAP fill the infrastructure section", () => {
    const f = findings({
      infra: { ip: "89.147.108.5", asn: "AS44925", org: "1984 ehf", country: "IS" } as any,
      rdap: { registrar: "Namecheap", registrationDate: "2019-04-01", registrantOrg: "Example Org" } as any,
      hostConduct: { matched: true, org: "1984 ehf" } as any,
    });
    const input = assembleReportInput(f, "2026-08-10", "run-i");
    expect(input.infra_table_rows).toMatch(/AS44925/);
    expect(input.infra_table_rows).toMatch(/Namecheap/);
    expect(input.infra_table_rows).toMatch(/1984 ehf/);
  });

  it("news articles become numbered primary sources", () => {
    const f = findings({ articles: [{ title: "State media pushes claim", url: "https://x.test/a", domain: "x.test", date: "2026-08-01" }] as any });
    const input = assembleReportInput(f, "2026-08-10", "run-n");
    expect(input.sources_numbered_with_links).toMatch(/State media pushes claim/);
  });

  it("no match → Undetermined actor, Low confidence, null hypothesis only", () => {
    const input = assembleReportInput(findings(), "2026-08-10", "run-y");
    expect(input.assessed_actor).toBe("Undetermined");
    expect(input.overall_confidence).toBe("Low");
    expect(input.ach_table_rows).toMatch(/no coordinated operation/i);
  });
});

describe("buildAnnex (Part II)", () => {
  it("assembles primary sources, monitor rules, provider RFI, and the honest co-residence test", () => {
    const wl = rules.find((r) => r.id === "paperwall-adsense-pivot")!;
    const f = findings({ watchlist: wl, articles: [{ title: "A", url: "https://x/a", domain: "x", date: "2026-08-01" }] as any });
    const a = buildAnnex(f, rules, {} as any);
    expect(a.primarySources.some((s) => s.kind === "news")).toBe(true);
    expect(a.primarySources.some((s) => s.kind === "reporting")).toBe(true); // cited reporting
    expect(a.watchlistRules[0].cluster).toBe(wl.cluster);
    expect(a.providerRfi.every((p) => p.status === "not connected")).toBe(true); // no keys
    expect(a.coResidence.tested).toBe(false);
    expect(a.coResidence.result).toMatch(/insufficient data/i); // honest, not a fake clean negative
    expect(a.markdown).toMatch(/Part II - Collection Annex/);
  });

  it("marks a provider connected when its key is present", () => {
    const a = buildAnnex(findings(), rules, { PUBLICWWW_API_KEY: "x" } as any);
    expect(a.providerRfi.find((p) => p.envVar === "PUBLICWWW_API_KEY")!.status).toBe("connected");
  });
});
