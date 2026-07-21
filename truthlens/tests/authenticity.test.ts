// [2] Authenticity module - Phase 1 (mention-derived signals + scoring core).
// Spec: every phase-1 signal has ≥1 computed test AND a null/insufficient-data
// case; skipped signals lower confidence (never zeroed); confidence below
// MIN_CONFIDENCE → "insufficient_data", never a risk band; deterministic output.

import { describe, it, expect } from "vitest";
import { assessAccount } from "../lib/authenticity";
import { aggregate } from "../lib/authenticity/score";
import { SIGNAL_SPECS, MIN_CONFIDENCE } from "../lib/authenticity/config";
import * as sig from "../lib/authenticity/signals";
import { clusterNearDuplicates } from "../lib/similarity";
import { analyzeCib } from "../lib/cib/analyze";
import type { Mention } from "../lib/narrative/types";
import type { AuthenticityInput, SignalResult } from "../lib/authenticity/types";

const T0 = Date.UTC(2024, 0, 1, 12, 0, 0);
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

function mk(account: string, text: string, tMs: number, extra: Partial<Mention> = {}): Mention {
  return { source: "bluesky", id: `${account}-${tMs}-${text.slice(0, 8)}`, text, account, accountId: account,
    timestamp: new Date(tMs).toISOString(), ...extra };
}
function input(account: string, own: Mention[], others: Mention[]): AuthenticityInput {
  const all = [...own, ...others];
  return { account, own, all, clusters: clusterNearDuplicates(all, (m) => m.text) };
}
const empty = (account = "acct"): AuthenticityInput => ({ account, own: [], all: [], clusters: [] });

// Peers: 5 accounts with ordinary varied engagement + varied text/timing.
function peers(): Mention[] {
  const out: Mention[] = [];
  const texts = [
    "my thoughts on the earnings call were pretty mixed overall today",
    "went hiking this weekend and the weather was absolutely beautiful",
    "the new library downtown finally opened after two years of construction",
    "reading a fascinating novel about deep sea exploration this month",
    "our team shipped the quarterly release with all planned features",
  ];
  for (let a = 0; a < 5; a++) {
    for (let i = 0; i < 3; i++) {
      out.push(mk(`peer${a}`, `${texts[a]} take ${i}`, T0 + a * 7 * HOUR + i * 3 * HOUR + a * 13 * MIN, { engagement: 3 + a * 2 + i * 3, lang: "en" }));
    }
  }
  return out;
}

describe("phase-1 signals - computed + insufficient cases", () => {
  it("engagement_rate_deviation: far off the peer benchmark → high; <2 posts → null", () => {
    const own = [mk("s", "a post about things", T0, { engagement: 900 }), mk("s", "another post entirely", T0 + HOUR, { engagement: 950 })];
    const out = sig.engagement_rate_deviation(input("s", own, peers()));
    expect(out).not.toBeNull();
    expect(out!.subscore).toBeGreaterThan(0.8);
    expect(sig.engagement_rate_deviation(input("s", own.slice(0, 1), peers()))).toBeNull();
    expect(sig.engagement_rate_deviation(input("s", own, []))).toBeNull(); // no peers
  });

  it("engagement_uniformity: identical engagement on every post → high; varied → low; near-zero → null", () => {
    const uniform = Array.from({ length: 4 }, (_, i) => mk("s", `post number ${i} here`, T0 + i * HOUR, { engagement: 50 }));
    const varied = [10, 80, 25, 300].map((e, i) => mk("s", `post number ${i} here`, T0 + i * HOUR, { engagement: e }));
    expect(sig.engagement_uniformity(input("s", uniform, []))!.subscore).toBeGreaterThan(0.9);
    expect(sig.engagement_uniformity(input("s", varied, []))!.subscore).toBeLessThan(0.4);
    const nearZero = Array.from({ length: 4 }, (_, i) => mk("s", `p ${i}`, T0 + i * HOUR, { engagement: 1 }));
    expect(sig.engagement_uniformity(input("s", nearZero, []))).toBeNull();
  });

  it("like_comment_ratio: honestly uncomputable in phase 1 → always null", () => {
    expect(sig.like_comment_ratio(input("s", peers(), []))).toBeNull();
  });

  it("engagement_velocity: constant engagement-per-hour drip → high; <3 posts → null", () => {
    // Engagement exactly proportional to age → identical eng/hour on every post.
    const own = [1, 2, 3, 4].map((k) => mk("s", `drip post ${k}`, T0 + k * HOUR, { engagement: (10 - k) * 20 }));
    const ref = mk("z", "reference newest post", T0 + 10 * HOUR, { engagement: 1 });
    const out = sig.engagement_velocity(input("s", own, [ref]));
    expect(out).not.toBeNull();
    expect(out!.subscore).toBeGreaterThan(0.9);
    expect(sig.engagement_velocity(input("s", own.slice(0, 2), [ref]))).toBeNull();
  });

  it("geo_language_mismatch: account posts in a different language than a dominant conversation → >0; no dominant lang → null", () => {
    const own = [mk("s", "текст один", T0, { lang: "ru" }), mk("s", "текст два", T0 + HOUR, { lang: "ru" })];
    const out = sig.geo_language_mismatch(input("s", own, peers()));
    expect(out).not.toBeNull();
    expect(out!.subscore).toBeGreaterThan(0.5);
    expect(out!.subscore).toBeLessThanOrEqual(0.7); // capped - weak signal alone
    const balanced = [
      ...["en", "ru", "he", "es", "fr"].map((l, i) => mk(`p${i}`, `text ${i}`, T0 + i * MIN, { lang: l })),
      ...["en", "ru", "he", "es", "fr"].map((l, i) => mk(`q${i}`, `more ${i}`, T0 + i * MIN, { lang: l })),
    ];
    expect(sig.geo_language_mismatch({ account: "s", own, all: [...own, ...balanced] })).toBeNull();
  });

  it("repeat_commenter_cross_profile: posts inside multi-account copypasta pods → high; no clusters passed → null", () => {
    const pod = "urgent everyone must share this exact message about the brand right now";
    const own = [mk("s", pod, T0), mk("s", pod, T0 + 5 * MIN)];
    const others = [mk("b1", pod, T0 + MIN), mk("b2", pod, T0 + 2 * MIN), ...peers()];
    const out = sig.repeat_commenter_cross_profile(input("s", own, others));
    expect(out).not.toBeNull();
    expect(out!.subscore).toBe(1);
    expect(sig.repeat_commenter_cross_profile({ account: "s", own, all: [...own, ...others] })).toBeNull();
  });

  it("temporal_clustering: posts synchronized with ≥2 other accounts → high; few peers → null", () => {
    const own = [mk("s", "sync one here", T0), mk("s", "sync two here", T0 + 30 * MIN)];
    const others = [
      mk("b1", "unrelated alpha", T0 + 2 * MIN), mk("b2", "unrelated beta", T0 + 4 * MIN),
      mk("b1", "unrelated gamma", T0 + 31 * MIN), mk("b2", "unrelated delta", T0 + 33 * MIN),
      mk("b3", "unrelated epsilon", T0 + 32 * MIN),
    ];
    const out = sig.temporal_clustering(input("s", own, others));
    expect(out).not.toBeNull();
    expect(out!.subscore).toBe(1);
    expect(sig.temporal_clustering(input("s", own, others.slice(0, 2)))).toBeNull();
  });

  it("templated_text: emoji-only / ultra-short filler → high; real sentences → 0; <2 posts → null", () => {
    const spam = [mk("s", "🔥🔥🔥", T0), mk("s", "nice!", T0 + MIN), mk("s", "👏👏", T0 + 2 * MIN)];
    const real = [mk("s", "i think the reporting on this topic misses important context", T0), mk("s", "here is a longer reflection on what happened at the event yesterday", T0 + MIN)];
    expect(sig.templated_text(input("s", spam, []))!.subscore).toBe(1);
    expect(sig.templated_text(input("s", real, []))!.subscore).toBe(0);
    expect(sig.templated_text(input("s", spam.slice(0, 1), []))).toBeNull();
  });

  it("comment_language_mismatch: lang tag vs script disagree → high; Latin-only langs → null", () => {
    const bad = [mk("s", "this is plain english text", T0, { lang: "ru" }), mk("s", "also english despite the tag", T0 + MIN, { lang: "ru" })];
    const ok = [mk("s", "чистый русский текст здесь", T0, { lang: "ru" }), mk("s", "ещё один русский пост", T0 + MIN, { lang: "ru" })];
    expect(sig.comment_language_mismatch(input("s", bad, []))!.subscore).toBe(1);
    expect(sig.comment_language_mismatch(input("s", ok, []))!.subscore).toBe(0);
    const latin = [mk("s", "hello there", T0, { lang: "en" }), mk("s", "bonjour", T0 + MIN, { lang: "fr" })];
    expect(sig.comment_language_mismatch(input("s", latin, []))).toBeNull();
  });

  it("always_on_activity: posts around the clock with no sleep window → high; a normal day rhythm → 0; few posts → null", () => {
    const allDay: Mention[] = [];
    for (let d = 0; d < 2; d++) for (let h = 0; h < 24; h += 3) allDay.push(mk("s", `around the clock ${d} ${h}`, T0 - 12 * HOUR + d * DAY + h * HOUR));
    const out = sig.always_on_activity(input("s", allDay, []));
    expect(out).not.toBeNull();
    expect(out!.subscore).toBeGreaterThan(0.5);
    const daytime: Mention[] = [];
    for (let d = 0; d < 2; d++) for (const h of [9, 11, 13, 15]) daytime.push(mk("s", `day ${d} ${h}`, T0 - 12 * HOUR + d * DAY + h * HOUR));
    expect(sig.always_on_activity(input("s", daytime, []))!.subscore).toBe(0);
    expect(sig.always_on_activity(input("s", daytime.slice(0, 4), []))).toBeNull();
  });

  it("coordinated_posting: one partner repeatedly co-posting within minutes → high; no repetition → 0", () => {
    const own = [0, 1, 2, 3, 4].map((k) => mk("s", `coordinated ${k}`, T0 + k * HOUR));
    const partner = [0, 1, 2, 3, 4].map((k) => mk("twin", `partner ${k}`, T0 + k * HOUR + 2 * MIN));
    const out = sig.coordinated_posting(input("s", own, [...partner, ...peers()]));
    expect(out).not.toBeNull();
    expect(out!.subscore).toBe(1);
    // Shift own posts off the peers' grid so there is no accidental co-post at all.
    const lonePosts = [0, 1, 2, 3, 4].map((k) => mk("s", `solo ${k}`, T0 + k * HOUR + 30 * MIN));
    const lone = sig.coordinated_posting(input("s", lonePosts, peers()));
    expect(lone!.subscore).toBe(0);
    expect(sig.coordinated_posting(input("s", own.slice(0, 2), partner))).toBeNull();
  });
});

describe("scoring core", () => {
  const mkSig = (key: string, weight: number, subscore?: number): SignalResult => ({
    key, layer: "engagement", weight, computed: subscore !== undefined, subscore, alternative: "x",
  });

  it("score = Σ(subscore×weight); confidence = Σ(computed weight)/100", () => {
    const { suspicion_score, confidence } = aggregate([
      mkSig("a", 40, 0.5), mkSig("b", 20, 1), mkSig("c", 40, undefined),
    ]);
    expect(suspicion_score).toBe(40); // 20 + 20
    expect(confidence).toBe(0.6);
  });

  it("confidence below MIN_CONFIDENCE → insufficient_data, NEVER a risk band - even at max subscores", () => {
    const { band } = aggregate([mkSig("a", 30, 1)]); // conf 0.3 < 0.4, raw score 30
    expect(band).toBe("insufficient_data");
  });

  it("bands at the configured cutoffs", () => {
    const at = (score01: number) => aggregate([mkSig("a", 100, score01)]).band;
    expect(at(0.1)).toBe("authentic");
    expect(at(0.3)).toBe("low");
    expect(at(0.6)).toBe("elevated");
    expect(at(0.9)).toBe("high");
  });

  it("weights in config sum to exactly 100", () => {
    expect(SIGNAL_SPECS.reduce((n, s) => n + s.weight, 0)).toBe(100);
  });
});

describe("assessAccount - orchestration", () => {
  it("empty input → every signal missing, insufficient_data, no fabricated score", () => {
    const a = assessAccount(empty());
    expect(a.band).toBe("insufficient_data");
    expect(a.confidence).toBe(0);
    expect(a.suspicion_score).toBe(0);
    expect(a.missing_signals.length).toBe(SIGNAL_SPECS.length);
  });

  it("phase-1 fixture: deterministic score; confidence ≤ 0.58 (phase-1 weight ceiling); every computed signal carries evidence + alternative", () => {
    const pod = "everyone must repost this exact urgent message about the brand immediately";
    const own = [
      mk("s", pod, T0, { engagement: 40, lang: "en" }),
      mk("s", pod, T0 + 4 * MIN, { engagement: 40, lang: "en" }),
      mk("s", "🔥🔥", T0 + 8 * MIN, { engagement: 40, lang: "en" }),
      mk("s", pod + " again", T0 + 12 * MIN, { engagement: 40, lang: "en" }),
    ];
    const others = [mk("b1", pod, T0 + MIN, { lang: "en" }), mk("b2", pod, T0 + 2 * MIN, { lang: "en" }), ...peers()];
    const inp = input("s", own, others);
    const a1 = assessAccount(inp);
    const a2 = assessAccount(inp);
    expect(a1.suspicion_score).toBe(a2.suspicion_score); // deterministic
    expect(a1.confidence).toBeLessThanOrEqual(0.58);
    expect(a1.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
    expect(a1.suspicion_score).toBeGreaterThan(0);
    for (const s of a1.signals) {
      expect(s.alternative.length).toBeGreaterThan(0);
      if (s.computed) expect(s.evidence).toBeDefined();
    }
    expect(a1.missing_signals).toContain("like_comment_ratio");
    expect(a1.missing_signals).toContain("suspicious_follower_pct"); // phase-2, provider absent
  });

  it("ethics: output never contains a binary fake/real label or person/actor fields", () => {
    const a = assessAccount(input("s", peers().slice(0, 3), peers()));
    const j = JSON.stringify(a).toLowerCase();
    expect(j).not.toMatch(/"(is_)?fake"|"real"\s*:/);
    for (const banned of ['"person"', '"actor"', '"operator"']) expect(j).not.toContain(banned);
    expect(a.note.toLowerCase()).toContain("never a claim about a person");
  });
});

describe("CIB hook - strictly additive", () => {
  it("attaches per-account assessments for amplifying accounts without altering existing outputs", () => {
    const pod = "boycott example now";
    const mentions = [
      mk("a1", pod, T0), mk("a1", pod, T0 + MIN),
      mk("a2", pod, T0 + 2 * MIN), mk("a2", pod, T0 + 3 * MIN),
      mk("a3", pod, T0 + 4 * MIN),
    ];
    const r = analyzeCib("example", mentions);
    expect(r.likelihood).not.toBe("None"); // existing behavior intact
    expect(r.authenticity).toBeDefined();
    const accounts = r.authenticity!.map((x) => x.account).sort();
    expect(accounts).toEqual(["a1", "a2"]); // only accounts with ≥2 mentions
    for (const { assessment } of r.authenticity!) {
      expect(assessment.suspicion_score).toBeGreaterThanOrEqual(0);
      expect(assessment.model_version).toBe("authenticity-v1");
    }
  });

  it("single-mention accounts → no authenticity block (no data-poor flags)", () => {
    const r = analyzeCib("example", [mk("a1", "hello world", T0)]);
    expect(r.authenticity).toBeUndefined();
  });
});
