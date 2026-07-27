"use client";

// NEWS ROOM — an English-language reading surface built from the SAME sources the
// rest of TruthLens uses (your Connections feeds + every built-in news source, via
// /api/newsroom). Every headline is translated to English; every card keeps its
// source attribution and a link to the ORIGINAL article (never a rehosted body).

import { useCallback, useEffect, useState } from "react";
import { Newspaper, Search, Loader2, ExternalLink, Languages, Rss } from "lucide-react";
import Link from "next/link";
import Disclaimer from "@/components/Disclaimer";

interface NewsItem {
  source: string; outlet: string; url?: string; country?: string;
  lang?: string; timestamp?: string; title: string; extract?: string; region: string;
}
interface NewsResponse {
  query: string | null; region: string; count: number;
  regions: { key: string; label: string }[];
  items: NewsItem[];
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

function SourceStrip({ it }: { it: NewsItem }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-muted">
      <span className="font-medium text-ink-secondary">{it.outlet}</span>
      {it.country && <span>· {it.country}</span>}
      {it.timestamp && <span>· {timeAgo(it.timestamp)}</span>}
      {it.lang && !it.lang.toLowerCase().startsWith("en") && (
        <span className="inline-flex items-center gap-1 rounded border border-brand/30 px-1 text-brand-soft">
          <Languages className="h-3 w-3" /> Translated from {langLabel(it.lang)}
        </span>
      )}
    </div>
  );
}

function Card({ it, lead }: { it: NewsItem; lead?: boolean }) {
  const Body = (
    <>
      <SourceStrip it={it} />
      <h3 className={`mt-1 font-display font-semibold text-ink ${lead ? "text-xl" : "text-[15px]"}`} dir="auto">
        {it.title}
      </h3>
      {it.extract && <p className="mt-1 text-sm leading-relaxed text-ink-secondary line-clamp-3" dir="auto">{it.extract}</p>}
      {it.url && (
        <span className="mt-2 inline-flex items-center gap-1 text-xs text-brand-soft">
          Read on {it.outlet} <ExternalLink className="h-3 w-3" />
        </span>
      )}
    </>
  );
  return it.url ? (
    <a href={it.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-brand/40 hover:bg-white/[0.04]">
      {Body}
    </a>
  ) : (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">{Body}</div>
  );
}

export default function NewsRoomPage() {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");
  const [data, setData] = useState<NewsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async (query: string, reg: string) => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`/api/newsroom?q=${encodeURIComponent(query)}&region=${encodeURIComponent(reg)}`, { cache: "no-store" });
      const j: NewsResponse = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "failed");
      setData(j);
    } catch (e: any) { setErr(e?.message || "Failed to load"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load("", "all"); }, [load]);

  const items = data?.items || [];
  const [lead, ...rest] = items;
  const connectedFeeds = data?.sources?.find((s) => s.source === "rss");

  return (
    <div className="animate-fade-up space-y-6" dir="ltr">
      <div>
        <div className="flex items-center gap-2">
          <Newspaper className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">News <span className="gradient-text">Room</span></h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Your news, in English — assembled from every source TruthLens is connected to (your{" "}
          <Link href="/connections" className="text-brand-soft hover:underline">Connections feeds</Link>{" "}
          and the built-in news APIs). Headlines are translated automatically; every story links to the original.
          Search to pull a topic from all sources, or browse your feeds below.
        </p>
      </div>

      {/* search + region */}
      <div className="card space-y-3">
        <form onSubmit={(e) => { e.preventDefault(); load(q, region); }} className="flex gap-2">
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
        <div className="flex flex-wrap gap-1.5">
          {[{ key: "all", label: "All regions" }, ...(data?.regions || [])].map((r) => (
            <button key={r.key} onClick={() => { setRegion(r.key); load(q, r.key); }} data-active={region === r.key}
              className="rounded-full border border-line px-3 py-1 text-xs data-[active=true]:bg-bg-elev data-[active=true]:text-white">
              {r.label}
            </button>
          ))}
        </div>
        {!q && connectedFeeds && !connectedFeeds.connected && (
          <p className="inline-flex items-center gap-1 text-xs text-yellow-200/80">
            <Rss className="h-3.5 w-3.5" /> No feeds connected yet — add news sites under{" "}
            <Link href="/connections" className="underline">Connections</Link> to fill your front page.
          </p>
        )}
      </div>

      {err && <div className="card text-sm text-risk-high">{err}</div>}
      {loading && !data && <div className="card text-sm text-ink-secondary">Loading the news room…</div>}

      {data && items.length === 0 && !loading && (
        <div className="card text-sm text-ink-secondary">
          {q ? "No stories matched that search across the connected sources." : (
            <>Your front page is empty. Add news sites under <Link href="/connections" className="text-brand-soft hover:underline">Connections</Link> and they’ll appear here, translated to English.</>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-4">
          {lead && <Card it={lead} lead />}
          <div className="grid gap-3 sm:grid-cols-2">
            {rest.map((it, i) => <Card key={`${it.url || it.title}-${i}`} it={it} />)}
          </div>
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
