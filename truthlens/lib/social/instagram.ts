// Instagram data adapter - Meta Graph API "Business Discovery" ONLY. This is the
// single lawful public path for Instagram: an operator's own Business/Creator IG
// account (linked to a Facebook Page) can look up PUBLIC profile + recent-media
// metrics of OTHER Business/Creator accounts by username. It is an official
// endpoint, public-data-only, no login-walled scraping and no unofficial wrapper
// (CLAUDE.md rules 5 & 7). Personal/private accounts are NOT covered by the API,
// so they degrade to a visible "source not connected" state - never faked.
//
// Hard limits of this source (surfaced honestly, not worked around):
//   - Business/Creator accounts only. Personal/private → not connected.
//   - Account CREATION DATE is not exposed by the Instagram Graph API → the
//     temporal "account age" signal stays "Not collected" for Instagram.
//   - A discovered account's FOLLOWER LIST is not enumerable → no follower sample.
//   - Rate-limited by Meta; results are cached per day for reproducibility (rule 8).
//
// Env-gated (both required; absent → not connected):
//   META_GRAPH_TOKEN  long-lived token for the operator's app (scopes:
//                     instagram_basic + a linked Business/Creator IG account)
//   IG_USER_ID        the operator's own IG Business/Creator account id
//   META_GRAPH_VERSION optional Graph API version (default below)

import { fetchWithTimeout } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";

const GRAPH_VERSION = (process.env.META_GRAPH_VERSION || "v22.0").trim();
const MEDIA_LIMIT = 25;
const DISCOVERY_TTL = 24 * 60 * 60 * 1000; // per-day reproducibility

export interface IgMediaItem {
  id: string;
  caption?: string;
  likeCount?: number;
  commentsCount?: number;
  timestamp?: string;
  permalink?: string;
  mediaType?: string;
}

export interface IgDiscovery {
  /** false → a visible "source not connected" state, never faked (rule 7). */
  connected: boolean;
  reason?: string;
  username?: string;
  /** The discovered account's IG id (an account id, never a person). */
  id?: string;
  name?: string;
  biography?: string;
  website?: string;
  profilePictureUrl?: string;
  followersCount?: number;
  followsCount?: number;
  mediaCount?: number;
  media?: IgMediaItem[];
  collectedAt: string;
}

/** Whether the Business Discovery source is configured at all. */
export function instagramConfigured(): boolean {
  return !!(process.env.META_GRAPH_TOKEN?.trim() && process.env.IG_USER_ID?.trim());
}

/** IG usernames are case-insensitive; strip a leading @ and lowercase. */
export function normalizeIgUsername(input: string): string {
  return (input || "").trim().replace(/^@/, "").toLowerCase();
}

/** The `fields` value for a Business Discovery lookup. Pure (unit-tested);
 * never contains the access token. */
export function discoveryFields(username: string): string {
  const media = `media.limit(${MEDIA_LIMIT}){id,caption,like_count,comments_count,timestamp,permalink,media_type}`;
  const fields = `followers_count,follows_count,media_count,biography,name,username,profile_picture_url,website,id,${media}`;
  return `business_discovery.username(${username}){${fields}}`;
}

/** Map a Graph API error object to an honest, actionable reason string. */
export function parseIgError(err: any): string {
  const code = err?.code;
  const msg = String(err?.message || "");
  if (code === 190) return "Instagram access token is invalid or expired (regenerate META_GRAPH_TOKEN).";
  if (code === 100 || /does not exist|cannot find|invalid user|not found/i.test(msg))
    return "Instagram username not found, or it is a personal/private account (Business Discovery covers Business/Creator accounts only).";
  if (code === 4 || code === 17 || code === 32 || /rate limit|request limit|reduce the amount/i.test(msg))
    return "Instagram Graph API rate limit reached; try again later (results are cached per day).";
  if (code === 10 || code === 200 || /permission/i.test(msg))
    return "The connected app/token lacks Business Discovery permissions (needs instagram_basic + a linked Business/Creator IG account).";
  return msg ? `Instagram Graph API error: ${msg}` : "Instagram Graph API request was rejected.";
}

/** Map a raw `business_discovery` object to the typed IgDiscovery. Pure. */
export function mapDiscovery(bd: any, collectedAt: string): IgDiscovery {
  const media: IgMediaItem[] = Array.isArray(bd?.media?.data)
    ? bd.media.data.map((m: any): IgMediaItem => ({
        id: String(m?.id ?? ""),
        caption: strOrUndef(m?.caption),
        likeCount: numOrUndef(m?.like_count),
        commentsCount: numOrUndef(m?.comments_count),
        timestamp: strOrUndef(m?.timestamp),
        permalink: strOrUndef(m?.permalink),
        mediaType: strOrUndef(m?.media_type),
      }))
    : [];
  return {
    connected: true,
    username: bd?.username,
    id: bd?.id != null ? String(bd.id) : undefined,
    name: strOrUndef(bd?.name),
    biography: strOrUndef(bd?.biography),
    website: strOrUndef(bd?.website),
    profilePictureUrl: strOrUndef(bd?.profile_picture_url),
    followersCount: numOrUndef(bd?.followers_count),
    followsCount: numOrUndef(bd?.follows_count),
    mediaCount: numOrUndef(bd?.media_count),
    media,
    collectedAt,
  };
}

/** Fetch a public IG Business/Creator profile + recent media via Business
 * Discovery. Cached per day. profile.ts and timeline.ts both read from this one
 * call, so an Instagram lookup is a single Graph request (reproducible). */
export async function fetchIgDiscovery(usernameRaw: string): Promise<IgDiscovery> {
  const now = () => new Date().toISOString();
  const username = normalizeIgUsername(usernameRaw);
  if (!username) return { connected: false, reason: "No Instagram username provided.", collectedAt: now() };

  const token = process.env.META_GRAPH_TOKEN?.trim();
  const igUser = process.env.IG_USER_ID?.trim();
  if (!token || !igUser) {
    return {
      connected: false,
      reason: "Set META_GRAPH_TOKEN + IG_USER_ID (Instagram Graph API, Business Discovery) to collect Instagram Business/Creator accounts.",
      collectedAt: now(),
    };
  }

  const ck = `social:ig:disc:${username}`;
  const cached = await cacheGet<IgDiscovery>(ck, DISCOVERY_TTL);
  if (cached) return cached;

  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(igUser)}` +
    `?fields=${encodeURIComponent(discoveryFields(username))}` +
    `&access_token=${encodeURIComponent(token)}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(url, { timeoutMs: 15000 });
  } catch {
    return { connected: false, reason: "Instagram Graph API request failed (network/timeout).", collectedAt: now() };
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok || body?.error) {
    return { connected: false, reason: parseIgError(body?.error), collectedAt: now() };
  }

  const bd = body?.business_discovery;
  if (!bd || !bd.username) {
    return {
      connected: false,
      reason: "Instagram returned no Business Discovery data for this username (account may be personal/private, or not found).",
      collectedAt: now(),
    };
  }

  const out = mapDiscovery(bd, now());
  await cacheSet(ck, out); // never cache a "not connected" state
  return out;
}

function numOrUndef(v: any): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function strOrUndef(v: any): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}
