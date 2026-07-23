// Narrative clustering of REAL collected mentions. Gates: the parser only
// accepts in-range, non-duplicated mention indices (an invented index is
// dropped, never rendered); a mention the model leaves out stays unclustered;
// no ANTHROPIC_API_KEY -> honest available:false; too little text -> honest
// unavailable instead of a force-fit.

import { describe, it, expect, afterEach } from "vitest";
import { clusterNarratives, parseNarrativeThreads, NARRATIVES_CAP } from "../lib/signal-narratives";
import type { Mention } from "../lib/narrative/types";

describe("parseNarrativeThreads", () => {
  it("parses the documented schema and drops out-of-range indices", () => {
    const raw = JSON.stringify({
      narratives: [
        { name: "Pricing backlash", note: "new fees", mentions: [0, 2, 99] },
        { name: "Product praise", note: "", mentions: [1] },
      ],
    });
    const t = parseNarrativeThreads(raw, 3);
    expect(t).toHaveLength(2);
    expect(t[0].mentions).toEqual([0, 2]); // 99 out of range -> dropped
    expect(t[1].mentions).toEqual([1]);
  });

  it("keeps a mention with its first thread when claimed twice", () => {
    const raw = JSON.stringify({
      narratives: [
        { name: "A", mentions: [0, 1] },
        { name: "B", mentions: [1, 2] },
      ],
    });
    const t = parseNarrativeThreads(raw, 3);
    expect(t[0].mentions).toEqual([0, 1]);
    expect(t[1].mentions).toEqual([2]); // 1 already taken by A
  });

  it("drops nameless or empty threads instead of guessing", () => {
    const raw = JSON.stringify({
      narratives: [
        { name: "", mentions: [0] },
        { name: "Ghost", mentions: [77] }, // all out of range -> empty -> dropped
        { name: "Real", mentions: [0] },
      ],
    });
    const t = parseNarrativeThreads(raw, 2);
    expect(t).toHaveLength(1);
    expect(t[0].name).toBe("Real");
  });

  it("survives markdown fences and returns [] on garbage", () => {
    expect(parseNarrativeThreads('```json\n{"narratives":[{"name":"X","mentions":[0]}]}\n```', 1)).toHaveLength(1);
    expect(parseNarrativeThreads("nonsense", 5)).toEqual([]);
  });
});

describe("clusterNarratives (no key / thin data)", () => {
  const OLD = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    if (OLD === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = OLD;
  });

  const m = (id: string, text: string): Mention => ({ source: "gdelt", id, text });

  it("reports an honest not-connected state without a key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const r = await clusterNarratives("Acme", [m("1", "a"), m("2", "b"), m("3", "c")]);
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/ANTHROPIC_API_KEY/);
    expect(r.threads).toEqual([]);
  });

  it("reports unavailable when there is too little text to cluster", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-never-used";
    const r = await clusterNarratives("Acme", [m("1", "only one")]);
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/Not enough/i);
  });

  it("exposes the cap for honest coverage display", () => {
    expect(NARRATIVES_CAP).toBeGreaterThan(0);
  });
});
