// Profile adapters - official public APIs only (CLAUDE.md rule 5: no scraping,
// no wrappers). Bluesky public AppView is keyless; X requires X_BEARER_TOKEN and
// renders "source not connected" without it. Snapshots are cached per day so a
// report for a given day is reproducible (rule 8).

import { getJson } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";
import { avatarContentHash } from "./avatar";
import { fetchIgDiscovery } from "./instagram";
import type { ProfileSnapshot, SocialPlatform } from "./types";

const UA = "TruthLens/0.1 (account authenticity - public profile lookup)";
const SNAPSHOT_TTL = 24 * 60 * 60 * 1000; // per-day reproducibility

/** Parse a profile reference into {platform, handle}.
 * Supported: bsky.app/profile/<handle|did> URLs, x.com|twitter.com/<handle> URLs,
 * "@name.tld" / "name.tld" (a domain-shaped handle → Bluesky), "@name" (→ X, the
 * canonical @-convention). Post/status URLs (anything after the handle segment)
 * are NOT profiles → null. */
export function parseProfileInput(input: string): { platform: SocialPlatform; handle: string } | null {
  const s = (input || "").trim();
  if (!s) return null;

  // Profile page ONLY - bsky.app/profile/<handle>/post/<rkey> is a post, not a profile.
  const bsky = s.match(/bsky\.app\/profile\/([A-Za-z0-9.:_-]+?)\/?(?:[?#]|$)/i);
  if (bsky) return { platform: "bluesky", handle: bsky[1] };

  const x = s.match(/(?:x|twitter)\.com\/(@?[A-Za-z0-9_]{1,15})\/?(?:[?#]|$)/i);
  if (x) {
    const h = x[1].replace(/^@/, "");
    // Reserved paths that are not profiles.
    if (/^(i|home|search|explore|notifications|messages|settings|intent|hashtag|share|status)$/i.test(h)) return null;
    return { platform: "x", handle: h };
  }

  // Instagram PROFILE page only - instagram.com/<handle>. Post/reel/story links
  // (instagram.com/p/…, /reel/…, /stories/…) are NOT profiles → fall through.
  const ig = s.match(/instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:[?#]|$)/i);
  if (ig) {
    const h = ig[1].toLowerCase();
    if (/^(p|reel|reels|tv|stories|explore|accounts|direct|about|developer|legal|privacy|terms|web|session|s)$/i.test(h)) return null;
    return { platform: "instagram", handle: h };
  }

  if (/^https?:\/\//i.test(s)) return null; // some other URL - not a profile reference

  const bare = s.replace(/^@/, "");
  if (/^did:[a-z0-9:.%-]+$/i.test(bare)) return { platform: "bluesky", handle: bare };
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(bare)) return { platform: "bluesky", handle: bare.toLowerCase() };
  if (/^[A-Za-z0-9_]{1,15}$/.test(bare) && s.startsWith("@")) return { platform: "x", handle: bare };
  return null;
}

function notConnected(platform: SocialPlatform, handle: string, reason: string): ProfileSnapshot {
  return { platform, handle, connected: false, reason, collectedAt: new Date().toISOString() };
}

async function fetchBlueskyProfile(handle: string): Promise<ProfileSnapshot> {
  const url = `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`;
  const p = await getJson<any>(url, { timeoutMs: 12000, headers: { "User-Agent": UA } });
  if (!p?.handle && !p?.did) return notConnected("bluesky", handle, "Profile not found or Bluesky AppView unreachable.");
  return {
    platform: "bluesky",
    handle: p.handle || handle,
    accountId: p.did,
    displayName: p.displayName,
    bio: p.description,
    avatarUrl: p.avatar,
    createdAt: p.createdAt,
    followers: numOrUndef(p.followersCount),
    follows: numOrUndef(p.followsCount),
    posts: numOrUndef(p.postsCount),
    collectedAt: new Date().toISOString(),
    connected: true,
  };
}

async function fetchXProfile(handle: string): Promise<ProfileSnapshot> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return notConnected("x", handle, "Set X_BEARER_TOKEN (X API v2) to collect X profiles.");
  const params = new URLSearchParams({ "user.fields": "created_at,description,public_metrics,profile_image_url" });
  const data = await getJson<any>(
    `https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}?${params.toString()}`,
    { timeoutMs: 12000, headers: { Authorization: `Bearer ${token}` } },
  );
  const u = data?.data;
  if (!u?.id) return notConnected("x", handle, "X profile lookup failed (check token/access tier or handle).");
  const m = u.public_metrics || {};
  return {
    platform: "x",
    handle: u.username || handle,
    accountId: String(u.id),
    displayName: u.name,
    bio: u.description,
    avatarUrl: u.profile_image_url,
    createdAt: u.created_at,
    followers: numOrUndef(m.followers_count),
    follows: numOrUndef(m.following_count),
    posts: numOrUndef(m.tweet_count),
    collectedAt: new Date().toISOString(),
    connected: true,
  };
}

async function fetchInstagramProfile(handle: string): Promise<ProfileSnapshot> {
  const d = await fetchIgDiscovery(handle);
  if (!d.connected) return notConnected("instagram", handle, d.reason || "Instagram profile unavailable.");
  return {
    platform: "instagram",
    handle: d.username || handle,
    accountId: d.id,
    displayName: d.name,
    bio: d.biography,
    avatarUrl: d.profilePictureUrl,
    // createdAt: the Instagram Graph API does not expose account creation date → Not collected.
    followers: d.followersCount,
    follows: d.followsCount,
    posts: d.mediaCount,
    collectedAt: d.collectedAt,
    connected: true,
  };
}

/** Fetch a ProfileSnapshot (cached per day). Adds the avatar content-hash when an
 * avatar URL was collected - hash failure just leaves the field Not collected. */
export async function fetchProfile(platform: SocialPlatform, handle: string): Promise<ProfileSnapshot> {
  const ck = `social:profile:${platform}:${handle.toLowerCase()}`;
  const cached = await cacheGet<ProfileSnapshot>(ck, SNAPSHOT_TTL);
  if (cached) return cached;

  const snap =
    platform === "bluesky" ? await fetchBlueskyProfile(handle)
    : platform === "instagram" ? await fetchInstagramProfile(handle)
    : await fetchXProfile(handle);
  if (snap.connected && snap.avatarUrl) {
    snap.avatarHash = (await avatarContentHash(snap.avatarUrl)) || undefined;
  }
  // Cache only successful collections; a "not connected" state should retry next call.
  if (snap.connected) await cacheSet(ck, snap);
  return snap;
}

function numOrUndef(v: any): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
