// OSINT research v2 - deep layer, pure parts. Gates: a shared CDN/mega-cloud IP
// never counts as an operator link (class characteristics never individualize);
// site age is the EARLIEST observable signal and "not collected" when absent;
// documented-reference hits are cited and distinguish "not populated" from "no
// match"; coordination alone never lifts confidence to High; every report keeps
// the null AND deception hypotheses; Strong coordination carries "actor
// UNDETERMINED"; no person/actor label is invented.

import { describe, it, expect } from "vitest";
import { scoreSharedInfra, siteAge, documentedMatches, SHARED_IP_MIN, RECENT_SITE_DAYS } from "@/lib/osint/deepen";
import { deriveConfidence, assembleReportInput, watchlistHitsFor, allDocumentedHits, type ResearchFindings } from "@/lib/osint/research";
import { getResolvedRules } from "@/lib/osint/watchlist";
import type { CibReport } from "@/lib/cib/analyze";

const rules = getResolvedRules({} as any);

function findings(over: Partial<ResearchFindings> = {}): ResearchFindings {
  return {
    kind: "domain", value: "example.com", watchlist: null,
    trackers: { gaIds: [], adsenseIds: [] }, pivots: [], articles: [], toolsLive: ["crtsh.certs"], toolsNotConfigured: [], log: [], ...over,
  };
}

function cib(likelihood: CibReport["likelihood"]): CibReport {
  return {
    entity: "x", likelihood, totalItems: 40, accounts: 12, clusters: [{ text: "same copy pasted", accounts: 6, size: 9, sources: ["bluesky"] }],
    signals: [{ name: "Content similarity", confidence: "High", evidence: ["9 near-duplicates across 6 accounts"], alternative: "a widely quoted headline" }],
    collectionGaps: [], attribution: "Actor is UNDETERMINED.", nextSteps: [], generatedAt: "2026-10-02T00:00:00Z",
  };
}

describe("scoreSharedInfra (second hop)", () => {
  const seed = { ip: "203.0.113.7", asn: "AS64500", org: "Tiny Hosting LLC" };
  it("corroborates only when ≥ SHARED_IP_MIN discovered domains sit on the seed's own non-CDN IP", () => {
    const rows = [
      { domain: "a.com", ip: "203.0.113.7", asn: "AS64500" },
      { domain: "b.com", ip: "203.0.113.7", asn: "AS64500" },
      { domain: "c.com", ip: "203.0.113.9", asn: "AS64500" },
      { domain: "d.com", ip: "198.51.100.1", asn: "AS64501" },
    ];
    const s = scoreSharedInfra(seed, rows);
    expect(s.sameIp).toEqual(["a.com", "b.com"]);
    expect(s.sameAsn).toEqual(["c.com"]);
    expect(s.sameIp.length).toBeGreaterThanOrEqual(SHARED_IP_MIN);
    expect(s.corroborates).toBe(true);
    expect(scoreSharedInfra(seed, rows.slice(0, 1)).corroborates).toBe(false);
  });
  it("a seed on CDN space never corroborates, even with identical IPs", () => {
    const cf = { ip: "104.16.1.1", asn: "AS13335", org: "Cloudflare, Inc." };
    const s = scoreSharedInfra(cf, [{ domain: "a.com", ip: "104.16.1.1" }, { domain: "b.com", ip: "104.16.1.1" }, { domain: "c.com", ip: "104.16.1.1" }]);
    expect(s.seedOnCdn).toBe("Cloudflare");
    expect(s.sameIp).toEqual([]);
    expect(s.corroborates).toBe(false);
  });
  it("members that are themselves on CDN space are excluded", () => {
    const s = scoreSharedInfra(seed, [{ domain: "a.com", ip: "203.0.113.7", cdn: "Fastly" }, { domain: "b.com", ip: "203.0.113.7", cdn: "Fastly" }]);
    expect(s.corroborates).toBe(false);
  });
});

describe("siteAge (earliest observable, not creation)", () => {
  const now = Date.parse("2026-10-02");
  it("uses the earliest of Wayback first-seen and RDAP registration", () => {
    const a = siteAge("2026-08-01", 3, { registrationDate: "2026-07-20T00:00:00Z" }, now);
    expect(a.registered).toBe("2026-07-20");
    expect(a.ageDays).toBe(74);
    expect(a.recent).toBe(true);
    expect(a.ageDays!).toBeLessThanOrEqual(RECENT_SITE_DAYS);
  });
  it("an old site is not recent; no signals → age not collected (never guessed)", () => {
    expect(siteAge("2011-01-01", 900, undefined, now).recent).toBe(false);
    const none = siteAge(undefined, 0, undefined, now);
    expect(none.ageDays).toBeUndefined();
    expect(none.recent).toBe(false);
  });
});

describe("documentedMatches (cited reference sets)", () => {
  it("flags a discovered state-media domain with its citation, and reports the datasets as populated", () => {
    const m = documentedMatches("example.com", ["https://www.rt.com/news", "unrelated.org"]);
    expect(m.referencePopulated).toBe(true);
    expect(m.seed).toEqual([]);
    const rt = m.related.find((h) => h.domain === "rt.com");
    expect(rt?.kind).toBe("state-media");
    expect(rt?.citation).toMatch(/^https:\/\//);
  });
  it("discovered domains matching a curated cluster become cited watchlist hits", () => {
    const hits = watchlistHitsFor(["regional.news-pravda.com", "totally-unrelated.com"], rules);
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("curated-watchlist");
    expect(hits[0].citation).toBeTruthy();
  });
});

describe("deriveConfidence v2 (corroboration, still capped)", () => {
  it("shared non-CDN IP corroboration → Moderate", () => {
    const deep: any = { sharedInfra: { corroborates: true, sameIp: ["a.com", "b.com"], sameAsn: [] }, documented: { seed: [], related: [], referencePopulated: true }, coHosted: { collected: false, domains: [] }, age: { snapshots: 0, recent: false } };
    expect(deriveConfidence(findings({ deep }))).toBe("Moderate");
  });
  it("Strong coordination alone is Moderate - behaviour never reaches High without a documented anchor", () => {
    const coordination = { collected: true, mentions: 40, sourcesLive: ["bluesky (40)"], sourcesOff: [], sourcesFailed: [], cib: cib("Strong") };
    expect(deriveConfidence(findings({ coordination }))).toBe("Moderate");
    expect(deriveConfidence(findings({ coordination: { ...coordination, cib: cib("Weak") } }))).toBe("Low");
  });
  it("a seed in a cited reference set is a documented anchor", () => {
    const deep: any = { sharedInfra: { corroborates: false, sameIp: [], sameAsn: [] }, documented: { seed: [{ domain: "rt.com", kind: "state-media", label: "RT" }], related: [], referencePopulated: true }, coHosted: { collected: false, domains: [] }, age: { snapshots: 0, recent: false } };
    expect(deriveConfidence(findings({ value: "rt.com", deep }))).toBe("Moderate");
  });
});

describe("assembleReportInput v2 (hypotheses + coordination framing)", () => {
  it("always carries the null AND the deception hypothesis", () => {
    const input = assembleReportInput(findings(), "2026-10-02", "run-1");
    expect(input.ach_table_rows).toMatch(/H0 \(null\)/);
    expect(input.ach_table_rows).toMatch(/H-D \(deception\)/);
  });
  it("Strong coordination renders 'actor UNDETERMINED', the alternative explanation, and no invented actor", () => {
    const coordination = { collected: true, mentions: 40, sourcesLive: ["bluesky (40)"], sourcesOff: ["x"], sourcesFailed: [], cib: cib("Strong") };
    const input = assembleReportInput(findings({ kind: "freetext", value: "some narrative", coordination }), "2026-10-02", "run-2");
    expect(input.narrative_analysis).toMatch(/Strong - actor UNDETERMINED/);
    expect(input.narrative_analysis).toMatch(/Could also be explained by/);
    expect(input.assessed_actor).toBe("Undetermined");
    expect(input.ach_table_rows).toMatch(/actor UNDETERMINED/);
    expect(input.gaps).toMatch(/x/);
  });
  it("not-collected coordination says Unknown honestly instead of inventing a grade", () => {
    const coordination = { collected: false, mentions: 0, sourcesLive: [], sourcesOff: [], sourcesFailed: [], note: "no public mentions collected" };
    const input = assembleReportInput(findings({ kind: "freetext", value: "q", coordination }), "2026-10-02", "run-3");
    expect(input.narrative_analysis).toMatch(/not collected/);
    expect(input.narrative_analysis).toMatch(/Unknown/);
  });
  it("documented hits land in the asset table with their citation", () => {
    const deep: any = { sharedInfra: { corroborates: false, sameIp: [], sameAsn: [] }, documented: { seed: [], related: [{ domain: "rt.com", kind: "state-media", label: "RT", citation: "https://consilium.europa.eu/x" }], referencePopulated: true }, coHosted: { collected: false, skippedReason: "seed IP not resolved", domains: [] }, age: { snapshots: 0, recent: false } };
    const f = findings({ deep });
    expect(allDocumentedHits(f)).toHaveLength(1);
    const input = assembleReportInput(f, "2026-10-02", "run-4");
    expect(input.asset_table_rows).toMatch(/rt\.com .*documented: state-media/);
    expect(input.sources_numbered_with_links).toMatch(/consilium/);
    expect(input.gaps).toMatch(/Co-hosting not collected/);
  });
});
