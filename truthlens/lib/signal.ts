// SIGNAL console data model - "where is my brand talked about?".
//
// This is the HONEST replacement for the uploaded dashboard's client-side LLM
// call. The original prompted a model to INVENT mentions, sentiment scores,
// "trend vectors" and "who's talking" - which violates the project rules
// (no fabrication; no API key on the client; source-not-connected must be
// visible). Instead we transform the REAL aggregate returned by /api/mentions:
//   - mentions        -> real public posts/articles (title/snippet/date/geo)
//   - byType          -> real per-source-type counts (news/social/forum/video)
//   - byCountry       -> real geographic breakdown
//   - talkers         -> real most-active ACCOUNTS/outlets (never people)
//   - timeline        -> real dated mentions
// No sentiment is fabricated. Everything here is a pure, testable function.

import type { CountryCount, MapMention, MentionSourceType } from "./mentions-map";
import type { SourceStatus } from "./narrative/types";

export const SOURCE_TYPES: MentionSourceType[] = ["news", "social", "forum", "video"];

export const TYPE_COLORS: Record<MentionSourceType, string> = {
  news: "#FFB454",
  social: "#F472B6",
  forum: "#A78BFA",
  video: "#7DD3FC",
};

export interface SignalMention extends MapMention {
  /** First sentence/line of the mention text (for the card headline). */
  title: string;
  /** Remaining text, trimmed for the card body. */
  snippet: string;
  /** YYYY-MM-DD extracted from the timestamp (empty when none). */
  date: string;
}

export interface TypeCount {
  type: MentionSourceType;
  count: number;
}
export interface Talker {
  name: string;
  source: string;
  count: number;
}
export interface TimelineEvent {
  date: string;
  event: string;
}

/** Raw shape returned by GET /api/mentions (subset used by the console). */
export interface MentionsApiResponse {
  entity: string;
  total: number;
  sources: SourceStatus[];
  mentions: MapMention[];
  byCountry: CountryCount[];
  countryUnknown: number;
  generatedAt?: string;
}

export interface SignalData {
  entity: string;
  total: number;
  sources: SourceStatus[];
  mentions: SignalMention[];
  byType: TypeCount[];
  byCountry: CountryCount[];
  countryUnknown: number;
  talkers: Talker[];
  timeline: TimelineEvent[];
  summary: string;
  generatedAt?: string;
}

/** Split a mention's text into a short headline + snippet. */
export function titleAndSnippet(text: string): { title: string; snippet: string } {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return { title: "(no text)", snippet: "" };
  // Prefer the first sentence; fall back to a ~90-char cut on a word boundary.
  const dot = clean.search(/[.!?。](\s|$)/);
  let title: string;
  if (dot > 0 && dot <= 100) {
    title = clean.slice(0, dot + 1).trim();
  } else if (clean.length <= 90) {
    title = clean;
  } else {
    const cut = clean.slice(0, 90);
    const sp = cut.lastIndexOf(" ");
    title = (sp > 40 ? cut.slice(0, sp) : cut).trim();
  }
  const snippet = clean.slice(title.length).trim().slice(0, 160);
  return { title, snippet };
}

/** YYYY-MM-DD from an ISO timestamp (empty string when unparseable). */
export function isoDate(ts?: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function toSignalMention(m: MapMention): SignalMention {
  const { title, snippet } = titleAndSnippet(m.text);
  return { ...m, title, snippet, date: isoDate(m.timestamp) };
}

/** Per-source-type counts, always in a stable order (0 counts kept so the UI
 * can render an honest empty bar rather than hiding a category). */
export function typeBreakdown(mentions: SignalMention[]): TypeCount[] {
  const counts = new Map<MentionSourceType, number>(SOURCE_TYPES.map((t) => [t, 0]));
  for (const m of mentions) counts.set(m.sourceType, (counts.get(m.sourceType) || 0) + 1);
  return SOURCE_TYPES.map((type) => ({ type, count: counts.get(type) || 0 }));
}

/** Most-active accounts/outlets by mention count. These are ACCOUNTS (handles,
 * bylines, outlet names) already surfaced per-mention - never a claim about a
 * private individual, and never "who started it". */
export function topTalkers(mentions: SignalMention[], limit = 6): Talker[] {
  const by = new Map<string, Talker>();
  for (const m of mentions) {
    const name = (m.account || "").trim();
    if (!name) continue;
    const key = `${m.source}:${name.toLowerCase()}`;
    const cur = by.get(key);
    if (cur) cur.count++;
    else by.set(key, { name, source: m.source, count: 1 });
  }
  return [...by.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

/** Dated mentions as timeline events, oldest -> newest, most-recent window. */
export function buildTimeline(mentions: SignalMention[], limit = 8): TimelineEvent[] {
  const dated = mentions.filter((m) => m.date);
  // newest first, take the window, then present oldest -> newest for the ticker
  const recent = [...dated].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
  return recent
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ date: m.date, event: m.title }));
}

function buildSummary(
  entity: string,
  total: number,
  connectedSources: number,
  countries: number,
  topType?: TypeCount,
  topCountry?: CountryCount,
): string {
  if (total === 0) {
    return `No public mentions of "${entity}" were found across ${connectedSources} connected source(s). This is a real "none observed" result, not an error.`;
  }
  const parts = [
    `${total} public mention(s) of "${entity}" across ${connectedSources} connected source(s)`,
  ];
  if (countries > 0) parts.push(`spanning ${countries} reporting countr${countries === 1 ? "y" : "ies"}`);
  let s = parts.join(", ") + ".";
  if (topType && topType.count > 0) s += ` Most appear on ${topType.type} sources`;
  if (topCountry) s += `${topType && topType.count > 0 ? "," : " Most"} led by ${topCountry.label}`;
  if (topType && topType.count > 0) s += ".";
  else if (topCountry) s += ".";
  return s;
}

/** Build the full console model from the /api/mentions response. Pure + honest:
 * every field traces to a real collected mention; unconnected sources are passed
 * through verbatim so the UI can show them; nothing is invented. */
export function buildSignal(api: MentionsApiResponse): SignalData {
  const mentions = (api.mentions || []).map(toSignalMention);
  const byType = typeBreakdown(mentions);
  const talkers = topTalkers(mentions);
  const timeline = buildTimeline(mentions);
  const connected = (api.sources || []).filter((s) => s.connected).length;
  const topType = [...byType].sort((a, b) => b.count - a.count)[0];
  const topCountry = api.byCountry?.[0];
  const summary = buildSummary(api.entity, api.total, connected, api.byCountry?.length || 0, topType, topCountry);
  return {
    entity: api.entity,
    total: api.total,
    sources: api.sources || [],
    mentions,
    byType,
    byCountry: api.byCountry || [],
    countryUnknown: api.countryUnknown || 0,
    talkers,
    timeline,
    summary,
    generatedAt: api.generatedAt,
  };
}
