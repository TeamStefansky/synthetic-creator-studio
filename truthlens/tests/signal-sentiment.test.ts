// Server-side sentiment for the SIGNAL console. Gates: the overall score is
// COMPUTED from per-mention labels (never model-given); the defensive parser
// drops rows it cannot trust (unknown id, invalid label) instead of guessing;
// zero labels -> score null (Unknown, rule 4); no ANTHROPIC_API_KEY -> an
// honest available:false (rule 7). The LLM call itself is not exercised here -
// only the pure logic around it.

import { describe, it, expect, afterEach } from "vitest";
import {
  classifySentiment,
  parseSentimentLabels,
  summarizeSentiment,
  SENTIMENT_CAP,
  type MentionSentiment,
} from "../lib/signal-sentiment";
import type { Mention } from "../lib/narrative/types";

const L = (id: string, label: MentionSentiment["label"], confidence = 0.9): MentionSentiment =>
  ({ id, label, confidence });

describe("summarizeSentiment", () => {
  it("computes the score from labels: (pos - neg) / labeled * 100", () => {
    const s = summarizeSentiment(
      [L("a", "pos"), L("b", "pos"), L("c", "pos"), L("d", "neg"), L("e", "neu")],
      5,
    );
    expect(s.pos).toBe(3);
    expect(s.neg).toBe(1);
    expect(s.neu).toBe(1);
    expect(s.labeled).toBe(5);
    expect(s.score).toBe(40); // (3-1)/5*100
  });

  it("returns score null (Unknown) when nothing was labeled - never 0-as-neutral", () => {
    const s = summarizeSentiment([], 10);
    expect(s.score).toBeNull();
    expect(s.labeled).toBe(0);
    expect(s.considered).toBe(10);
  });

  it("always carries the honest alternative caveat", () => {
    expect(summarizeSentiment([L("a", "pos")], 1).alternative).toMatch(/topic mix|sarcasm/i);
  });
});

describe("parseSentimentLabels", () => {
  const valid = new Set(["m0", "m1", "m2"]);

  it("parses the documented schema and clamps confidence", () => {
    const raw = '{"labels":[{"id":"m0","s":"pos","c":0.8},{"id":"m1","s":"neg","c":7},{"id":"m2","s":"neu","c":-1}]}';
    const out = parseSentimentLabels(raw, valid);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ id: "m0", label: "pos", confidence: 0.8 });
    expect(out[1].confidence).toBe(1); // clamped
    expect(out[2].confidence).toBe(0); // clamped
  });

  it("drops unknown ids, invalid labels and duplicates instead of guessing", () => {
    const raw = JSON.stringify({
      labels: [
        { id: "m0", s: "pos", c: 0.9 },
        { id: "m0", s: "neg", c: 0.9 }, // duplicate id -> dropped
        { id: "mX", s: "pos", c: 0.9 }, // unknown id -> dropped
        { id: "m1", s: "great", c: 0.9 }, // invalid label -> dropped
        { id: "m2", s: "neg" }, // missing confidence -> defaulted, kept
      ],
    });
    const out = parseSentimentLabels(raw, valid);
    expect(out.map((l) => l.id)).toEqual(["m0", "m2"]);
    expect(out[0].label).toBe("pos");
    expect(out[1].confidence).toBe(0.5);
  });

  it("survives markdown fences and surrounding prose", () => {
    const raw = '```json\n{"labels":[{"id":"m0","s":"neu","c":0.4}]}\n```';
    expect(parseSentimentLabels(raw, valid)).toHaveLength(1);
  });

  it("returns empty on garbage - never a fabricated label", () => {
    expect(parseSentimentLabels("not json at all", valid)).toEqual([]);
    expect(parseSentimentLabels("", valid)).toEqual([]);
  });
});

describe("classifySentiment (no key / no text)", () => {
  const OLD = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    if (OLD === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = OLD;
  });

  it("reports an honest not-connected state without a key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const r = await classifySentiment("Acme", [
      { source: "gdelt", id: "1", text: "Acme wins award" } as Mention,
    ]);
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/ANTHROPIC_API_KEY/);
    expect(r.score).toBeNull();
    expect(r.labels).toEqual([]);
  });

  it("reports unavailable when there is no text to classify (even with a key)", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-never-used";
    const r = await classifySentiment("Acme", [
      { source: "gdelt", id: "1", text: "   " } as Mention,
    ]);
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/No mention text/i);
  });

  it("exposes the classification cap for honest coverage display", () => {
    expect(SENTIMENT_CAP).toBeGreaterThan(0);
  });
});
