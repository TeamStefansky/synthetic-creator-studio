// Social Analyze — the profile-seeded pipeline (BUILD_ORDER [3]).
//   Stage 1  ProfileSnapshot + the account's own posts + authenticity assessment
//   Stage 2  seed extraction (the narrative the account pushes)
//   Stage 3  network expansion: collect public mentions of each seed across all
//            connected sources, then CIB analysis over the merged set
//   Stage 4  report: an influence-op BAND with reasons — the ceiling is
//            "Strong coordination — actor UNDETERMINED", never an actor.
//
// HARD RULES: assesses ACCOUNTS and narratives — never a person; sources that
// aren't connected are reported as gaps, never faked; Unknown is the answer
// when nothing could be collected. Detector, not judge.

import { fetchProfile, parseProfileInput } from "@/lib/social/profile";
import { fetchAuthorPosts } from "@/lib/social/timeline";
import { collectMentions } from "@/lib/narrative/sources";
import { analyzeCib, ATTRIBUTION } from "@/lib/cib/analyze";
import { assessAccount } from "@/lib/authenticity";
import { resolvePlatformProvider } from "@/lib/platform/provider";
import { extractSeeds } from "./seed";
import type { CibReport } from "@/lib/cib/analyze";
import type { AuthenticityAssessment, AccountProfile } from "@/lib/authenticity";
import type { ProfileSnapshot } from "@/lib/social/types";
import type { Mention, SourceStatus } from "@/lib/narrative/types";
import type { Seed } from "./seed";

export const SOCIAL_ANALYZE_VERSION = "social-analyze-v1";

export type InfluenceBand = "Unknown" | "Low" | "Moderate" | "Strong coordination — actor UNDETERMINED";

export interface SocialAnalyzeReport {
  version: string;
  profile: ProfileSnapshot;
  ownPosts: number;
  /** Stage-1 authenticity of the seed account (with full-context peers when
   * expansion ran). undefined only when nothing at all was collected. */
  authenticity?: AuthenticityAssessment;
  seeds: Seed[];
  /** Stage-3 amplification analysis over own posts + expanded mentions. */
  expansion?: CibReport & { sources: SourceStatus[] };
  band: InfluenceBand;
  attribution: string; // verbatim UNDETERMINED framing (shared with CIB)
  collectionGaps: string[];
  generatedAt: string;
}

function snapshotToProfile(s: ProfileSnapshot): AccountProfile {
  return {
    platform: s.platform, username: s.handle,
    followers: s.followers, follows: s.follows, posts: s.posts,
    createdAt: s.createdAt, avatarUrl: s.avatarUrl, avatarHash: s.avatarHash, bio: s.bio,
  };
}

/** Merge per-query source statuses: connected if any query reached the source. */
function mergeStatuses(runs: SourceStatus[][]): SourceStatus[] {
  const bySource = new Map<string, SourceStatus>();
  for (const run of runs) {
    for (const s of run) {
      const cur = bySource.get(s.source);
      if (!cur) bySource.set(s.source, { ...s });
      else {
        cur.connected = cur.connected || s.connected;
        cur.count += s.count;
        cur.error = cur.error || s.error;
      }
    }
  }
  return [...bySource.values()];
}

export async function runSocialAnalyze(profileRef: string): Promise<SocialAnalyzeReport | { error: string }> {
  const parsed = parseProfileInput(profileRef);
  if (!parsed) {
    return { error: "Not a recognizable profile reference — paste a bsky.app/profile/… or x.com/… profile link, or an @handle." };
  }
  const generatedAt = new Date().toISOString();
  const gaps: string[] = [];

  // --- Stage 1: snapshot + own posts ---
  const profile = await fetchProfile(parsed.platform, parsed.handle);
  if (!profile.connected) gaps.push(`Profile not collected: ${profile.reason || "source not connected."}`);
  const timeline = await fetchAuthorPosts(parsed.platform, parsed.handle);
  if (!timeline.connected) gaps.push(`Timeline not collected: ${timeline.reason || "source not connected."}`);
  const own = timeline.posts;
  const accountKey = profile.accountId || parsed.handle;

  // --- Stage 2: seeds from the account's own content ---
  const seeds = extractSeeds(own);
  if (own.length && !seeds.length) gaps.push("No seed narrative extracted (posts too short/diverse).");
  if (!own.length) gaps.push("No own posts collected — network expansion skipped.");

  // --- Stage 3: expand each seed across the connected sources, then CIB ---
  let expansion: SocialAnalyzeReport["expansion"];
  let merged: Mention[] = [...own];
  let anySourceConnected = false;
  if (seeds.length) {
    const runs = await Promise.all(seeds.map((s) => collectMentions(s.query)));
    const statuses = mergeStatuses(runs.map((r) => r.map((x) => x.status)));
    anySourceConnected = statuses.some((s) => s.connected);
    const seen = new Set(own.map((m) => `${m.source}:${m.id}`));
    for (const r of runs.flat()) {
      for (const m of r.mentions) {
        const k = `${m.source}:${m.id}`;
        if (!seen.has(k)) { seen.add(k); merged.push(m); }
      }
    }

    // Provider profiles for the top amplifying accounts (env-gated; additive).
    let profiles: Record<string, AccountProfile> | undefined;
    const provider = resolvePlatformProvider();
    if (provider) {
      const counts = new Map<string, { platform: string; handle: string; count: number }>();
      for (const m of merged) {
        const id = m.accountId || m.account;
        if (!id || !provider.supports(m.source)) continue;
        const cur = counts.get(id);
        if (cur) cur.count++;
        else counts.set(id, { platform: m.source, handle: m.account || id, count: 1 });
      }
      const top = [...counts.entries()].filter(([, v]) => v.count >= 2)
        .sort((a, b) => b[1].count - a[1].count).slice(0, 8);
      const fetched = await Promise.all(top.map(async ([id, v]) => {
        try { return [id, await provider.fetchAccount(v.platform, v.handle)] as const; }
        catch { return [id, null] as const; }
      }));
      const ok = fetched.filter((f): f is [string, AccountProfile] => !!f[1]);
      if (ok.length) profiles = Object.fromEntries(ok);
    }
    // The seed account's own profile always joins the map when collected.
    if (profile.connected) {
      profiles = { ...(profiles || {}), [accountKey]: snapshotToProfile(profile) };
    }

    expansion = { ...analyzeCib(parsed.handle, merged, profiles), sources: statuses };
    if (!anySourceConnected) gaps.push("No expansion source connected — amplification not assessed.");
  }

  // --- Stage 1 (final): seed-account authenticity with full peer context ---
  const authenticity = (own.length || profile.connected)
    ? assessAccount({
        account: accountKey,
        own,
        all: merged,
        profile: profile.connected ? snapshotToProfile(profile) : null,
      })
    : undefined;

  // --- Stage 4: band. Unknown when nothing beyond the seed's own posts could
  //     even be checked; the ceiling string is FROZEN wording. ---
  const expandedBeyondOwn = merged.length > own.length;
  const band: InfluenceBand =
    !expansion || (!anySourceConnected && !expandedBeyondOwn) ? "Unknown"
      : expansion.likelihood === "Strong" ? "Strong coordination — actor UNDETERMINED"
        : expansion.likelihood === "Moderate" ? "Moderate"
          : "Low";

  return {
    version: SOCIAL_ANALYZE_VERSION,
    profile,
    ownPosts: own.length,
    authenticity,
    seeds,
    expansion,
    band,
    attribution: ATTRIBUTION,
    collectionGaps: gaps,
    generatedAt,
  };
}
