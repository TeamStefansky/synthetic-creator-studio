import { describe, it, expect } from "vitest";
import { analyzeCib, CIB_ANALYSIS_VERSION } from "@/lib/cib/analyze";
import type { Mention } from "@/lib/narrative/types";

function mk(text: string, account: string, minute: number, source = "bluesky"): Mention {
  return {
    source,
    id: `${account}-${minute}`,
    text,
    account,
    accountId: account,
    timestamp: new Date(Date.UTC(2024, 0, 1, 12, minute)).toISOString(),
  };
}

// P5 pilot: the Temporal-synchronization signal is enriched with a principled
// Poisson-tail significance + burstiness, WITHOUT changing its confidence band.
describe("P5 integration pilot - cib temporal signal", () => {
  const burstMentions: Mention[] = [
    mk("boycott example now", "a1", 0),
    mk("boycott example now", "a2", 0),
    mk("boycott example now", "a3", 1),
    mk("boycott example now", "a4", 1),
    mk("later unrelated", "a5", 600),
    mk("later unrelated too", "a6", 900),
  ];

  it("adds a Poisson-tail p-value + method note to the timing signal", () => {
    const r = analyzeCib("example", burstMentions);
    const sig = r.signals.find((s) => s.name === "Temporal synchronization")!;
    expect(sig.method).toBeTruthy();
    expect(sig.method!.toLowerCase()).toContain("poisson");
    expect(typeof sig.pValue).toBe("number");
    expect(sig.pValue!).toBeGreaterThanOrEqual(0);
    expect(sig.pValue!).toBeLessThanOrEqual(1);
    // the method note appears in the human-readable evidence too
    expect(sig.evidence.some((e) => e.includes("Poisson tail"))).toBe(true);
    expect(r.analysisVersion).toBe(CIB_ANALYSIS_VERSION);
  });

  it("PRESERVES the confidence band (conclusion unchanged by the enrichment)", () => {
    const r = analyzeCib("example", burstMentions);
    const sig = r.signals.find((s) => s.name === "Temporal synchronization")!;
    // bursts present → the original logic yields "Medium"; enrichment must not flip it
    expect(sig.confidence).toBe("Medium");
  });

  it("thin timing data stays Not collected, with no fabricated statistic", () => {
    const r = analyzeCib("example", [mk("one", "a", 0), mk("two", "b", 5)]);
    const sig = r.signals.find((s) => s.name === "Temporal synchronization")!;
    expect(sig.confidence).toBe("Not collected");
    expect(sig.pValue).toBeUndefined();
    expect(sig.method).toBeUndefined();
  });

  it("still emits the UNDETERMINED attribution and no person/actor field", () => {
    const r = analyzeCib("example", burstMentions);
    expect(r.attribution.toUpperCase()).toContain("UNDETERMINED");
    const json = JSON.stringify(r).toLowerCase();
    expect(json).not.toContain('"actor"');
    expect(json).not.toContain('"country"');
  });
});
