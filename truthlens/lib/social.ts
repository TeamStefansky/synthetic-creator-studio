// Social amplification + bot analysis via the X (Twitter) API v2 recent search.
// Finds accounts spreading a domain/quote, scores each for inauthenticity, and
// surfaces the top spreaders. Needs X_BEARER_TOKEN (paid X API tier).
// Probabilistic heuristics — indicators, not proof.

import { getJson } from "./http";
import type { SocialResult, SocialAccount } from "./types";

interface XUser {
  id: string;
  name: string;
  username: string;
  created_at?: string;
  description?: string;
  verified?: boolean;
  public_metrics?: { followers_count: number; following_count: number; tweet_count: number };
}
interface XTweet {
  id: string;
  author_id: string;
  created_at?: string;
  public_metrics?: { like_count: number; retweet_count: number; reply_count: number; quote_count: number };
}
interface XResponse {
  data?: XTweet[];
  includes?: { users?: XUser[] };
  meta?: { result_count: number };
}

const UNAVAILABLE = (note: string): SocialResult => ({
  available: false,
  provider: "x",
  query: "",
  totalPosts: 0,
  uniqueAuthors: 0,
  suspectedBotPct: 0,
  topSpreaders: [],
  note,
});

function daysSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return undefined;
  return (Date.now() - t) / 86400000;
}

/** Heuristic inauthenticity score for an account (0-100). */
function scoreAccount(u: XUser): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const m = u.public_metrics;
  const ageDays = daysSince(u.created_at);

  if (ageDays != null && ageDays < 90) { score += 30; reasons.push(`Account created ${Math.round(ageDays)}d ago`); }
  else if (ageDays != null && ageDays < 365) { score += 12; reasons.push("Account under 1 year old"); }

  if (m) {
    if (m.followers_count < 50) { score += 15; reasons.push(`Only ${m.followers_count} followers`); }
    const ratio = m.followers_count > 0 ? m.following_count / m.followers_count : m.following_count;
    if (ratio > 5) { score += 20; reasons.push("Follows far more than follow back"); }
    if (ageDays && ageDays > 1) {
      const perDay = m.tweet_count / ageDays;
      if (perDay > 50) { score += 20; reasons.push(`~${Math.round(perDay)} posts/day (automation-like)`); }
    }
  }
  if (!u.description) { score += 5; reasons.push("Empty bio"); }
  if ((u.username.match(/\d/g) || []).length >= 4) { score += 10; reasons.push("Many digits in handle"); }
  if (u.verified) { score = Math.max(0, score - 25); reasons.push("Verified account"); }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export async function analyzeSocial(query: string): Promise<SocialResult> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return UNAVAILABLE("Social analysis needs X_BEARER_TOKEN (X API v2). Add it to enable amplification + bot analysis.");
  if (!query || query.trim().length < 2) return UNAVAILABLE("No query to search.");

  const q = encodeURIComponent(`${query} -is:retweet`);
  const url =
    `https://api.twitter.com/2/tweets/search/recent?query=${q}&max_results=100` +
    `&tweet.fields=public_metrics,created_at&expansions=author_id` +
    `&user.fields=created_at,public_metrics,verified,description`;

  const data = await getJson<XResponse>(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: 12000,
  });
  if (!data) return UNAVAILABLE("X API request failed (check token / access tier).");
  if (!data.data || data.data.length === 0) {
    return { ...UNAVAILABLE("No recent posts found mentioning this."), available: true, query };
  }

  const users = new Map<string, XUser>();
  for (const u of data.includes?.users || []) users.set(u.id, u);

  // Aggregate engagement per author within the result set.
  const engByAuthor = new Map<string, number>();
  for (const t of data.data) {
    const m = t.public_metrics;
    const eng = m ? m.like_count + m.retweet_count + m.quote_count : 0;
    engByAuthor.set(t.author_id, (engByAuthor.get(t.author_id) || 0) + eng);
  }

  const accounts: SocialAccount[] = [];
  let botCount = 0;
  for (const [id, u] of users) {
    const { score, reasons } = scoreAccount(u);
    if (score >= 50) botCount++;
    accounts.push({
      handle: u.username,
      name: u.name,
      createdAt: u.created_at,
      followers: u.public_metrics?.followers_count,
      following: u.public_metrics?.following_count,
      posts: u.public_metrics?.tweet_count,
      engagement: engByAuthor.get(id) || 0,
      botScore: score,
      reasons,
    });
  }

  const uniqueAuthors = accounts.length;
  const topSpreaders = accounts
    .sort((a, b) => (b.engagement || 0) - (a.engagement || 0))
    .slice(0, 12);

  return {
    available: true,
    provider: "x",
    query,
    totalPosts: data.meta?.result_count ?? data.data.length,
    uniqueAuthors,
    suspectedBotPct: uniqueAuthors ? Math.round((botCount / uniqueAuthors) * 100) : 0,
    topSpreaders,
    note: `Analyzed ${data.data.length} recent posts from ${uniqueAuthors} accounts.`,
  };
}
