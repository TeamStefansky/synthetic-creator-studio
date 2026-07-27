"use client";

// NEWS ROOM — an English news feed, Google-News "Full Coverage" style: related
// articles are clustered into STORIES, each shown as a headline plus the outlets
// covering it. Built from the SAME sources TruthLens uses (Connections feeds +
// built-in news APIs, via /api/newsroom). Headlines auto-translated; every card
// keeps its source logo/name and an outbound link to the ORIGINAL article; images
// and favicons are hotlinked, never downloaded or re-hosted.

import { useCallback, useEffect, useState } from "react";
import { Newspaper, Search, Loader2, ExternalLink, Languages, Rss, Layers } from "lucide-react";
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

// One outlet's coverage of a story — matches the Google-News source card.
function MemberCard({ it }: { it: NewsItem }) {
  const inner = (
    <div className="flex gap-3">
      <div className="min-w-0 flex-1">
        <SourceRow it={it} />
        <h4 className="mt-1 text-[15px] font-semibold leading-snug text-ink line-clamp-3 group-hover:text-brand-soft" dir="auto">{it.title}</h4>
        <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-muted">
          {it.country && <span>{it.country} · </span>}<span>{timeAgo(it.timestamp)}</span>
        </div>
      </div>
      <Thumb item={it} className="h-16 w-24 shrink-0 rounded-lg" />
    </div>
  );
  return it.url
    ? <a href={it.url} target="_blank" rel="noopener noreferrer" className="group block">{inner}</a>
    : <div>{inner}</div>;
}

function StoryBlock({ story }: { story: Story }) {
  const [open, setOpen] = useState(false);
  const multi = story.items.length > 1;
  const shown = open ? story.items : story.items.slice(0, 4);
  return (
    <section className="card">
      <h3 className="font-display text-lg font-bold leading-tight text-ink" dir="auto">{story.title}</h3>
      {multi && (
        <div className="mt-1 flex items-center gap-1 text-[11px] uppercase tracking-wide text-ink-muted">
          <Layers className="h-3 w-3" /> {story.sourceCount} source{story.sourceCount > 1 ? "s" : ""}
        </div>
      )}
      <div className="mt-3 grid gap-x-6 gap-y-4 border-t border-white/5 pt-3 sm:grid-cols-2">
        {shown.map((it, i) => <MemberCard key={`${it.url || it.title}-${i}`} it={it} />)}
      </div>
      {story.items.length > 4 && (
        <button onClick={() => setOpen((v) => !v)} className="btn-ghost mt-3 w-full justify-center text-xs">
          {open ? "Show less" : `View full coverage (${story.items.length})`}
        </button>
      )}
    </section>
  );
}

export default function NewsRoomPage() {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");
  const [keywords, setKeywords] = useState("");
  const [countries, setCountries] = useState("");
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

  useEffect(() => { load("", "all", "", ""); }, [load]);
  const apply = () => load(q, region, keywords, countries);

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

      <div className="card space-y-3">
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
            <button key={r.key} onClick={() => { setRegion(r.key); load(q, r.key, keywords, countries); }} data-active={region === r.key}
              className="rounded-full border border-line px-3 py-1 text-xs data-[active=true]:bg-bg-elev data-[active=true]:text-white">
              {r.label}
            </button>
          ))}
          {(keywords || countries) && (
            <button onClick={() => { setKeywords(""); setCountries(""); load(q, region, "", ""); }}
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
        <div className="space-y-4">
          {stories.map((s, i) => <StoryBlock key={`${s.title}-${i}`} story={s} />)}
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
