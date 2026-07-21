// Official-API provider - built on the lib/social/* adapters (Bluesky public
// AppView keyless; X key-gated behind X_BEARER_TOKEN). Adds a public follower
// SAMPLE for Bluesky via app.bsky.graph.getFollowers (keyless, official).
// The sample is used only in aggregate (counted, never listed in output) and is
// cached per day. Fields a platform doesn't expose stay undefined.

import { getJson } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";
import { fetchProfile } from "@/lib/social/profile";
import { fetchIgDiscovery } from "@/lib/social/instagram";
import type { AccountProfile, FollowerSampleItem } from "@/lib/authenticity/types";
import type { PlatformAccountProvider } from "../types";

const UA = "TruthLens/0.1 (account authenticity - public profile lookup)";
const SAMPLE_TTL = 24 * 60 * 60 * 1000;
const SAMPLE_LIMIT = 50;

async function blueskyFollowerSample(actor: string): Promise<FollowerSampleItem[] | undefined> {
  const ck = `social:fsample:${actor.toLowerCase()}`;
  const hit = await cacheGet<FollowerSampleItem[]>(ck, SAMPLE_TTL);
  if (hit) return hit;
  const url = `https://public.api.bsky.app/xrpc/app.bsky.graph.getFollowers?actor=${encodeURIComponent(actor)}&limit=${SAMPLE_LIMIT}`;
  const data = await getJson<any>(url, { timeoutMs: 12000, headers: { "User-Agent": UA } });
  const followers = Array.isArray(data?.followers) ? data.followers : null;
  if (!followers) return undefined; // Not collected
  const sample: FollowerSampleItem[] = followers.map((f: any) => ({
    username: f.handle,
    hasAvatar: !!f.avatar,
    hasBio: !!f.description,
    // ProfileView does not expose post/follower counts - those stay undefined.
  }));
  await cacheSet(ck, sample);
  return sample;
}

export function officialProvider(): PlatformAccountProvider {
  return {
    name: "official",
    supports: (platform) => platform === "bluesky" || platform === "x" || platform === "instagram",
    async fetchAccount(platform, handle) {
      if (platform !== "bluesky" && platform !== "x" && platform !== "instagram") return null;
      const snap = await fetchProfile(platform, handle);
      if (!snap.connected) return null; // renders as Phase-1-only, never faked
      const profile: AccountProfile = {
        platform: snap.platform,
        username: snap.handle,
        followers: snap.followers,
        follows: snap.follows,
        posts: snap.posts,
        createdAt: snap.createdAt,
        avatarUrl: snap.avatarUrl,
        avatarHash: snap.avatarHash,
        bio: snap.bio,
      };
      if (platform === "bluesky") {
        profile.followersSample = await blueskyFollowerSample(snap.accountId || handle).catch(() => undefined);
      }
      if (platform === "instagram") {
        // Business Discovery exposes recent-media like/comment counts (used by the
        // engagement signals) but NOT a follower list → followersSample stays
        // undefined ("Not collected"), never fabricated. Shared per-day cache with
        // fetchProfile, so this is not a second network call.
        const d = await fetchIgDiscovery(handle).catch(() => null);
        if (d?.connected && d.media?.length) {
          profile.recentPosts = d.media.map((m) => ({ likes: m.likeCount, comments: m.commentsCount }));
        }
      }
      return profile;
    },
  };
}
