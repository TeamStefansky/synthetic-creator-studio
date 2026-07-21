// NarrativeSource adapters - server-side only. Each declares its access model
// and returns normalized Mentions plus a connection status. A source that is
// unavailable/unauthorized reports connected:false (rendered as "source not
// connected") - never simulated. Failure of one source never aborts the batch.
//
// All sources here query PUBLIC data via official public endpoints.

import { getJson, getText } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";
import type { Mention, SourceStatus } from "./types";

export interface SourceResult {
  status: SourceStatus;
  mentions: Mention[];
}

interface NarrativeSource {
  name: string;
  /** true when reachable with current config (keyless, or key present). */
  available(): boolean;
  reason?: string; // why unavailable
  search(query: string): Promise<Mention[]>;
}

const UA = "TruthLens/0.1 (brand narrative monitoring)";

// ---- Free, keyless public sources --------------------------------------------

const gdelt: NarrativeSource = {
  name: "gdelt",
  available: () => true,
  async search(q) {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&format=json&maxrecords=50&sort=datedesc&timespan=3d`;
    const data = await getJson<any>(url, { timeoutMs: 15000, headers: { "User-Agent": UA } });
    return (data?.articles || []).map((a: any): Mention => ({
      source: "gdelt", id: a.url || a.title, text: a.title || "", url: a.url,
      account: a.domain, accountId: a.domain, lang: a.language, country: a.sourcecountry,
      timestamp: parseGdeltDate(a.seendate),
    }));
  },
};

// ---- X / Twitter (key-gated; search needs Basic tier+) -----------------------

const x: NarrativeSource = {
  name: "x",
  available: () => !!process.env.X_BEARER_TOKEN,
  reason: "Set X_BEARER_TOKEN (X/Twitter API - search needs Basic tier or higher).",
  async search(q) {
    const token = process.env.X_BEARER_TOKEN!;
    const params = new URLSearchParams({
      query: `${q} -is:retweet`,
      max_results: "50",
      "tweet.fields": "public_metrics,created_at,lang",
      expansions: "author_id",
      "user.fields": "username,name,created_at,public_metrics",
    });
    const data = await getJson<any>(`https://api.twitter.com/2/tweets/search/recent?${params.toString()}`, {
      timeoutMs: 15000, headers: { Authorization: `Bearer ${token}` },
    });
    const users = new Map<string, any>((data?.includes?.users || []).map((u: any) => [u.id, u]));
    return (data?.data || []).map((t: any): Mention => {
      const u = users.get(t.author_id);
      const m = t.public_metrics || {};
      return {
        source: "x", id: String(t.id), text: t.text || "",
        url: u?.username ? `https://x.com/${u.username}/status/${t.id}` : undefined,
        account: u?.username, accountId: String(t.author_id), lang: t.lang,
        timestamp: t.created_at,
        engagement: (m.like_count || 0) + (m.retweet_count || 0) + (m.reply_count || 0) + (m.quote_count || 0),
      };
    });
  },
};

const bluesky: NarrativeSource = {
  name: "bluesky",
  available: () => true,
  async search(q) {
    const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&limit=50&sort=latest`;
    const data = await getJson<any>(url, { timeoutMs: 15000, headers: { "User-Agent": UA } });
    return (data?.posts || []).map((p: any): Mention => {
      const rkey = String(p.uri || "").split("/").pop();
      const handle = p.author?.handle;
      return {
        source: "bluesky", id: p.uri || p.cid, text: p.record?.text || "",
        url: handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : undefined,
        account: handle, accountId: p.author?.did, lang: p.record?.langs?.[0],
        timestamp: p.record?.createdAt || p.indexedAt,
        engagement: (p.likeCount || 0) + (p.repostCount || 0) + (p.replyCount || 0),
      };
    });
  },
};

const hackernews: NarrativeSource = {
  name: "hackernews",
  available: () => true,
  async search(q) {
    const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=50`;
    const data = await getJson<any>(url, { timeoutMs: 15000, headers: { "User-Agent": UA } });
    return (data?.hits || []).map((h: any): Mention => ({
      source: "hackernews", id: String(h.objectID), text: h.title || h.story_text || "",
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      account: h.author, accountId: h.author,
      timestamp: h.created_at, engagement: (h.points || 0) + (h.num_comments || 0),
    }));
  },
};

const reddit: NarrativeSource = {
  name: "reddit",
  available: () => true, // best-effort keyless; Reddit may throttle server IPs
  async search(q) {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&limit=50&raw_json=1`;
    const data = await getJson<any>(url, { timeoutMs: 15000, headers: { "User-Agent": UA } });
    return (data?.data?.children || []).map((c: any): Mention => {
      const d = c.data || {};
      return {
        source: "reddit", id: d.name || d.id,
        text: `${d.title || ""}. ${d.selftext || ""}`.trim().replace(/\.$/, ""),
        url: d.permalink ? `https://www.reddit.com${d.permalink}` : d.url,
        account: d.author, accountId: d.author,
        timestamp: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : undefined,
        engagement: (d.ups || 0) + (d.num_comments || 0),
      };
    });
  },
};

const rss: NarrativeSource = {
  name: "rss",
  available: () => !!process.env.RSS_FEEDS,
  reason: "Set RSS_FEEDS (comma-separated feed URLs) to enable.",
  async search(q) {
    const feeds = (process.env.RSS_FEEDS || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8);
    const want = queryTerms(q);
    const out: Mention[] = [];
    for (const feed of feeds) {
      const xml = await getText(feed, { timeoutMs: 12000, headers: { "User-Agent": UA } });
      if (!xml) continue;
      const host = feed.split("/")[2] || feed;
      for (const item of xml.split(/<item[ >]/i).slice(1)) {
        const title = strip(pick(item, "title"));
        const desc = strip(pick(item, "description"));
        const hay = `${title} ${desc}`.toLowerCase();
        if (want.length && !want.some((t) => hay.includes(t))) continue;
        out.push({
          source: "rss", id: pick(item, "guid") || pick(item, "link") || title,
          text: `${title}. ${desc}`.trim().replace(/\.$/, ""),
          url: pick(item, "link") || undefined, account: host, accountId: host,
          timestamp: toIso(pick(item, "pubDate")),
        });
      }
    }
    return out;
  },
};

// ---- Key-gated public sources (render "not connected" without a key) ----------

const guardian: NarrativeSource = {
  name: "guardian",
  available: () => !!process.env.GUARDIAN_API_KEY,
  reason: "Set GUARDIAN_API_KEY (free at open-platform.theguardian.com).",
  async search(q) {
    const key = process.env.GUARDIAN_API_KEY!;
    const url = `https://content.guardianapis.com/search?q=${encodeURIComponent(q)}&api-key=${key}&show-fields=trailText,byline&page-size=50&order-by=newest`;
    const data = await getJson<any>(url, { timeoutMs: 15000 });
    return (data?.response?.results || []).map((r: any): Mention => ({
      source: "guardian", id: r.id || r.webUrl, text: `${r.webTitle || ""}. ${r.fields?.trailText || ""}`.trim().replace(/\.$/, ""),
      url: r.webUrl, account: r.fields?.byline || "The Guardian", accountId: "guardian",
      timestamp: r.webPublicationDate,
    }));
  },
};

const nyt: NarrativeSource = {
  name: "nyt",
  available: () => !!process.env.NYT_API_KEY,
  reason: "Set NYT_API_KEY (free at developer.nytimes.com).",
  async search(q) {
    const key = process.env.NYT_API_KEY!;
    const url = `https://api.nytimes.com/svc/search/v2/articlesearch.json?q=${encodeURIComponent(q)}&api-key=${key}&sort=newest`;
    const data = await getJson<any>(url, { timeoutMs: 15000 });
    return (data?.response?.docs || []).map((d: any): Mention => ({
      source: "nyt", id: d._id || d.web_url, text: `${d.headline?.main || ""}. ${d.abstract || ""}`.trim().replace(/\.$/, ""),
      url: d.web_url, account: d.byline?.original || "The New York Times", accountId: "nyt",
      timestamp: d.pub_date,
    }));
  },
};

const gnews: NarrativeSource = {
  name: "gnews",
  available: () => !!process.env.GNEWS_API_KEY,
  reason: "Set GNEWS_API_KEY (free at gnews.io).",
  async search(q) {
    const key = process.env.GNEWS_API_KEY!;
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&token=${key}&lang=en&max=50&sortby=publishedAt`;
    const data = await getJson<any>(url, { timeoutMs: 15000 });
    return (data?.articles || []).map((a: any): Mention => ({
      source: "gnews", id: a.url, text: `${a.title || ""}. ${a.description || ""}`.trim().replace(/\.$/, ""),
      url: a.url, account: a.source?.name, accountId: "gnews", timestamp: a.publishedAt,
    }));
  },
};

const newsapi: NarrativeSource = {
  name: "newsapi",
  available: () => !!process.env.NEWSAPI_KEY,
  reason: "Set NEWSAPI_KEY (free dev tier at newsapi.org).",
  async search(q) {
    const key = process.env.NEWSAPI_KEY!;
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&pageSize=50&language=en&sortBy=publishedAt&apiKey=${key}`;
    const data = await getJson<any>(url, { timeoutMs: 15000 });
    return (data?.articles || []).map((a: any): Mention => ({
      source: "newsapi", id: a.url, text: `${a.title || ""}. ${a.description || ""}`.trim().replace(/\.$/, ""),
      url: a.url, account: a.source?.name, accountId: "newsapi", timestamp: a.publishedAt,
    }));
  },
};

export const SOURCES: NarrativeSource[] = [
  x, gdelt, bluesky, hackernews, reddit, rss, guardian, nyt, gnews, newsapi,
];

/** Run every source in parallel, isolating failures. */
export async function collectMentions(query: string): Promise<SourceResult[]> {
  return Promise.all(SOURCES.map(async (s): Promise<SourceResult> => {
    if (!s.available()) {
      return { status: { source: s.name, connected: false, reason: s.reason, count: 0 }, mentions: [] };
    }
    try {
      const mentions = await s.search(query);
      return { status: { source: s.name, connected: true, count: mentions.length }, mentions };
    } catch (e: any) {
      return { status: { source: s.name, connected: true, count: 0, error: e?.message || "failed" }, mentions: [] };
    }
  }));
}

// ---- Bluesky account-creation enrichment (behind the adapter pattern) --------
// Bluesky's public profile endpoint exposes an account's createdAt. We enrich
// only the accounts already collected, capped and cached per-DID so a report for
// a given day is reproducible and we never hammer the endpoint. Accounts we
// cannot resolve simply keep accountCreatedAt undefined → "Not collected".

const BSKY_ENRICH_CAP = 40;          // max profiles resolved per request
const BSKY_CREATED_TTL = 30 * 86_400_000; // creation date is immutable → long TTL

async function blueskyCreatedAt(actor: string): Promise<string | null> {
  const cacheKey = `bsky-created:${actor}`;
  const hit = await cacheGet<string>(cacheKey, BSKY_CREATED_TTL);
  if (hit) return hit;
  const url = `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`;
  const data = await getJson<any>(url, { timeoutMs: 10000, headers: { "User-Agent": UA } });
  const created = data?.createdAt;
  if (typeof created === "string" && !isNaN(Date.parse(created))) {
    await cacheSet(cacheKey, created);
    return created;
  }
  return null;
}

/** Fill accountCreatedAt on Bluesky mentions in place (best-effort). Failure of
 * enrichment never affects the mentions themselves - they stay uncollected. */
export async function enrichCreationDates(mentions: Mention[]): Promise<void> {
  const actors = new Map<string, string>(); // did → actor id to query
  for (const m of mentions) {
    if (m.source !== "bluesky" || m.accountCreatedAt) continue;
    const id = m.accountId || m.account;
    if (id) actors.set(id, id);
  }
  const ids = [...actors.keys()].slice(0, BSKY_ENRICH_CAP);
  if (!ids.length) return;
  const resolved = new Map<string, string>();
  await Promise.all(ids.map(async (id) => {
    try {
      const created = await blueskyCreatedAt(id);
      if (created) resolved.set(id, created);
    } catch { /* leave uncollected */ }
  }));
  for (const m of mentions) {
    if (m.source !== "bluesky" || m.accountCreatedAt) continue;
    const id = m.accountId || m.account;
    const created = id ? resolved.get(id) : undefined;
    if (created) m.accountCreatedAt = created;
  }
}

// ---- helpers -----------------------------------------------------------------

function queryTerms(q: string): string[] {
  return q.replace(/ OR | AND |"/g, " ").split(/\s+/).map((t) => t.toLowerCase()).filter((t) => t.length > 1);
}
function pick(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : "";
}
function strip(s: string): string {
  return s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").trim();
}
function toIso(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}
function parseGdeltDate(v?: string): string | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})/);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}
