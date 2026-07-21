// Phase-1 signal functions — pure, deterministic, mention-derived. Each returns
// { subscore ∈ [0,1], evidence } or null when its input data is unavailable
// (null = SKIPPED, lowers confidence — never zeroed, never guessed).
// No single signal is proof; every one carries an innocent alternative.

import { normalizeText } from "@/lib/similarity";
import type { Mention } from "@/lib/narrative/types";
import type { AuthenticityInput } from "./types";
import {
  SYNC_WINDOW_MS, COPOST_WINDOW_MS, QUIET_HOURS_NORMAL, MIN_POSTS_ALWAYS_ON,
  FOLLOW_RATIO_MAX, GROWTH_PER_DAY_MAX, LIKE_COMMENT_NORM, MIN_FOLLOWER_SAMPLE,
  AVATAR_MISSING_SUBSCORE,
} from "./config";

export type SignalOutput = { subscore: number; evidence: Record<string, unknown> } | null;
export type SignalFn = (inp: AuthenticityInput) => SignalOutput;

/** Innocent explanations, one per signal (CLAUDE.md rule 3). */
export const ALTERNATIVES: Record<string, string> = {
  follower_following_ratio: "New or niche accounts naturally follow many more than follow back.",
  growth_velocity: "A viral moment or press coverage grows a real audience fast.",
  profile_image_flags: "Many real users keep a default or generic profile image.",
  username_pattern: "Platforms auto-generate numeric handles for real users too.",
  post_to_follower_ratio: "Brands and public figures post rarely yet hold large audiences.",
  engagement_rate_deviation: "Audience quality and topic swings move engagement far from peers legitimately.",
  engagement_uniformity: "A steady niche audience can produce similar engagement on every post.",
  like_comment_ratio: "Some formats attract likes without discussion — a normal audience habit.",
  engagement_velocity: "A tight-knit audience in one timezone reacts at a steady rhythm.",
  suspicious_follower_pct: "Dormant lurker followers are common on older real accounts.",
  geo_language_mismatch: "A diaspora or international audience legitimately follows content in another language.",
  follower_botness_recursive: "Spam followers attach themselves to popular real accounts uninvited.",
  repeat_commenter_cross_profile: "Wire copy and syndication make many accounts share identical text.",
  temporal_clustering: "A breaking story makes independent accounts post in the same minutes.",
  templated_text: "Short reactions and emoji replies are ordinary social behavior.",
  comment_language_mismatch: "Multilingual users often write in a language different from their profile tag.",
  always_on_activity: "Shift workers and shared/team accounts post around the clock.",
  coordinated_posting: "Colleagues or friends who post together produce synchronized timing.",
};

// ---------- helpers ----------

const fin = (v: any): v is number => typeof v === "number" && Number.isFinite(v);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const cv = (xs: number[]) => {
  const m = mean(xs);
  if (m === 0) return 0;
  const sd = Math.sqrt(mean(xs.map((x) => (x - m) * (x - m))));
  return sd / m;
};
const ts = (m: Mention): number | null => {
  if (!m.timestamp) return null;
  const t = Date.parse(m.timestamp);
  return Number.isFinite(t) ? t : null;
};
const acctOf = (m: Mention) => m.accountId || m.account || "";
const othersOf = (inp: AuthenticityInput) => inp.all.filter((m) => acctOf(m) !== inp.account);

// ---------- Layer B — engagement ----------

export const engagement_rate_deviation: SignalFn = (inp) => {
  const own = inp.own.map((m) => m.engagement).filter(fin);
  if (own.length < 2) return null;
  // Peer benchmark: mean engagement per OTHER account in the same collected set.
  const peer = new Map<string, number[]>();
  for (const m of othersOf(inp)) {
    if (!fin(m.engagement)) continue;
    const a = acctOf(m);
    if (!a) continue;
    peer.set(a, [...(peer.get(a) || []), m.engagement]);
  }
  if (peer.size < 3) return null; // not enough peers for a benchmark
  const peerMeans = [...peer.values()].map(mean);
  const benchmark = Math.max(median(peerMeans), 1);
  const avg = mean(own);
  const deviation = Math.abs(avg - benchmark) / benchmark;
  return {
    subscore: clamp01(deviation / 3), // 3× off the peer benchmark → 1.0
    evidence: { avgEngagement: r2(avg), peerMedian: r2(benchmark), posts: own.length, peers: peer.size },
  };
};

export const engagement_uniformity: SignalFn = (inp) => {
  const own = inp.own.map((m) => m.engagement).filter(fin);
  if (own.length < 3) return null;
  const m = mean(own);
  if (m < 3) return null; // near-zero engagement carries no uniformity information
  const v = cv(own);
  return { subscore: clamp01(1 - v), evidence: { cv: r2(v), posts: own.length } };
};

/** Phase 1: the normalized mention stream only carries a single total-engagement
 * number → uncomputable. Phase 2: computes from the provider's like/comment
 * split on recent posts. Deviation from the norm is log-scaled in BOTH
 * directions (all-likes-no-talk AND comment-pod inflation are tells). */
export const like_comment_ratio: SignalFn = (inp) => {
  const posts = (inp.profile?.recentPosts || []).filter((p) => fin(p.likes) && fin(p.comments));
  if (posts.length < 3) return null;
  const likes = posts.reduce((n, p) => n + p.likes!, 0);
  const comments = posts.reduce((n, p) => n + p.comments!, 0);
  if (likes + comments < 20) return null; // too little engagement to read a ratio
  const ratio = likes / Math.max(comments, 1);
  const subscore = clamp01(Math.abs(Math.log10(ratio / LIKE_COMMENT_NORM)));
  return { subscore, evidence: { likes, comments, ratio: r2(ratio), norm: LIKE_COMMENT_NORM, posts: posts.length } };
};

export const engagement_velocity: SignalFn = (inp) => {
  // Deterministic reference moment: the newest timestamp in the collected set.
  const allTs = inp.all.map(ts).filter((t): t is number => t !== null);
  if (!allTs.length) return null;
  const ref = Math.max(...allTs);
  const rates: number[] = [];
  for (const m of inp.own) {
    const t = ts(m);
    if (t === null || !fin(m.engagement)) continue;
    const hours = Math.max((ref - t) / 3_600_000, 1);
    rates.push(m.engagement / hours);
  }
  if (rates.length < 3) return null;
  if (mean(rates) < 1) return null; // too little engagement to read a rhythm
  const v = cv(rates);
  // A near-constant engagement-per-hour drip across posts is the bot-farm tell.
  return { subscore: clamp01(1 - v), evidence: { cvPerHour: r2(v), posts: rates.length } };
};

// ---------- Layer C — audience (Phase-1 part) ----------

export const geo_language_mismatch: SignalFn = (inp) => {
  const norm = (l?: string) => (l || "").slice(0, 2).toLowerCase();
  const ownLangs = inp.own.map((m) => norm(m.lang)).filter(Boolean);
  if (ownLangs.length < 2) return null;
  const allLangs = inp.all.map((m) => norm(m.lang)).filter(Boolean);
  if (allLangs.length < 5) return null;
  const counts = new Map<string, number>();
  for (const l of allLangs) counts.set(l, (counts.get(l) || 0) + 1);
  const [domLang, domCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (domCount / allLangs.length < 0.6) return null; // no dominant conversation language
  const mismatch = ownLangs.filter((l) => l !== domLang).length / ownLangs.length;
  // Capped: a language mismatch alone is a WEAK signal (false-positive guardrail §8).
  return {
    subscore: clamp01(mismatch * 0.7),
    evidence: { accountLangs: [...new Set(ownLangs)], conversationLang: domLang, mismatchShare: r2(mismatch) },
  };
};

// ---------- Layer D — comment network ----------

export const repeat_commenter_cross_profile: SignalFn = (inp) => {
  if (inp.own.length < 2 || !inp.clusters) return null;
  let inPod = 0;
  for (const m of inp.own) {
    const group = inp.clusters.find((g) => g.includes(m));
    if (!group) continue;
    const otherAccts = new Set(group.map(acctOf).filter((a) => a && a !== inp.account));
    if (otherAccts.size >= 2) inPod++;
  }
  return {
    subscore: clamp01(inPod / inp.own.length),
    evidence: { podPosts: inPod, posts: inp.own.length },
  };
};

export const temporal_clustering: SignalFn = (inp) => {
  const ownT = inp.own.map(ts).filter((t): t is number => t !== null);
  if (ownT.length < 2) return null;
  const others = othersOf(inp)
    .map((m) => ({ t: ts(m), a: acctOf(m) }))
    .filter((x): x is { t: number; a: string } => x.t !== null && !!x.a);
  if (others.length < 5) return null;
  let synced = 0;
  for (const t of ownT) {
    const near = new Set(others.filter((o) => Math.abs(o.t - t) <= SYNC_WINDOW_MS).map((o) => o.a));
    if (near.size >= 2) synced++;
  }
  return {
    subscore: clamp01(synced / ownT.length),
    evidence: { syncedPosts: synced, posts: ownT.length, windowMin: SYNC_WINDOW_MS / 60_000 },
  };
};

export const templated_text: SignalFn = (inp) => {
  if (inp.own.length < 2) return null;
  let templated = 0;
  for (const m of inp.own) {
    const raw = (m.text || "").trim();
    if (!raw) continue;
    const n = normalizeText(raw);
    const words = n ? n.split(" ").length : 0;
    if (n === "" || words <= 2) templated++; // emoji/symbol-only or ultra-short filler
  }
  return {
    subscore: clamp01(templated / inp.own.length),
    evidence: { templatedPosts: templated, posts: inp.own.length },
  };
};

const SCRIPT_OF_LANG: Record<string, RegExp> = {
  he: /[֐-׿]/, iw: /[֐-׿]/,
  ar: /[؀-ۿ]/, fa: /[؀-ۿ]/, ur: /[؀-ۿ]/,
  ru: /[Ѐ-ӿ]/, uk: /[Ѐ-ӿ]/, bg: /[Ѐ-ӿ]/,
  zh: /[一-鿿]/, ja: /[぀-ヿ一-鿿]/, ko: /[가-힯]/,
};

export const comment_language_mismatch: SignalFn = (inp) => {
  const rows = inp.own.filter((m) => m.lang && (m.text || "").trim());
  if (rows.length < 2) return null;
  let checked = 0, mismatched = 0;
  for (const m of rows) {
    const re = SCRIPT_OF_LANG[(m.lang || "").slice(0, 2).toLowerCase()];
    if (!re) continue; // Latin-script languages aren't distinguishable this way
    checked++;
    if (!re.test(m.text)) mismatched++;
  }
  if (checked < 2) return null;
  return {
    subscore: clamp01(mismatched / checked),
    evidence: { mismatchedPosts: mismatched, checkedPosts: checked },
  };
};

// ---------- Layer E — temporal ----------

export const always_on_activity: SignalFn = (inp) => {
  const ownT = inp.own.map(ts).filter((t): t is number => t !== null);
  const days = new Set(ownT.map((t) => new Date(t).toISOString().slice(0, 10)));
  if (ownT.length < MIN_POSTS_ALWAYS_ON || days.size < 2) return null;
  const hist = new Array(24).fill(0);
  for (const t of ownT) hist[new Date(t).getUTCHours()]++;
  // Longest circular run of empty hours = the account's "sleep window".
  let longest = 0, run = 0;
  for (let i = 0; i < 48; i++) {
    if (hist[i % 24] === 0) { run++; longest = Math.max(longest, Math.min(run, 24)); }
    else run = 0;
  }
  return {
    subscore: clamp01((QUIET_HOURS_NORMAL - longest) / QUIET_HOURS_NORMAL),
    evidence: { longestQuietHours: longest, posts: ownT.length, daysObserved: days.size },
  };
};

export const coordinated_posting: SignalFn = (inp) => {
  const ownT = inp.own.map(ts).filter((t): t is number => t !== null);
  if (ownT.length < 3) return null;
  const others = othersOf(inp)
    .map((m) => ({ t: ts(m), a: acctOf(m) }))
    .filter((x): x is { t: number; a: string } => x.t !== null && !!x.a);
  if (others.length < 3) return null;
  // Count co-postings per partner account inside the tight window.
  const coCounts = new Map<string, number>();
  for (const t of ownT) {
    const seen = new Set<string>();
    for (const o of others) {
      if (Math.abs(o.t - t) <= COPOST_WINDOW_MS && !seen.has(o.a)) {
        seen.add(o.a);
        coCounts.set(o.a, (coCounts.get(o.a) || 0) + 1);
      }
    }
  }
  const top = Math.max(0, ...coCounts.values());
  const partnered = [...coCounts.values()].filter((c) => c >= 3).length;
  // One shared moment is normal; a partner repeatedly co-posting is the tell.
  return {
    subscore: clamp01((top - 1) / 4),
    evidence: { topCoPostCount: top, partneredAccounts: partnered, windowMin: COPOST_WINDOW_MS / 60_000 },
  };
};

// ---------- Layer A — account (Phase 2, provider-derived) ----------

export const follower_following_ratio: SignalFn = (inp) => {
  const p = inp.profile;
  if (!p || !fin(p.followers) || !fin(p.follows)) return null;
  const ratio = p.follows / Math.max(p.followers, 1);
  return {
    subscore: clamp01((ratio - 1) / (FOLLOW_RATIO_MAX - 1)),
    evidence: { followers: p.followers, follows: p.follows, ratio: r2(ratio) },
  };
};

export const growth_velocity: SignalFn = (inp) => {
  const p = inp.profile;
  if (!p || !fin(p.followers) || !p.createdAt) return null;
  const created = Date.parse(p.createdAt);
  if (!Number.isFinite(created)) return null;
  // Deterministic reference: newest collected timestamp (fallback: now).
  const allTs = inp.all.map(ts).filter((t): t is number => t !== null);
  const ref = allTs.length ? Math.max(...allTs) : Date.now();
  const ageDays = Math.max((ref - created) / 86_400_000, 1);
  const perDay = p.followers / ageDays;
  return {
    subscore: clamp01(perDay / GROWTH_PER_DAY_MAX),
    evidence: { followers: p.followers, ageDays: Math.round(ageDays), followersPerDay: r2(perDay) },
  };
};

/** Default/missing avatar is a MILD flag; an AI-generated score (0–100) from the
 * image-detect layer, when connected, drives the subscore. A normal avatar with
 * no detector available → null (we can't judge it, so we don't). */
export const profile_image_flags: SignalFn = (inp) => {
  const p = inp.profile;
  if (!p) return null;
  if (fin(p.avatarAiScore)) {
    return { subscore: clamp01(p.avatarAiScore / 100), evidence: { avatarAiScore: p.avatarAiScore } };
  }
  if (!p.avatarUrl) {
    return { subscore: AVATAR_MISSING_SUBSCORE, evidence: { missingOrDefaultAvatar: true } };
  }
  return null;
};

function usernameSuspicion(name: string): { score: number; trailingDigits: number; digitRatio: number } {
  const trailing = (name.match(/\d+$/) || [""])[0].length;
  const digits = (name.match(/\d/g) || []).length;
  const letters = (name.match(/[a-z]/gi) || []).length;
  const digitRatio = name.length ? digits / name.length : 0;
  const vowels = (name.match(/[aeiou]/gi) || []).length;
  let score = 0;
  if (trailing >= 4) score += 0.6;              // user837462
  if (digitRatio >= 0.4) score += 0.4;          // x8f2k9qz
  if (letters >= 8 && vowels === 0) score += 0.4; // unpronounceable string
  return { score: clamp01(score), trailingDigits: trailing, digitRatio: r2(digitRatio) };
}

export const username_pattern: SignalFn = (inp) => {
  const name = (inp.profile?.username || "").trim();
  if (!name) return null;
  const u = usernameSuspicion(name);
  return { subscore: u.score, evidence: { trailingDigits: u.trailingDigits, digitRatio: u.digitRatio } };
};

export const post_to_follower_ratio: SignalFn = (inp) => {
  const p = inp.profile;
  if (!p || !fin(p.posts) || !fin(p.followers)) return null;
  if (p.followers < 1000) return null; // small accounts: the ratio carries no signal
  const ratio = p.posts / Math.max(p.followers, 1);
  // Large audience with almost no content — the bought-followers shape.
  const subscore = ratio >= 0.001 ? 0 : clamp01((0.001 - ratio) / 0.001);
  return { subscore, evidence: { posts: p.posts, followers: p.followers } };
};

// ---------- Layer C — audience (Phase 2, follower-sample-derived) ----------

const lowQuality = (f: { hasAvatar?: boolean; hasBio?: boolean; posts?: number; followers?: number }) =>
  f.hasAvatar === false && (f.hasBio === false || f.posts === 0 || f.followers === 0);

export const suspicious_follower_pct: SignalFn = (inp) => {
  const sample = inp.profile?.followersSample || [];
  if (sample.length < MIN_FOLLOWER_SAMPLE) return null;
  const low = sample.filter(lowQuality).length;
  const pct = low / sample.length;
  return {
    subscore: clamp01(pct * 1.4),
    evidence: { sampleSize: sample.length, lowQualityShare: r2(pct) },
  };
};

export const follower_botness_recursive: SignalFn = (inp) => {
  const sample = inp.profile?.followersSample || [];
  if (sample.length < MIN_FOLLOWER_SAMPLE) return null;
  const scores = sample.map((f) => {
    const flags: number[] = [];
    if (f.hasAvatar !== undefined) flags.push(f.hasAvatar ? 0 : 1);
    if (f.hasBio !== undefined) flags.push(f.hasBio ? 0 : 1);
    if (f.username) flags.push(usernameSuspicion(f.username).score);
    if (f.followers !== undefined) flags.push(f.followers === 0 ? 1 : 0);
    if (f.posts !== undefined) flags.push(f.posts === 0 ? 1 : 0);
    return flags.length ? mean(flags) : 0;
  });
  const avg = mean(scores);
  return {
    subscore: clamp01(avg * 1.3),
    evidence: { sampleSize: sample.length, meanBotness: r2(avg) },
  };
};

/** Phase-2 signal registry (provider-derived; keys must match SIGNAL_SPECS). */
export const PHASE2_SIGNALS: Record<string, SignalFn> = {
  follower_following_ratio,
  growth_velocity,
  profile_image_flags,
  username_pattern,
  post_to_follower_ratio,
  suspicious_follower_pct,
  follower_botness_recursive,
};

/** Phase-1 signal registry (keys must match SIGNAL_SPECS). */
export const PHASE1_SIGNALS: Record<string, SignalFn> = {
  engagement_rate_deviation,
  engagement_uniformity,
  like_comment_ratio,
  engagement_velocity,
  geo_language_mismatch,
  repeat_commenter_cross_profile,
  temporal_clustering,
  templated_text,
  comment_language_mismatch,
  always_on_activity,
  coordinated_posting,
};
