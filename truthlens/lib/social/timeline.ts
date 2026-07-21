// Author-timeline collection - official public APIs only. Bluesky getAuthorFeed
// is keyless; X needs X_BEARER_TOKEN (two calls: id lookup + timeline) and
// renders "not connected" without it. Reposts are skipped (we assess the
// account's OWN content). Cached per day for reproducibility.

import { getJson } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";
import type { Mention } from "@/lib/narrative/types";
import type { SocialPlatform } from "./types";

const UA = "TruthLens/0.1 (account authenticity - public timeline lookup)";
const TIMELINE_TTL = 24 * 60 * 60 * 1000;
const LIMIT = 50;

export interface AuthorPosts {
  connected: boolean;
  reason?: string;
  posts: Mention[];
}

async function blueskyAuthorPosts(handle: string): Promise<AuthorPosts> {
  const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=${LIMIT}`;
  const data = await getJson<any>(url, { timeoutMs: 12000, headers: { "User-Agent": UA } });
  if (!Array.isArray(data?.feed)) {
    return { connected: false, reason: "Bluesky author feed unavailable for this handle.", posts: [] };
  }
  const posts: Mention[] = [];
  for (const item of data.feed) {
    if (item?.reason) continue; // a repost - not the account's own content
    const p = item?.post;
    if (!p?.record?.text) continue;
    const rkey = String(p.uri || "").split("/").pop();
    const h = p.author?.handle;
    posts.push({
      source: "bluesky", id: p.uri || p.cid, text: p.record.text,
      url: h && rkey ? `https://bsky.app/profile/${h}/post/${rkey}` : undefined,
      account: h, accountId: p.author?.did, lang: p.record?.langs?.[0],
      timestamp: p.record?.createdAt || p.indexedAt,
      engagement: (p.likeCount || 0) + (p.repostCount || 0) + (p.replyCount || 0),
    });
  }
  return { connected: true, posts };
}

async function xAuthorPosts(handle: string): Promise<AuthorPosts> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return { connected: false, reason: "Set X_BEARER_TOKEN (X API v2) to collect X timelines.", posts: [] };
  const headers = { Authorization: `Bearer ${token}` };
  const user = await getJson<any>(
    `https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}`,
    { timeoutMs: 12000, headers },
  );
  const uid = user?.data?.id;
  if (!uid) return { connected: false, reason: "X user lookup failed (check token/access tier or handle).", posts: [] };
  const params = new URLSearchParams({
    max_results: String(LIMIT),
    "tweet.fields": "public_metrics,created_at,lang",
    exclude: "retweets,replies",
  });
  const data = await getJson<any>(
    `https://api.twitter.com/2/users/${uid}/tweets?${params.toString()}`,
    { timeoutMs: 15000, headers },
  );
  if (!Array.isArray(data?.data)) {
    return { connected: false, reason: "X timeline unavailable (check access tier).", posts: [] };
  }
  const posts: Mention[] = data.data.map((t: any): Mention => {
    const m = t.public_metrics || {};
    return {
      source: "x", id: String(t.id), text: t.text || "",
      url: `https://x.com/${handle}/status/${t.id}`,
      account: handle, accountId: String(uid), lang: t.lang, timestamp: t.created_at,
      engagement: (m.like_count || 0) + (m.retweet_count || 0) + (m.reply_count || 0) + (m.quote_count || 0),
    };
  });
  return { connected: true, posts };
}

/** Fetch an account's own recent posts (cached per day). */
export async function fetchAuthorPosts(platform: SocialPlatform, handle: string): Promise<AuthorPosts> {
  const ck = `social:timeline:${platform}:${handle.toLowerCase()}`;
  const cached = await cacheGet<AuthorPosts>(ck, TIMELINE_TTL);
  if (cached) return cached;
  const out = platform === "bluesky" ? await blueskyAuthorPosts(handle) : await xAuthorPosts(handle);
  if (out.connected) await cacheSet(ck, out); // never cache a "not connected" state
  return out;
}
