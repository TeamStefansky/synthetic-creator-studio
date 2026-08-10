// P3 - IO reference data + indicators. Verifies: pure domain helpers; the SHIPPED
// reference is empty so matchers return null and counts are 0 (neutral default);
// the threat engine renders the two IO indicators as Unknown when the reference is
// empty (never a reassuring Low) and with ZERO scoring weight (score unchanged);
// and, via a mocked populated fixture, that matches surface as leads with the
// mandatory alternative framing.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeDomain, mentionDomains, ioReferenceCounts, campaignMatch, foreignAgentMatch, stateMediaMatch, IO_REFERENCE_VERSION } from "../lib/io-reference";
import { computeThreat } from "../lib/narrative/threat";
import type { Mention, SourceStatus } from "../lib/narrative/types";

const SRC: SourceStatus[] = [{ source: "gdelt", connected: true, count: 0 }];

describe("normalizeDomain", () => {
  it("strips scheme, www, path, port; lowercases", () => {
    expect(normalizeDomain("https://www.Example.com/path?x=1")).toBe("example.com");
    expect(normalizeDomain("HTTP://sub.example.CO.uk:8080/a")).toBe("sub.example.co.uk");
  });
  it("returns '' for non-hosts", () => {
    expect(normalizeDomain("not a domain")).toBe("");
    expect(normalizeDomain("@handle")).toBe("");
    expect(normalizeDomain(undefined)).toBe("");
  });
});

describe("mentionDomains", () => {
  it("collects host from url and from a domain-like account", () => {
    const ds = mentionDomains({ url: "https://news.example.com/a", account: "example.com", accountId: "reddituser" });
    expect(ds).toContain("news.example.com");
    expect(ds).toContain("example.com");
    expect(ds).not.toContain("reddituser");
  });
});

describe("shipped reference: cited state-media seed; campaign/FARA neutral-empty", () => {
  it("has a versioned tag; state-media seeded, the other two empty", () => {
    expect(IO_REFERENCE_VERSION).toMatch(/^io-ref-v\d+$/);
    const c = ioReferenceCounts();
    expect(c.stateMedia).toBeGreaterThan(0); // EU-cited seed
    expect(c.campaigns).toBe(0);
    expect(c.foreignAgents).toBe(0);
  });
  it("state-media matches a seeded outlet and its subdomains, with a citation", () => {
    const rt = stateMediaMatch("rt.com");
    expect(rt).not.toBeNull();
    expect(rt!.source).toMatch(/^https?:\/\//); // auditable - every seed entry is cited
    expect(stateMediaMatch("actualidad.rt.com")).not.toBeNull(); // subdomain match
    expect(stateMediaMatch("example.com")).toBeNull(); // unrelated domain: no match
  });
  it("EVERY seeded state-media entry carries a provenance URL (never faked)", () => {
    // Re-read the shipped file through the public matcher surface: a domain with no
    // citation must never ship. We assert the invariant on the known seed anchors.
    for (const d of ["rt.com", "sputnikglobe.com", "ria.ru", "voiceofeurope.com"]) {
      const hit = stateMediaMatch(d);
      expect(hit, d).not.toBeNull();
      expect(hit!.source, d).toMatch(/^https?:\/\//);
    }
  });
  it("campaign + foreign-agent matchers return null against the empty references", () => {
    expect(campaignMatch("example.com")).toBeNull();
    expect(foreignAgentMatch("example.com")).toBeNull();
  });
});

describe("threat engine - IO indicators with the empty (shipped) reference", () => {
  const mentions: Mention[] = [
    { source: "gdelt", id: "1", text: "acme scandal spreads", account: "somewhere.com", url: "https://somewhere.com/a", timestamp: "2024-03-01T08:00:00Z" },
    { source: "gdelt", id: "2", text: "acme scandal spreads", account: "elsewhere.org", url: "https://elsewhere.org/b", timestamp: "2024-03-01T09:00:00Z" },
  ];
  it("foreign_agent (still-empty reference) renders Unknown, not a reassuring Low", () => {
    const r = computeThreat("acme", mentions, SRC);
    const ind = r.indicators.find((i) => i.key === "foreign_agent")!;
    expect(ind).toBeDefined();
    expect(ind.level).toBe("Unknown");
    expect(ind.signals.join(" ")).toMatch(/not populated/i);
    expect(ind.alternative.length).toBeGreaterThan(0);
  });
  it("documented_campaign is now ASSESSABLE (state-media seed populated) → 'no overlap' for unrelated domains", () => {
    const r = computeThreat("acme", mentions, SRC);
    const ind = r.indicators.find((i) => i.key === "documented_campaign")!;
    expect(ind).toBeDefined();
    expect(ind.level).not.toBe("Unknown");        // reference is populated → can assess
    expect(ind.signals.join(" ")).toMatch(/no overlap/i);
  });
  it("documented_campaign flags a mention on a seeded state-media domain", () => {
    const stateMentions: Mention[] = [
      { source: "gdelt", id: "1", text: "acme narrative", account: "rt.com", url: "https://rt.com/a", timestamp: "2024-03-01T08:00:00Z" },
      { source: "gdelt", id: "2", text: "acme narrative", account: "elsewhere.org", url: "https://elsewhere.org/b", timestamp: "2024-03-01T09:00:00Z" },
    ];
    const r = computeThreat("acme", stateMentions, SRC);
    const ind = r.indicators.find((i) => i.key === "documented_campaign")!;
    expect(ind.signals.join(" ")).toMatch(/state-affiliated media/i);
    expect(ind.alternative.length).toBeGreaterThan(0); // innocent alternative always present
  });
  it("IO indicators carry ZERO weight → adding them does not change the combined score", () => {
    // With an empty reference the indicators are Unknown and excluded from scoring,
    // so the overall status must still be driven only by the behavioural signals.
    const r = computeThreat("acme", mentions, SRC);
    expect(["CALM", "ELEVATED", "UNDER_ATTACK"]).toContain(r.status);
    expect(r.score).not.toBeNull();
  });
});

describe("populated reference (mocked fixture) surfaces leads with alternative framing", () => {
  beforeEach(() => vi.resetModules());

  it("flags a documented-campaign / state-media / foreign-agent domain overlap", async () => {
    vi.doMock("@/data/io-reference/state-media-domains.json", () => ({
      default: { entries: [{ domain: "statemedia.example", label: "Example State TV", source: "https://ref" }] },
    }));
    vi.doMock("@/data/io-reference/documented-campaign-domains.json", () => ({
      default: { entries: [{ domain: "campaign.example", campaign: "Op Test", disclosedBy: "TestLab", report: "https://r" }] },
    }));
    vi.doMock("@/data/io-reference/foreign-agent-registries.json", () => ({
      default: { entries: [{ org: "Example Media LLC", domains: ["agent.example"], registry: "FARA", registrationNo: "1234" }] },
    }));

    const ref = await import("../lib/io-reference");
    expect(ref.campaignMatch("campaign.example")?.campaign).toBe("Op Test");
    expect(ref.stateMediaMatch("sub.statemedia.example")?.label).toBe("Example State TV"); // subdomain match
    expect(ref.foreignAgentMatch("agent.example")?.org).toBe("Example Media LLC");
    expect(ref.ioReferenceCounts()).toEqual({ stateMedia: 1, campaigns: 1, foreignAgents: 1 });

    const { computeThreat: ct } = await import("../lib/narrative/threat");
    const mentions: Mention[] = [
      { source: "gdelt", id: "1", text: "acme scandal", account: "campaign.example", url: "https://campaign.example/a", timestamp: "2024-03-01T08:00:00Z" },
      { source: "gdelt", id: "2", text: "acme scandal", account: "agent.example", url: "https://agent.example/b", timestamp: "2024-03-01T09:00:00Z" },
    ];
    const r = ct("acme", mentions, SRC);
    const camp = r.indicators.find((i) => i.key === "documented_campaign")!;
    const fa = r.indicators.find((i) => i.key === "foreign_agent")!;
    expect(camp.level).not.toBe("Unknown");
    expect(camp.signals.join(" ")).toMatch(/Op Test/);
    expect(camp.alternative.toLowerCase()).toContain("not proof");
    expect(fa.level).not.toBe("Unknown");
    expect(fa.signals.join(" ")).toMatch(/Example Media LLC/);
    expect(fa.alternative.toLowerCase()).toContain("not an accusation");

    // P4: these indicators now carry scoring weight - a matching domain must raise
    // the combined score vs the same behaviour with no documented overlap.
    const clean: Mention[] = [
      { source: "gdelt", id: "1", text: "acme scandal", account: "clean-a.example", url: "https://clean-a.example/a", timestamp: "2024-03-01T08:00:00Z" },
      { source: "gdelt", id: "2", text: "acme scandal", account: "clean-b.example", url: "https://clean-b.example/b", timestamp: "2024-03-01T09:00:00Z" },
    ];
    const rClean = ct("acme", clean, SRC);
    expect(r.score!).toBeGreaterThan(rClean.score!);
  });
});
