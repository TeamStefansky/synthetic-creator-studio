// P4 - foreign-influence v2 + cross-language mirroring + the single rubric bump.
// summarizeForeign is pure (no network) and fully testable; the network/LLM paths
// are covered for graceful degradation. All framing stays "correlation, not proof".

import { describe, it, expect } from "vitest";
import { summarizeForeign } from "../lib/narrative/foreign";
import { detectMirroring } from "../lib/narrative/mirroring";
import { computeThreat } from "../lib/narrative/threat";
import { RUBRIC_VERSION } from "../lib/narrative/sentiment";
import type { DomainIntel, Mention, SourceStatus } from "../lib/narrative/types";

const SRC: SourceStatus[] = [{ source: "gdelt", connected: true, count: 0 }];

describe("summarizeForeign (pure aggregation)", () => {
  const intel: DomainIntel[] = [
    { domain: "a.example", count: 5, registrantCountry: "RU", hostingCountry: "RU", asn: "AS100", asnOrg: "NetOne" },
    { domain: "b.example", count: 4, registrantCountry: "RU", hostingCountry: "RU", asn: "AS100", asnOrg: "NetOne" },
    { domain: "c.example", count: 3, registrantCountry: "US", hostingCountry: "RU", asn: "AS200", asnOrg: "NetTwo" },
    { domain: "d.example", count: 1 }, // unresolved
  ];
  it("computes resolved count, country shares, and shared-ASN groups", () => {
    const s = summarizeForeign(intel);
    expect(s.considered).toBe(4);
    expect(s.resolved).toBe(3);
    expect(s.topHostingCountry).toBe("RU");
    expect(s.hostingShare).toBeCloseTo(1, 5); // all 3 resolved host in RU
    expect(s.topRegistrantCountry).toBe("RU");
    expect(s.registrantShare).toBeCloseTo(2 / 3, 5);
    const shared = s.sharedAsn.find((g) => g.asn === "AS100");
    expect(shared?.domains.sort()).toEqual(["a.example", "b.example"]);
  });
  it("handles empty intel without throwing", () => {
    const s = summarizeForeign([]);
    expect(s).toMatchObject({ considered: 0, resolved: 0, hostingShare: 0, registrantShare: 0 });
    expect(s.sharedAsn).toEqual([]);
  });
});

describe("detectMirroring degrades honestly", () => {
  it("returns available:false when the AI layer is not connected (no key)", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const r = await detectMirroring("acme", [
      { source: "gdelt", id: "1", text: "hello", lang: "eng" },
      { source: "gdelt", id: "2", text: "hola", lang: "spa" },
    ]);
    expect(r.available).toBe(false);
    expect(r.mirrored).toBe(false);
    expect(r.reason).toMatch(/not connected/i);
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
  });
});

describe("threat foreign v2 + rubric bump", () => {
  const mentions: Mention[] = [
    { source: "gdelt", id: "1", text: "acme scandal", account: "a.example", url: "https://a.example/1", lang: "eng", country: "RU", timestamp: "2024-03-01T08:00:00Z" },
    { source: "gdelt", id: "2", text: "acme scandal", account: "b.example", url: "https://b.example/2", lang: "eng", country: "RU", timestamp: "2024-03-01T09:00:00Z" },
    { source: "gdelt", id: "3", text: "acme escándalo", account: "c.example", url: "https://c.example/3", lang: "spa", country: "RU", timestamp: "2024-03-01T10:00:00Z" },
  ];

  it("stamps the bumped rubric version on every report", () => {
    expect(RUBRIC_VERSION).toBe("truthlens-threat-rubric-v2");
    expect(computeThreat("acme", mentions, SRC).rubricVersion).toBe(RUBRIC_VERSION);
  });

  it("infrastructure + mirroring raise the foreign indicator and its confidence", () => {
    const lexical = computeThreat("acme", mentions, SRC).indicators.find((i) => i.key === "foreign")!;
    const deep = computeThreat("acme", mentions, SRC, undefined, {
      foreign: {
        intel: [], considered: 3, resolved: 3,
        topRegistrantCountry: "RU", registrantShare: 1,
        topHostingCountry: "RU", hostingShare: 1,
        sharedAsn: [{ asn: "AS100", asnOrg: "NetOne", domains: ["a.example", "b.example"] }],
        privacyCount: 0,
      },
      mirroring: { available: true, mirrored: true, languages: ["eng", "spa"], claim: "acme is corrupt", alternative: "translated news" },
    }).indicators.find((i) => i.key === "foreign")!;

    expect(deep.score).toBeGreaterThan(lexical.score);
    expect(deep.confidence).toBeGreaterThan(lexical.confidence);
    expect(deep.signals.join(" ")).toMatch(/mirrored across/i);
    expect(deep.signals.join(" ")).toMatch(/share network AS100/i);
    // Framing is preserved: correlation, not proof.
    expect(deep.alternative.toLowerCase()).toContain("not proof");
  });

  it("keeps foreign Unknown-ish and lexical when no deep layer and no lang/country data", () => {
    const plain: Mention[] = [
      { source: "reddit", id: "1", text: "acme is bad", account: "u1", timestamp: "2024-03-01T08:00:00Z" },
    ];
    const f = computeThreat("acme", plain, SRC).indicators.find((i) => i.key === "foreign")!;
    expect(f.level).toBe("Unknown"); // confidence 0.1 < 0.15 → Unknown, never fabricated
  });
});
