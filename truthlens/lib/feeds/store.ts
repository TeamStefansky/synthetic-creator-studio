// User-managed feed store (Connections). A feed is added only after it VALIDATES
// (SSRF-guarded fetch + RSS/Atom parse); an unvalidated URL is never saved.
//
// Scope: this deployment is single-tenant (one shared access password = one
// workspace), so saved feeds live in ONE workspace namespace: KV `conn:feeds:default`
// when storeAvailable(), else the client persists them in localStorage
// (tl:connections:feeds). We never write a cross-tenant/global namespace; per-user
// scoping is a future item once there is per-user identity (see NOTES.md).

import { storeAvailable, kvGetJson, kvSetJson } from "@/lib/store";
import { assertSafeUrl, safeFetchText, parseFeed, PREVIEW_ITEMS } from "./fetch";

export const FEEDS_KEY = "conn:feeds:default";       // single-workspace KV namespace
export const LOCAL_FEEDS_KEY = "tl:connections:feeds"; // client localStorage fallback
export const MAX_FEEDS = 25;               // per-scope cap
export const MAX_ITEMS_PER_FEED = 40;      // items ingested per feed per scan
export const FEED_FETCH_BUDGET = 20;       // max feeds fetched in one scan (timeout budget)
export const FEED_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // per (feedUrl, day)

export type FeedStatus = "ok" | "error" | "empty";

export interface UserFeed {
  id: string;
  url: string;              // normalized
  title?: string;
  siteUrl?: string;
  addedAt: string;
  lastFetchedAt?: string;
  lastStatus?: FeedStatus;
  lastError?: string;
  itemCount?: number;
  enabled: boolean;
  etag?: string;
  lastModified?: string;
}

export interface FeedPreview {
  url: string;
  title?: string;
  siteUrl?: string;
  kind: "rss" | "atom";
  itemCount: number;
  sampleTitles: string[];
}

/** Normalize for dedup: lowercase scheme+host, strip trailing slash + hash. */
export function normalizeFeedUrl(raw: string): string {
  const u = new URL(raw.trim());
  u.protocol = u.protocol.toLowerCase();
  u.hostname = u.hostname.toLowerCase();
  u.hash = "";
  let s = u.toString();
  if (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

/** Validate a URL and return a preview (title + a few item titles). Throws a
 * user-safe error when it is unsafe or does not parse — the caller must NOT save
 * a feed that fails this. */
export async function validateAndPreview(rawUrl: string): Promise<FeedPreview> {
  const normalized = normalizeFeedUrl(rawUrl); // throws on invalid URL
  await assertSafeUrl(normalized);             // SSRF guard
  const { text } = await safeFetchText(normalized);
  const parsed = parseFeed(text);              // throws when not RSS/Atom
  return {
    url: normalized,
    title: parsed.title,
    siteUrl: parsed.siteUrl,
    kind: parsed.kind,
    itemCount: parsed.items.length,
    sampleTitles: parsed.items.slice(0, PREVIEW_ITEMS).map((i) => i.title).filter(Boolean),
  };
}

// ---- server-side (KV) persistence -------------------------------------------
// Returns { connected:false } honestly when there is no KV, so the client knows to
// use its localStorage fallback (never faked).

export function feedsConnected(): boolean {
  return storeAvailable();
}

export async function listFeeds(): Promise<UserFeed[]> {
  if (!storeAvailable()) return [];
  return (await kvGetJson<UserFeed[]>(FEEDS_KEY)) || [];
}

async function saveFeeds(feeds: UserFeed[]): Promise<void> {
  await kvSetJson(FEEDS_KEY, feeds.slice(0, MAX_FEEDS));
}

/** Add (validated) or update-by-normalized-url. Returns the saved feed + the live
 * preview (so the UI can confirm what it added). An invalid URL throws before any
 * save. Requires KV (call feedsConnected() first for the local fallback path). */
export async function addFeed(rawUrl: string, nowIso: string, newId: string): Promise<{ feed: UserFeed; preview: FeedPreview }> {
  const preview = await validateAndPreview(rawUrl);
  const feeds = await listFeeds();
  const existing = feeds.find((f) => f.url === preview.url);
  if (existing) {
    existing.title = existing.title || preview.title;
    existing.siteUrl = preview.siteUrl;
    existing.lastStatus = "ok";
    existing.lastFetchedAt = nowIso;
    existing.itemCount = preview.itemCount;
    existing.lastError = undefined;
    await saveFeeds(feeds);
    return { feed: existing, preview };
  }
  if (feeds.length >= MAX_FEEDS) throw new Error(`Feed limit reached (${MAX_FEEDS}). Remove one first.`);
  const feed: UserFeed = {
    id: newId, url: preview.url, title: preview.title, siteUrl: preview.siteUrl,
    addedAt: nowIso, lastFetchedAt: nowIso, lastStatus: "ok", itemCount: preview.itemCount, enabled: true,
  };
  feeds.push(feed);
  await saveFeeds(feeds);
  return { feed, preview };
}

export async function removeFeed(id: string): Promise<void> {
  const feeds = await listFeeds();
  await saveFeeds(feeds.filter((f) => f.id !== id));
}

export async function updateFeed(id: string, patch: Partial<Pick<UserFeed, "enabled" | "title">>): Promise<UserFeed | null> {
  const feeds = await listFeeds();
  const f = feeds.find((x) => x.id === id);
  if (!f) return null;
  if (patch.enabled !== undefined) f.enabled = patch.enabled;
  if (patch.title !== undefined) f.title = patch.title.slice(0, 200);
  await saveFeeds(feeds);
  return f;
}

/** Persist per-feed scan status back onto the stored feeds (drives the per-feed
 * status badges in the UI). Best-effort; never throws. */
export async function recordFeedStatuses(
  updates: { url: string; status: FeedStatus; error?: string; itemCount?: number; etag?: string; lastModified?: string }[],
  nowIso: string,
): Promise<void> {
  if (!storeAvailable() || !updates.length) return;
  try {
    const feeds = await listFeeds();
    const byUrl = new Map(feeds.map((f) => [f.url, f]));
    for (const u of updates) {
      const f = byUrl.get(u.url);
      if (!f) continue;
      f.lastStatus = u.status;
      f.lastError = u.error;
      f.lastFetchedAt = nowIso;
      if (u.itemCount !== undefined) f.itemCount = u.itemCount;
      if (u.etag) f.etag = u.etag;
      if (u.lastModified) f.lastModified = u.lastModified;
    }
    await saveFeeds(feeds);
  } catch { /* status is best-effort */ }
}
