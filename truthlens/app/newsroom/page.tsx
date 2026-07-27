"use client";

// NEWS ROOM — an English news feed, Google-News "Full Coverage" style: related
// articles are clustered into STORIES, each shown as a headline plus the outlets
// covering it. Built from the SAME sources TruthLens uses (Connections feeds +
// built-in news APIs, via /api/newsroom). Headlines auto-translated; every card
// keeps its source logo/name and an outbound link to the ORIGINAL article; images
// and favicons are hotlinked, never downloaded or re-hosted.

import { useCallback, useEffect, useState } from "react";
import { Newspaper, Search, Loader2, Languages, Rss, Star, Check, Plus } from "lucide-react";
import Link from "next/link";
import Disclaimer from "@/components/Disclaimer";

interface NewsItem {
  source: string; outlet: string; url?: string; country?: string;
  lang?: string; timestamp?: string; title: string; extract?: string; region: string;
  image?: string; favicon?: string; domain?: string;
}
interface Story { title: string; region: string; sourceCount: number; items: NewsItem[] }
interface NewsResponse {
  query: string | null; region: string; count: number; storyCount: number;
  regions: { key: string; label: string }[];
  stories: Story[];
  translation?: { available: boolean };
  sources: { source: string; connected: boolean; count?: number; reason?: string }[];
  error?: string;
}

const LANG_NAME: Record<string, string> = {
  he: "Hebrew", ar: "Arabic", ru: "Russian", fr: "French", es: "Spanish", de: "German",
  fa: "Persian", tr: "Turkish", zh: "Chinese", uk: "Ukrainian", pt: "Portuguese", it: "Italian",
};
const langLabel = (l?: string) => (l ? LANG_NAME[l.slice(0, 2).toLowerCase()] || l.toUpperCase() : "");
const timeAgo = (ts?: string) => {
  if (!ts) return "";
  const d = new Date(ts).getTime();
  if (isNaN(d)) return "";
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

function Thumb({ item, className }: { item: NewsItem; className: string }) {
  const [failed, setFailed] = useState(false);
  if (item.image && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`${className} object-cover`} />;
  }
  return (
    <div className={`${className} grid place-items-center bg-gradient-to-br from-white/[0.06] to-white/[0.01]`}>
      {item.favicon
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={item.favicon} alt="" referrerPolicy="no-referrer" className="h-6 w-6 opacity-60" />
        : <Newspaper className="h-6 w-6 text-ink-muted" />}
    </div>
  );
}

function SourceRow({ it }: { it: NewsItem }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-ink-secondary">
      {it.favicon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={it.favicon} alt="" referrerPolicy="no-referrer" className="h-4 w-4 rounded-sm" />
      )}
      <span className="font-medium">{it.outlet}</span>
      {it.lang && !it.lang.toLowerCase().startsWith("en") && (
        <span className="inline-flex items-center gap-0.5 rounded border border-brand/30 px-1 text-[10px] text-brand-soft">
          <Languages className="h-2.5 w-2.5" /> {langLabel(it.lang)}→EN
        </span>
      )}
    </div>
  );
}

// Small "also covered by" links under a story (the other outlets in the cluster).
function CoverageLinks({ story, primary, max }: { story: Story; primary: NewsItem; max: number }) {
  const others = story.items.filter((m) => m !== primary).slice(0, max);
  if (!others.length) return null;
  return (
    <ul className="mt-2 space-y-1 border-l-2 border-white/10 pl-3">
      {others.map((o, i) => (
        <li key={`${o.url || o.title}-${i}`}>
          <a href={o.url || "#"} target="_blank" rel="noopener noreferrer"
            className="group flex items-start gap-1.5 text-xs text-ink-secondary hover:text-brand-soft">
            {o.favicon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={o.favicon} alt="" referrerPolicy="no-referrer" className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm" />
            )}
            <span className="line-clamp-2" dir="auto"><span className="text-ink-muted">{o.outlet}:</span> {o.title}</span>
          </a>
        </li>
      ))}
      <li className="pt-0.5 text-[10px] uppercase tracking-wide text-ink-muted">{story.sourceCount} sources</li>
    </ul>
  );
}

// A story as an image-forward news card (image on top, then headline) — news-site
// hierarchy. `lead` renders the large hero treatment.
function StoryCard({ story, lead }: { story: Story; lead?: boolean }) {
  const primary = story.items.find((m) => m.title === story.title) || story.items[0];
  const hero = story.items.find((m) => m.image) || primary;
  const card = (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] transition group-hover:border-brand/40">
      <Thumb item={hero} className="aspect-[16/9] w-full" />
      <div className="p-3 sm:p-4">
        <SourceRow it={primary} />
        <h3 className={`mt-1.5 font-display font-bold leading-tight text-ink group-hover:text-brand-soft ${lead ? "text-2xl sm:text-3xl" : "text-lg"}`} dir="auto">
          {story.title}
        </h3>
        {lead && primary.extract && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-secondary line-clamp-2" dir="auto">{primary.extract}</p>}
        <div className="mt-2 text-[11px] text-ink-muted">{timeAgo(primary.timestamp)}{primary.country ? ` · ${primary.country}` : ""}</div>
      </div>
    </div>
  );
  return (
    <section>
      {primary.url
        ? <a href={primary.url} target="_blank" rel="noopener noreferrer" className="group block">{card}</a>
        : <div className="group">{card}</div>}
      <CoverageLinks story={story} primary={primary} max={lead ? 4 : 2} />
    </section>
  );
}

// Interest topics — pick some to personalize the feed (MSN-style). Each maps to a
// keyword bundle; the feed then shows stories matching ANY selected topic.
const TOPICS: { key: string; label: string; kw: string[] }[] = [
  { key: "israel_me", label: "Israel & Middle East", kw: ["israel", "gaza", "hamas", "hezbollah", "iran", "idf", "netanyahu", "west bank", "lebanon", "syria", "palestinian"] },
  { key: "world", label: "World", kw: ["ukraine", "russia", "china", "europe", "united nations", "summit", "war", "election"] },
  { key: "politics", label: "Politics", kw: ["election", "parliament", "president", "prime minister", "government", "policy", "vote", "congress"] },
  { key: "security", label: "Security & Defense", kw: ["military", "attack", "missile", "drone", "terror", "defense", "strike", "weapons", "nato"] },
  { key: "business", label: "Business & Economy", kw: ["economy", "market", "stocks", "inflation", "trade", "oil", "central bank", "gdp", "shekel"] },
  { key: "tech", label: "Technology", kw: ["ai", "artificial intelligence", "technology", "startup", "cyber", "software", "chip", "google", "apple", "microsoft"] },
  { key: "health", label: "Health", kw: ["health", "covid", "vaccine", "hospital", "disease", "medical", "virus", "outbreak"] },
  { key: "science", label: "Science", kw: ["science", "space", "climate", "research", "study", "nasa", "physics"] },
  { key: "sports", label: "Sports", kw: ["football", "soccer", "nba", "olympics", "match", "championship", "fifa", "tennis"] },
];
const topicKw = (keys: string[]) => [...new Set(keys.flatMap((k) => TOPICS.find((t) => t.key === k)?.kw || []))];
// Combine manual keywords + selected-interest keywords into the API's keywords param.
const combineKw = (manual: string, ints: string[]) =>
  [...new Set([...(manual ? manual.split(",").map((s) => s.trim()).filter(Boolean) : []), ...topicKw(ints)])].join(",");

export default function NewsRoomPage() {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");
  const [keywords, setKeywords] = useState("");
  const [countries, setCountries] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [data, setData] = useState<NewsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async (query: string, reg: string, kw: string, cn: string) => {
    setLoading(true); setErr("");
    try {
      const params = new URLSearchParams({ q: query, region: reg });
      if (kw.trim()) params.set("keywords", kw.trim());
      if (cn.trim()) params.set("countries", cn.trim());
      const r = await fetch(`/api/newsroom?${params}`, { cache: "no-store" });
      const j: NewsResponse = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "failed");
      setData(j);
    } catch (e: any) { setErr(e?.message || "Failed to load"); }
    finally { setLoading(false); }
  }, []);

  // Interests + filters persist across reloads until the user changes them.
  useEffect(() => {
    let s: any = {};
    try { s = JSON.parse(localStorage.getItem("tl:newsroom:filters") || "{}"); } catch { /* ignore */ }
    const q0 = s.q || "", r0 = s.region || "all", k0 = s.keywords || "", c0 = s.countries || "";
    const i0: string[] = Array.isArray(s.interests) ? s.interests : [];
    setQ(q0); setRegion(r0); setKeywords(k0); setCountries(c0); setInterests(i0);
    load(q0, r0, combineKw(k0, i0), c0);
  }, [load]);
  const persist = (query: string, reg: string, kw: string, cn: string, ints: string[]) => {
    try { localStorage.setItem("tl:newsroom:filters", JSON.stringify({ q: query, region: reg, keywords: kw, countries: cn, interests: ints })); } catch { /* ignore */ }
  };
  const apply = () => { persist(q, region, keywords, countries, interests); load(q, region, combineKw(keywords, interests), countries); };
  const pickRegion = (r: string) => { setRegion(r); persist(q, r, keywords, countries, interests); load(q, r, combineKw(keywords, interests), countries); };
  const clearFilters = () => { setKeywords(""); setCountries(""); persist(q, region, "", "", interests); load(q, region, combineKw("", interests), countries); };
  const toggleInterest = (key: string) => {
    const next = interests.includes(key) ? interests.filter((k) => k !== key) : [...interests, key];
    setInterests(next); persist(q, region, keywords, countries, next); load(q, region, combineKw(keywords, next), countries);
  };

  const stories = data?.stories || [];
  const connectedFeeds = data?.sources?.find((s) => s.source === "rss");

  return (
    <div className="animate-fade-up space-y-5" dir="ltr">
      <div>
        <div className="flex items-center gap-2">
          <Newspaper className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">News <span className="gradient-text">Room</span></h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Your news, in English — from every source TruthLens is connected to (your{" "}
          <Link href="/connections" className="text-brand-soft hover:underline">Connections feeds</Link>{" "}
          + built-in news APIs). Related articles are grouped into stories; every card links to the original.
        </p>
      </div>

      {/* Interests personalizer (MSN-style "customize your feed") */}
      <div className="card">
        <div className="mb-2 flex items-center gap-2">
          <Star className="h-4 w-4 text-brand-soft" />
          <span className="text-sm font-semibold text-ink">Your interests</span>
          <span className="text-[11px] text-ink-muted">— pick topics to personalize your feed{interests.length ? ` · ${interests.length} selected` : " (showing everything)"}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TOPICS.map((t) => {
            const on = interests.includes(t.key);
            return (
              <button key={t.key} onClick={() => toggleInterest(t.key)} data-active={on}
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition data-[active=true]:border-brand data-[active=true]:bg-brand/15 data-[active=true]:text-white border-line text-ink-secondary hover:text-white">
                {on ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />} {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card space-y-3 sticky top-0 z-30 shadow-lg shadow-black/20">
        <form onSubmit={(e) => { e.preventDefault(); apply(); }} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} dir="auto"
              placeholder="Search a topic across all sources — e.g. Gaza ceasefire, elections, sanctions"
              className="w-full rounded-xl border border-white/15 bg-bg-elev py-2 pl-9 pr-3 text-sm outline-none focus:border-brand"
            />
          </div>
          <button type="submit" disabled={loading} className="btn shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </button>
        </form>
        {/* keyword + country filters */}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Keywords</span>
            <input value={keywords} onChange={(e) => setKeywords(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
              placeholder="comma-separated — e.g. sanctions, ceasefire, election"
              className="w-full rounded-xl border border-white/15 bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Countries</span>
            <input value={countries} onChange={(e) => setCountries(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
              placeholder="comma-separated — e.g. Israel, Ukraine, Iran"
              className="w-full rounded-xl border border-white/15 bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[{ key: "all", label: "All regions" }, ...(data?.regions || [])].map((r) => (
            <button key={r.key} onClick={() => pickRegion(r.key)} data-active={region === r.key}
              className="rounded-full border border-line px-3 py-1 text-xs data-[active=true]:bg-bg-elev data-[active=true]:text-white">
              {r.label}
            </button>
          ))}
          {(keywords || countries) && (
            <button onClick={clearFilters}
              className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted hover:text-white">
              Clear filters
            </button>
          )}
        </div>
        {data?.translation && !data.translation.available && (
          <p className="inline-flex items-center gap-1 text-xs text-yellow-200/80">
            <Languages className="h-3.5 w-3.5" /> Translation is off (ANTHROPIC_API_KEY not configured) — headlines show in their original language.
          </p>
        )}
        {!q && connectedFeeds && !connectedFeeds.connected && (
          <p className="inline-flex items-center gap-1 text-xs text-yellow-200/80">
            <Rss className="h-3.5 w-3.5" /> No feeds connected yet — add news sites under{" "}
            <Link href="/connections" className="underline">Connections</Link> to fill your front page.
          </p>
        )}
      </div>

      {err && <div className="card text-sm text-risk-high">{err}</div>}
      {loading && !data && <div className="card text-sm text-ink-secondary">Loading the news room…</div>}

      {data && stories.length === 0 && !loading && (
        <div className="card text-sm text-ink-secondary">
          {q ? "No stories matched that search across the connected sources." : (
            <>Your front page is empty. Add news sites under <Link href="/connections" className="text-brand-soft hover:underline">Connections</Link> and they’ll appear here, translated to English.</>
          )}
        </div>
      )}

      {stories.length > 0 && (
        <div className="space-y-6">
          <StoryCard story={stories[0]} lead />
          {stories.length > 1 && (
            <div className="grid gap-x-5 gap-y-6 border-t border-white/5 pt-5 sm:grid-cols-2 lg:grid-cols-3">
              {stories.slice(1).map((s, i) => <StoryCard key={`${s.title}-${i}`} story={s} />)}
            </div>
          )}
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
