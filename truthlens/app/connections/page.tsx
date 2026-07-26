"use client";

// Connections - user-managed RSS/Atom feed sources. Paste one or many feed URLs;
// each is validated server-side (SSRF-guarded) with a live preview before it is
// saved, then included as a source in narrative analysis + Brand Watch. Per-feed
// status (ok/error/empty), enable/disable, edit title, remove, re-test. When the
// KV store is not connected, feeds are kept in this browser only (honest state).

import { useCallback, useEffect, useState } from "react";
import { Rss, Plus, Trash2, RefreshCw, Loader2, Power, Pencil, ExternalLink, ShieldCheck } from "lucide-react";
import Disclaimer from "@/components/Disclaimer";
import ToolIntro from "@/components/ToolIntro";

interface UserFeed {
  id: string; url: string; title?: string; siteUrl?: string; addedAt: string;
  lastFetchedAt?: string; lastStatus?: "ok" | "error" | "empty"; lastError?: string;
  itemCount?: number; enabled: boolean;
}
const LOCAL_KEY = "tl:connections:feeds";
const STATUS_TONE: Record<string, string> = {
  ok: "border-risk-legit/40 text-risk-legit", error: "border-risk-high/40 text-risk-high",
  empty: "border-risk-unknown/40 text-risk-unknown",
};

function loadLocal(): UserFeed[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { return []; }
}
function saveLocal(feeds: UserFeed[]) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(feeds)); } catch { /* ignore */ } }

export default function ConnectionsPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [feeds, setFeeds] = useState<UserFeed[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/connections/feeds", { cache: "no-store" });
      const j = await r.json();
      setConnected(!!j.connected);
      if (j.connected) setFeeds(j.feeds || []);
      else setFeeds(loadLocal());
    } catch { setConnected(false); setFeeds(loadLocal()); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addFeeds = async () => {
    const urls = [...new Set(input.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean))];
    if (!urls.length) return;
    setBusy(true); setErr(""); setMsg("");
    const added: string[] = []; const failed: string[] = [];
    for (const url of urls) {
      try {
        const r = await fetch("/api/connections/feeds", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
        });
        const j = await r.json();
        if (!r.ok || j.error) { failed.push(`${url} - ${j.error || "failed"}`); continue; }
        added.push(j.preview?.title || url);
        if (j.connected === false && j.preview) {
          // No KV: store locally.
          const local = loadLocal();
          if (!local.some((f) => f.url === j.preview.url)) {
            local.push({ id: `local-${Date.now()}-${local.length}`, url: j.preview.url, title: j.preview.title, siteUrl: j.preview.siteUrl, addedAt: new Date().toISOString(), lastStatus: "ok", itemCount: j.preview.itemCount, enabled: true });
            saveLocal(local);
          }
        }
      } catch (e: any) { failed.push(`${url} - ${e?.message || "network error"}`); }
    }
    setInput("");
    setMsg(added.length ? `Added ${added.length} feed(s).` : "");
    setErr(failed.length ? `Could not add: ${failed.join("; ")}` : "");
    await refresh();
    setBusy(false);
  };

  const patch = async (id: string, body: any) => {
    if (connected) { await fetch("/api/connections/feeds", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) }); await refresh(); }
    else { const local = loadLocal().map((f) => (f.id === id ? { ...f, ...body } : f)); saveLocal(local); setFeeds(local); }
  };
  const remove = async (id: string) => {
    if (connected) { await fetch("/api/connections/feeds", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); await refresh(); }
    else { const local = loadLocal().filter((f) => f.id !== id); saveLocal(local); setFeeds(local); }
  };
  const retest = async (url: string) => {
    setBusy(true);
    try { await fetch("/api/connections/feeds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }); await refresh(); } finally { setBusy(false); }
  };

  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Rss className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">Connections</h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Add your own RSS / Atom feeds as data sources. Each is validated on add and then
          included in narrative analysis and Brand Watch alongside the built-in sources.
        </p>
      </div>

      {!feeds.length && (
        <ToolIntro
          heading="Bring your own sources"
          what={<>Paste an RSS or Atom feed URL (one per line, or comma-separated). We validate it, show a quick preview, and save it. From then on its items flow into narrative monitoring like any other source - with its own connected / error / empty status.</>}
          legend={[
            { label: "Validated on add", tone: "legit", text: "a feed that doesn't parse is rejected and never saved." },
            { label: "SSRF-guarded", tone: "neutral", text: "internal / private addresses are blocked; only public http(s) feeds." },
            { label: "Per-feed status", tone: "unknown", text: "each feed shows ok / error / empty independently." },
          ]}
          note="Feeds you add feed the analysis - they are read-only inputs, never acted upon."
        />
      )}

      {/* Add box */}
      <div className="card space-y-3">
        <textarea
          value={input} onChange={(e) => { setInput(e.target.value); setErr(""); }}
          placeholder={"https://example.com/feed.xml\nhttps://another.site/atom.xml"}
          className="h-24 w-full rounded-xl border border-white/15 bg-bg-elev p-3 font-mono text-sm outline-none focus:border-brand scroll-thin"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={addFeeds} disabled={busy || !input.trim()} className="btn shrink-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Add feed(s)</>}
          </button>
          {connected === false && (
            <span className="inline-flex items-center gap-1 text-xs text-yellow-200/80">
              <ShieldCheck className="h-3.5 w-3.5" /> Store not connected - feeds are saved in this browser only until KV is configured.
            </span>
          )}
        </div>
        {msg && <p className="text-sm text-risk-legit">{msg}</p>}
        {err && <p className="text-sm text-risk-high">{err}</p>}
      </div>

      {/* Feed list */}
      {feeds.length > 0 && (
        <div className="card">
          <div className="label-muted mb-3">Your feeds ({feeds.length})</div>
          <ul className="space-y-2">
            {feeds.map((f) => (
              <li key={f.id} className={`rounded-lg border ${f.enabled ? "border-white/10" : "border-white/5 opacity-60"} bg-white/[0.02] p-3`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded border px-1.5 py-0.5 text-[11px] uppercase tracking-wide ${STATUS_TONE[f.lastStatus || "empty"] || "border-white/15 text-ink-secondary"}`}>
                    {f.lastStatus || "new"}
                  </span>
                  <span className="min-w-0 truncate text-sm font-medium text-ink">{f.title || f.url}</span>
                  {f.itemCount != null && <span className="text-[11px] text-ink-muted">{f.itemCount} item(s)</span>}
                  <div className="ml-auto flex items-center gap-1">
                    <button title="Enable / disable" onClick={() => patch(f.id, { enabled: !f.enabled })} className="rounded-lg p-1.5 text-ink-secondary transition hover:bg-white/[0.06] hover:text-white"><Power className="h-4 w-4" /></button>
                    <button title="Rename" onClick={() => { const t = prompt("Feed title", f.title || ""); if (t != null) patch(f.id, { title: t }); }} className="rounded-lg p-1.5 text-ink-secondary transition hover:bg-white/[0.06] hover:text-white"><Pencil className="h-4 w-4" /></button>
                    <button title="Re-test now" onClick={() => retest(f.url)} className="rounded-lg p-1.5 text-ink-secondary transition hover:bg-white/[0.06] hover:text-white"><RefreshCw className="h-4 w-4" /></button>
                    <button title="Remove" onClick={() => remove(f.id)} className="rounded-lg p-1.5 text-ink-secondary transition hover:bg-white/[0.06] hover:text-risk-high"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-brand-soft">{f.url} <ExternalLink className="h-3 w-3" /></a>
                  {f.lastFetchedAt && <span>· last checked {new Date(f.lastFetchedAt).toLocaleString()}</span>}
                  {f.lastStatus === "error" && f.lastError && <span className="text-risk-high">· {f.lastError}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
