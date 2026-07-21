// [2] Authenticity — Phase 2: platform provider + account/audience signals.
// Verify per the prompt: with the stub provider's profile injected, phase-2
// signals compute and confidence rises above the phase-1 ceiling; with the
// provider absent, phase-1 behavior is unchanged; the resolver is env-gated
// (unset → null, never a silent default).

import { describe, it, expect } from "vitest";
import { resolvePlatformProvider } from "../lib/platform/provider";
import { stubProvider, botShapedFixture, ordinaryFixture } from "../lib/platform/adapters/stub";
import { assessAccount } from "../lib/authenticity";
import * as sig from "../lib/authenticity/signals";
import { analyzeCib } from "../lib/cib/analyze";
import { clusterNearDuplicates } from "../lib/similarity";
import type { Mention } from "../lib/narrative/types";
import type { AuthenticityInput } from "../lib/authenticity/types";

const T0 = Date.UTC(2024, 5, 1, 12, 0, 0);
const MIN = 60_000, HOUR = 3_600_000;

function mk(account: string, text: string, tMs: number, extra: Partial<Mention> = {}): Mention {
  return { source: "bluesky", id: `${account}-${tMs}`, text, account, accountId: account,
    timestamp: new Date(tMs).toISOString(), ...extra };
}
function input(account: string, own: Mention[], others: Mention[], profile?: any): AuthenticityInput {
  const all = [...own, ...others];
  return { account, own, all, clusters: clusterNearDuplicates(all, (m) => m.text), profile: profile ?? null };
}

describe("resolvePlatformProvider — env-gated like lib/osint.ts", () => {
  const saved = process.env.PLATFORM_PROVIDER;
  it("unset → null (Phase-1 only, graceful); stub/official → the matching adapter", () => {
    delete process.env.PLATFORM_PROVIDER;
    expect(resolvePlatformProvider()).toBeNull();
    process.env.PLATFORM_PROVIDER = "stub";
    expect(resolvePlatformProvider()?.name).toBe("stub");
    process.env.PLATFORM_PROVIDER = "official";
    expect(resolvePlatformProvider()?.name).toBe("official");
    process.env.PLATFORM_PROVIDER = "something-else";
    expect(resolvePlatformProvider()).toBeNull();
    if (saved !== undefined) process.env.PLATFORM_PROVIDER = saved;
    else delete process.env.PLATFORM_PROVIDER;
  });
});

describe("phase-2 signals — computed with a profile, null without", () => {
  const bot = botShapedFixture("botacct");
  const normal = ordinaryFixture("reader");
  const own = [mk("s", "post one about things", T0), mk("s", "post two about stuff", T0 + HOUR)];

  it("follower_following_ratio: mass-follow shape → high; balanced → 0; no profile → null", () => {
    expect(sig.follower_following_ratio(input("s", own, [], bot))!.subscore).toBeGreaterThan(0.9);
    expect(sig.follower_following_ratio(input("s", own, [], normal))!.subscore).toBe(0);
    expect(sig.follower_following_ratio(input("s", own, []))).toBeNull();
  });

  it("growth_velocity: fast growth on a young account scores higher than slow organic growth; no createdAt → null", () => {
    const fast = { followers: 90_000, createdAt: new Date(T0 - 30 * 86_400_000).toISOString() };
    const slow = { followers: 3200, createdAt: "2019-05-10T00:00:00Z" };
    const vFast = sig.growth_velocity(input("s", own, [], fast))!.subscore;
    const vSlow = sig.growth_velocity(input("s", own, [], slow))!.subscore;
    expect(vFast).toBeGreaterThan(0.9);
    expect(vSlow).toBeLessThan(0.05);
    expect(sig.growth_velocity(input("s", own, [], { followers: 10 }))).toBeNull();
  });

  it("profile_image_flags: missing avatar → mild flag; AI score drives when present; normal avatar w/o detector → null", () => {
    expect(sig.profile_image_flags(input("s", own, [], bot))!.subscore).toBe(0.5);
    expect(sig.profile_image_flags(input("s", own, [], { avatarUrl: "https://x/a.jpg", avatarAiScore: 90 }))!.subscore).toBe(0.9);
    expect(sig.profile_image_flags(input("s", own, [], normal))).toBeNull();
    expect(sig.profile_image_flags(input("s", own, []))).toBeNull();
  });

  it("username_pattern: trailing digit runs / random strings → high; a plain handle → 0", () => {
    expect(sig.username_pattern(input("s", own, [], bot))!.subscore).toBeGreaterThanOrEqual(0.6);
    expect(sig.username_pattern(input("s", own, [], { username: "localnewsdesk" }))!.subscore).toBe(0);
    expect(sig.username_pattern(input("s", own, [], {}))).toBeNull();
  });

  it("post_to_follower_ratio: big audience + almost no posts → high; small account → null", () => {
    const hollow = { followers: 500_000, posts: 2 };
    expect(sig.post_to_follower_ratio(input("s", own, [], hollow))!.subscore).toBeGreaterThan(0.9);
    expect(sig.post_to_follower_ratio(input("s", own, [], normal))!.subscore).toBe(0);
    expect(sig.post_to_follower_ratio(input("s", own, [], { followers: 200, posts: 1 }))).toBeNull();
  });

  it("suspicious_follower_pct: avatar-less empty followers → high; healthy sample → low; tiny sample → null", () => {
    expect(sig.suspicious_follower_pct(input("s", own, [], bot))!.subscore).toBeGreaterThan(0.8);
    expect(sig.suspicious_follower_pct(input("s", own, [], normal))!.subscore).toBeLessThan(0.2);
    expect(sig.suspicious_follower_pct(input("s", own, [], { followersSample: bot.followersSample!.slice(0, 5) }))).toBeNull();
  });

  it("follower_botness_recursive: bot-shaped sample → high; healthy sample → low", () => {
    expect(sig.follower_botness_recursive(input("s", own, [], bot))!.subscore).toBeGreaterThan(0.7);
    expect(sig.follower_botness_recursive(input("s", own, [], normal))!.subscore).toBeLessThan(0.35);
  });

  it("like_comment_ratio (phase-2 upgrade): like-only engagement → high; normal split → low; no split → null", () => {
    expect(sig.like_comment_ratio(input("s", own, [], bot))!.subscore).toBeGreaterThan(0.9);
    expect(sig.like_comment_ratio(input("s", own, [], normal))!.subscore).toBeLessThan(0.3);
    expect(sig.like_comment_ratio(input("s", own, []))).toBeNull();
  });
});

describe("assessAccount with a provider profile", () => {
  it("confidence rises above the phase-1 ceiling (0.58) toward 1.0, and the bot shape scores high", () => {
    const own = [
      mk("botacct", "🔥🔥", T0, { engagement: 40, lang: "en" }),
      mk("botacct", "🔥🔥🔥", T0 + 5 * MIN, { engagement: 40, lang: "en" }),
      mk("botacct", "nice!", T0 + 10 * MIN, { engagement: 40, lang: "en" }),
    ];
    const others = Array.from({ length: 6 }, (_, i) =>
      mk(`p${i}`, `an ordinary distinct message number ${i} about the day`, T0 + i * 20 * MIN, { engagement: 5 + i, lang: "en" }));
    const noProfile = assessAccount(input("botacct", own, others));
    const withProfile = assessAccount(input("botacct", own, others, botShapedFixture("botacct")));
    expect(withProfile.confidence).toBeGreaterThan(noProfile.confidence);
    expect(withProfile.confidence).toBeGreaterThan(0.58);
    expect(withProfile.suspicion_score).toBeGreaterThan(noProfile.suspicion_score);
    expect(withProfile.missing_signals.length).toBeLessThan(noProfile.missing_signals.length);
  });

  it("ordinary profile + ordinary behavior stays out of the high band", () => {
    const own = [
      mk("reader", "sharing my honest take on the council meeting today", T0, { engagement: 55, lang: "en" }),
      mk("reader", "great turnout at the cycling event this weekend", T0 + 26 * HOUR, { engagement: 71, lang: "en" }),
      mk("reader", "the new bridge plan deserves a closer look imo", T0 + 50 * HOUR, { engagement: 40, lang: "en" }),
    ];
    const others = Array.from({ length: 6 }, (_, i) =>
      mk(`p${i}`, `a different perspective number ${i} entirely`, T0 + i * 9 * HOUR, { engagement: 30 + i * 7, lang: "en" }));
    const a = assessAccount(input("reader", own, others, ordinaryFixture("reader")));
    expect(a.band).not.toBe("high");
    expect(a.confidence).toBeGreaterThan(0.58);
  });
});

describe("analyzeCib with profiles (additive)", () => {
  const pod = "boycott example now";
  const mentions = [
    mk("a1", pod, T0), mk("a1", pod, T0 + MIN),
    mk("a2", pod, T0 + 2 * MIN), mk("a2", pod, T0 + 3 * MIN),
  ];
  it("profiles upgrade the authenticity layer and the collection-gap wording; report shape unchanged otherwise", () => {
    const withP = analyzeCib("example", mentions, { a1: botShapedFixture("a1") });
    const withoutP = analyzeCib("example", mentions);
    expect(withP.likelihood).toBe(withoutP.likelihood); // grading untouched
    const a1 = withP.authenticity!.find((x) => x.account === "a1")!;
    const a1Bare = withoutP.authenticity!.find((x) => x.account === "a1")!;
    expect(a1.assessment.confidence).toBeGreaterThan(a1Bare.assessment.confidence);
    expect(withP.collectionGaps[0]).toMatch(/collected for 1 amplifying account/);
    expect(withoutP.collectionGaps[0]).toMatch(/not collected/i);
  });

  it("stub provider fetchAccount returns fixtures keyed by handle", async () => {
    const p = stubProvider({ special: ordinaryFixture("special") });
    expect(await p.fetchAccount("bluesky", "special")).not.toBeNull();
    expect(await p.fetchAccount("bluesky", "unknown")).toBeNull();
  });
});
