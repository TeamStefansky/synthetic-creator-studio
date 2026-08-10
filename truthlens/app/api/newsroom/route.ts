// NEWS ROOM - a personal, English-language news front page assembled from the
// SAME sources/APIs the rest of TruthLens uses (collectMentions: the user's
// Connections feeds + every built-in news source). No new backend: it reuses the
// source layer, the translation helper, and the region tagger.
//
// Legal posture carried over from the reader spec: every item keeps its outbound
// link to the ORIGINAL article and its source attribution; only a capped extract is
// shown (never a stored/rehosted body); text is translated to English. Decision-
// support framing is unchanged.

import { NextRequest, NextResponse } from "next/server";
import { collectMentions } from "@/lib/narrative/sources";
import { aggregateMentions } from "@/lib/mentions-map";
import { matchRegion, REGIONS } from "@/lib/geopolitics";
import { translateToEnglish, translationAvailable } from "@/lib/translate";
import { cacheGet, cacheSet } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 60;
const EXTRACT_CAP = 280;
const CACHE_MS = 10 * 60_000; // situational front page refreshes on the order of minutes

interface NewsItem {
  source: string; outlet: string; url?: string; country?: string;
  lang?: string; timestamp?: string; title: string; extract?: string; region: string;
  image?: string; favicon?: string; domain?: string;
}

function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return undefined; }
}
// Hotlinked favicon (source logo) - never downloaded or re-hosted.
const faviconFor = (domain?: string) => (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : undefined);

// A Mention's text is "Title. Summary"; split into a headline + a capped extract.
function splitText(text: string): { title: string; extract?: string } {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  const m = clean.match(/^(.{20,140}?[.!?])\s+(.+)$/);
  if (m) return { title: m[1].trim(), extract: m[2].slice(0, EXTRACT_CAP).trim() };
  if (clean.length <= 140) return { title: clean };
  return { title: clean.slice(0, 140).trim() + "…", extract: clean.slice(140, 140 + EXTRACT_CAP).trim() };
}

// ---- story clustering (Google-News "Full Coverage" style) --------------------
// Group articles covering the SAME story across outlets, by distinctive shared
// title tokens (union-find). No embeddings/LLM - a lightweight topical grouping.
const STOP = new Set(
  ("the a an of in to and for on with as is are was were be by from at over after amid into out about " +
   "it its his her their new say says said will has have had not you your we our they this that those " +
   "he she who whom which what when where why how up down off more most than then them him near").split(" "),
);
const MIN_SHARED = 2; // distinctive tokens two headlines must share to be one story
function titleTokens(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter((w) => !STOP.has(w)));
}
interface Story { title: string; region: string; sourceCount: number; items: NewsItem[] }
function clusterStories(items: NewsItem[]): Story[] {
  const toks = items.map((it) => titleTokens(`${it.title} ${it.extract || ""}`.slice(0, 240)));
  const parent = items.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      let shared = 0;
      for (const t of toks[i]) if (toks[j].has(t)) shared++;
      if (shared >= MIN_SHARED) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, number[]>();
  items.forEach((_, i) => { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)!).push(i); });
  const stories = [...groups.values()].map((idxs) => {
    const members = idxs.map((i) => items[i]).sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    const rep = [...members].sort((a, b) => (b.image ? 1 : 0) - (a.image ? 1 : 0) || b.title.length - a.title.length)[0];
    return { title: rep.title, region: rep.region, sourceCount: new Set(members.map((m) => m.outlet)).size, items: members };
  });
  stories.sort((a, b) => b.items.length - a.items.length || (b.items[0].timestamp || "").localeCompare(a.items[0].timestamp || ""));
  return stories;
}

const parseList = (v: string | null) =>
  (v || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const region = (req.nextUrl.searchParams.get("region") || "all").trim();
  const keywords = parseList(req.nextUrl.searchParams.get("keywords"));
  const countries = parseList(req.nextUrl.searchParams.get("countries"));

  const day = new Date().toISOString().slice(0, 13); // hour granularity
  const ck = `newsroom:${q.toLowerCase()}:${day}`;
  let payload = await cacheGet<{ items: NewsItem[]; sources: any[] }>(ck, CACHE_MS);

  if (!payload) {
    try {
      // With a query, pull from EVERY source/API (like SIGNAL). Without one, the
      // front page is the user's own Connections feeds (source "rss").
      const results = await collectMentions(q || "");
      const agg = aggregateMentions(results, 400);
      let mentions = agg.mentions;
      if (!q) mentions = mentions.filter((m) => m.source === "rss");
      mentions = mentions
        .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
        .slice(0, LIMIT);

      // Translate EVERY headline to English (pass-through for text already English),
      // so Latin-script languages (French/Spanish/German...) that carry no lang tag
      // are covered too. Chunked; the whole payload is cached per (query, hour).
      const CHUNK = 25;
      const texts = mentions.map((m) => m.text || "");
      const chunks: string[][] = [];
      for (let i = 0; i < texts.length; i += CHUNK) chunks.push(texts.slice(i, i + CHUNK));
      const translated = (await Promise.all(chunks.map((c) => translateToEnglish(c)))).flat();
      mentions = mentions.map((m, i) => ({ ...m, text: translated[i] || m.text }));

      const items: NewsItem[] = mentions.map((m) => {
        const { title, extract } = splitText(m.text);
        const domain = hostOf(m.url);
        return {
          source: m.source, outlet: m.account || m.source, url: m.url,
          country: m.country, lang: m.lang, timestamp: m.timestamp,
          title, extract, region: matchRegion(m.text),
          image: m.image, domain, favicon: faviconFor(domain),
        };
      });
      payload = { items, sources: agg.sources };
      await cacheSet(ck, payload);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "News Room load failed" }, { status: 500 });
    }
  }

  // Post-cache filters (region / keywords / countries) so they don't multiply cache keys.
  let items = payload.items;
  if (region !== "all") items = items.filter((it) => it.region === region);
  if (keywords.length) {
    items = items.filter((it) => {
      const hay = `${it.title} ${it.extract || ""}`.toLowerCase();
      return keywords.some((k) => hay.includes(k));
    });
  }
  if (countries.length) {
    items = items.filter((it) => {
      const hay = `${it.title} ${it.extract || ""}`.toLowerCase();
      const c = (it.country || "").toLowerCase();
      return countries.some((k) => (c && c.includes(k)) || hay.includes(k));
    });
  }

  const stories = clusterStories(items);
  return NextResponse.json(
    {
      query: q || null,
      region,
      keywords,
      countries,
      regions: REGIONS.map((r) => ({ key: r.key, label: r.label })),
      count: items.length,
      storyCount: stories.length,
      stories,
      translation: { available: translationAvailable() },
      sources: payload.sources,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
