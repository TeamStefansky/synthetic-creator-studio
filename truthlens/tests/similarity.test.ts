import { describe, it, expect } from "vitest";
import { normalizeText } from "../lib/similarity/normalize";
import { shingle } from "../lib/similarity/shingle";
import { minhash, jaccard } from "../lib/similarity/minhash";
import { signatureOf, clusterNearDuplicates, JACCARD_THRESHOLD } from "../lib/similarity";

describe("normalizeText — Unicode aware", () => {
  it("keeps Hebrew / Russian / CJK letters (not stripped to empty)", () => {
    expect(normalizeText("בואו נחרים!")).toBe("בואו נחרים");
    expect(normalizeText("Бойкот, сейчас")).toBe("бойкот сейчас");
    expect(normalizeText("抵制这个品牌")).toBe("抵制这个品牌");
  });
  it("lowercases, drops URLs and punctuation, collapses whitespace", () => {
    expect(normalizeText("STOP  the brand!! https://x.com/a")).toBe("stop the brand");
  });
});

describe("minhash is deterministic", () => {
  it("same input → same signature", () => {
    const a = minhash(shingle(normalizeText("boycott the brand now everyone")));
    const b = minhash(shingle(normalizeText("boycott the brand now everyone")));
    expect(a).toEqual(b);
  });
});

describe("near-duplicate detection (paraphrases)", () => {
  const pair = (x: string, y: string) => jaccard(signatureOf(x), signatureOf(y));

  // Realistic coordinated near-duplicate: the same message reshared with a small
  // variation (an appended campaign tag). Heavier semantic rewrites are the job
  // of the LLM cross-language layer (P4), not the lexical MinHash layer.
  const EN = "the multinational brand is secretly funding the violent street protests to divide our communities and weaken the country";
  const HE = "המותג הבינלאומי מממן בחשאי את ההפגנות האלימות ברחובות הערים שלנו כדי לפלג את הקהילות ולהחליש את המדינה";
  const RU = "международный бренд тайно финансирует уличные протесты чтобы разделить наши сообщества и ослабить нашу страну";

  it("English near-duplicates (same message + tag) score above threshold", () => {
    expect(pair(EN, `${EN} boycottthebrand`)).toBeGreaterThanOrEqual(JACCARD_THRESHOLD);
  });
  it("Hebrew near-duplicates score above threshold", () => {
    expect(pair(HE, `${HE} חרם`)).toBeGreaterThanOrEqual(JACCARD_THRESHOLD);
  });
  it("Russian near-duplicates score above threshold", () => {
    expect(pair(RU, `${RU} бойкот`)).toBeGreaterThanOrEqual(JACCARD_THRESHOLD);
  });

  it("unrelated texts score below threshold", () => {
    expect(pair("i love this coffee shop downtown by the river", "quarterly earnings beat wall street expectations again")).toBeLessThan(JACCARD_THRESHOLD);
  });
});

describe("clusterNearDuplicates", () => {
  it("groups near-duplicates together and separates unrelated text", () => {
    const items = [
      { id: 1, t: "boycott this multinational brand right now everyone and please share this message across all of your networks" },
      { id: 2, t: "boycott this multinational brand right now everyone and please share this post across all of your networks" },
      { id: 3, t: "i had a wonderful relaxing walk in the park with my dog this sunny afternoon" },
    ];
    const clusters = clusterNearDuplicates(items, (i) => i.t);
    const big = clusters.find((c) => c.length >= 2);
    expect(big).toBeDefined();
    expect(big!.map((i) => i.id).sort()).toEqual([1, 2]);
  });
});
