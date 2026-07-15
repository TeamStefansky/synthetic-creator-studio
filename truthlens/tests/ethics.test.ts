// Ethics-gate tests (CLAUDE.md non-negotiables), proven in code.
import { describe, it, expect } from "vitest";
import { computeThreat } from "../lib/narrative/threat";
import { RUBRIC_VERSION } from "../lib/narrative/sentiment";
import type { Mention, SourceStatus } from "../lib/narrative/types";

const sources: SourceStatus[] = [{ source: "gdelt", connected: true, count: 0 }];

function mk(text: string, account: string, source = "bluesky"): Mention {
  return { source, id: `${account}-${Math.random()}`, text, account, accountId: account, timestamp: new Date().toISOString() };
}

describe("ethics gates", () => {
  it("rule 4 — no signals yields Unknown, not a fabricated score", () => {
    const r = computeThreat("ACME", [], sources);
    expect(r.status).toBe("UNKNOWN");
    expect(r.score).toBeNull();
    expect(r.indicators).toHaveLength(0);
    expect(r.note).toBeTruthy();
  });

  it("rule 3 — every indicator carries a level, signals, and an alternative", () => {
    const mentions = [
      mk("ACME leaked all customer data", "a1"),
      mk("ACME leaked all customer data", "a2"),
      mk("ACME leaked all customer data", "a3"),
      mk("I like ACME products", "a4"),
    ];
    const r = computeThreat("ACME", mentions, sources);
    expect(r.indicators.length).toBeGreaterThan(0);
    for (const ind of r.indicators) {
      expect(["Low", "Medium", "High", "Unknown"]).toContain(ind.level);
      expect(Array.isArray(ind.signals)).toBe(true);
      expect(typeof ind.alternative).toBe("string");
      expect(ind.alternative.length).toBeGreaterThan(0);
    }
  });

  it("detects coordination when distinct accounts repeat identical text", () => {
    const mentions = [
      mk("boycott ACME now", "x1"), mk("boycott ACME now", "x2"), mk("boycott ACME now", "x3"),
    ];
    const r = computeThreat("ACME", mentions, sources);
    const coord = r.indicators.find((i) => i.key === "coordination");
    expect(coord).toBeDefined();
    expect(coord!.level).not.toBe("Unknown");
    expect(coord!.score).toBeGreaterThan(0);
  });

  it("rule 2 — earliest node is the earliest-timestamped mention (labeled in UI as observed-only)", () => {
    const mentions: Mention[] = [
      { source: "gdelt", id: "1", text: "later", account: "a", timestamp: "2024-03-02T10:00:00Z" },
      { source: "bluesky", id: "2", text: "earliest one", account: "b", timestamp: "2024-03-01T08:00:00Z" },
      { source: "reddit", id: "3", text: "middle", account: "c", timestamp: "2024-03-01T20:00:00Z" },
    ];
    const r = computeThreat("ACME", mentions, sources);
    expect(r.earliest?.text).toBe("earliest one");
  });

  it("rule 3 — foreign-influence indicator states correlation, not proof of state involvement", () => {
    const mentions: Mention[] = [
      { source: "gdelt", id: "1", text: "ACME scandal", account: "d1", lang: "eng", country: "Russia", timestamp: "2024-03-01T08:00:00Z" },
      { source: "gdelt", id: "2", text: "ACME scandal", account: "d2", lang: "eng", country: "Russia", timestamp: "2024-03-01T09:00:00Z" },
      { source: "gdelt", id: "3", text: "ACME escándalo", account: "d3", lang: "spa", country: "Iran", timestamp: "2024-03-01T10:00:00Z" },
      { source: "gdelt", id: "4", text: "ACME escándalo", account: "d4", lang: "spa", country: "Iran", timestamp: "2024-03-01T11:00:00Z" },
    ];
    const r = computeThreat("ACME", mentions, sources);
    const f = r.indicators.find((i) => i.key === "foreign");
    expect(f).toBeDefined();
    expect(f!.alternative.toLowerCase()).toContain("not proof");
  });

  it("sentiment rubric is versioned (reproducibility)", () => {
    expect(RUBRIC_VERSION).toMatch(/v\d+$/);
    const r = computeThreat("ACME", [mk("ACME scam fraud lie", "a1")], sources);
    expect(r.rubricVersion).toBe(RUBRIC_VERSION);
  });
});
