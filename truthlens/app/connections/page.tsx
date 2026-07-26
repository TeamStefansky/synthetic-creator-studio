"use client";

// Connections - user-managed RSS/Atom feed sources. Paste one or many feed URLs;
// each is validated server-side (SSRF-guarded) with a live preview before it is
// saved, then included as a source in narrative analysis + Brand Watch. Per-feed
// status (ok/error/empty), enable/disable, edit title, remove, re-test. When the
// KV store is not connected, feeds are kept in this browser only (honest state).

import { useCallback, useEffect, useRef, useState } from "react";
import { Rss, Plus, Trash2, RefreshCw, Loader2, Power, Pencil, ExternalLink, ShieldCheck, Upload } from "lucide-react";
import Disclaimer from "@/components/Disclaimer";
import ToolIntro from "@/components/ToolIntro";
import { parseFeedInput, extractFeedCandidates } from "@/lib/feeds/input";

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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [starter, setStarter] = useState<{ id: string; title: string; total: number; countries: { country: string; count: number }[] } | null>(null);
  const [starterCountry, setStarterCountry] = useState("");

  // Import batches are capped so one paste can't fire thousands of validation
  // fetches; anything beyond is reported, never silently dropped (CLAUDE.md rule 7).
  const IMPORT_CAP = 100;
  const IMPORT_CONCURRENCY = 5;

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

  useEffect(() => {
    fetch("/api/connections/starter-lists").then((r) => r.json())
      .then((j) => setStarter(j.lists?.[0] || null)).catch(() => setStarter(null));
  }, []);

  // Bulk-add a built-in starter list (optionally one country); each site is validated
  // via the normal discovery+add flow, so only those with a real feed are saved.
  const addStarter = async () => {
    if (!starter) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const qs = new URLSearchParams({ id: starter.id });
      if (starterCountry) qs.set("country", starterCountry);
      const j = await (await fetch(`/api/connections/starter-lists?${qs}`)).json();
      if (!j.urls?.length) { setErr("Nothing to add from that list."); setBusy(false); return; }
      await runAdd(j.urls);
    } catch (e: any) { setErr(`Could not load the list - ${e?.message || "error"}`); setBusy(false); }
  };

  // Add one URL; returns its title on success or throws with a user-safe reason.
  const addOne = async (url: string): Promise<string> => {
    const r = await fetch("/api/connections/feeds", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || "failed");
    if (j.connected === false && j.preview) {
      // No KV: store locally.
      const local = loadLocal();
      if (!local.some((f) => f.url === j.preview.url)) {
        local.push({ id: `local-${Date.now()}-${local.length}`, url: j.preview.url, title: j.preview.title, siteUrl: j.preview.siteUrl, addedAt: new Date().toISOString(), lastStatus: "ok", itemCount: j.preview.itemCount, enabled: true });
        saveLocal(local);
      }
    }
    return j.preview?.title || url;
  };

  // Validate + add many URLs with bounded concurrency and live progress. Each is
  // validated server-side (SSRF + parse) before saving; failures are collected and
  // reported, never hidden.
  const runAdd = async (rawUrls: string[]) => {
    const all = [...new Set(rawUrls)];
    if (!all.length) return;
    const urls = all.slice(0, IMPORT_CAP);
    const overflow = all.length - urls.length;
    setBusy(true); setErr(""); setMsg(""); setProgress({ done: 0, total: urls.length });
    const added: string[] = []; const failed: string[] = [];
    let idx = 0; let done = 0;
    const worker = async () => {
      for (;;) {
        const i = idx++;
        if (i >= urls.length) return;
        const url = urls[i];
        try { added.push(await addOne(url)); }
        catch (e: any) { failed.push(`${url} - ${e?.message || "network error"}`); }
        finally { done++; setProgress({ done, total: urls.length }); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, urls.length) }, worker));
    setInput("");
    const parts = [added.length ? `Added ${added.length} feed(s).` : ""];
    if (overflow > 0) parts.push(`${overflow} beyond the ${IMPORT_CAP}-per-import limit were skipped.`);
    setMsg(parts.filter(Boolean).join(" "));
    // Show only the first few failures so the message stays readable.
    setErr(failed.length ? `Could not add ${failed.length}: ${failed.slice(0, 8).join("; ")}${failed.length > 8 ? " …" : ""}` : "");
    await refresh();
    setProgress(null); setBusy(false);
  };

  const addFeeds = async () => {
    // A pasted spreadsheet selection arrives tab-separated with extra columns — pull
    // the site cells out of it; a plain list keeps parseFeedInput (comma-URL safe).
    const urls = /\t/.test(input) ? extractFeedCandidates(input) : parseFeedInput(input);
    await runAdd(urls);
  };

  const onImportFile = async (file: File) => {
    if (/\.xlsx?$/i.test(file.name) && !/\.csv$/i.test(file.name)) {
      // Real .xlsx is a binary workbook; we don't bundle a spreadsheet parser. Guide
      // the user to the two zero-dependency paths instead of failing silently.
      setErr('Excel .xlsx can’t be read directly. In Excel: "Save As → CSV", then choose the file here — or copy the column of sites and paste it into the box above.');
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    try {
      const text = await file.text();
      const urls = extractFeedCandidates(text);
      if (!urls.length) { setErr("No site/feed URLs found in that file."); }
      else await runAdd(urls);
    } catch (e: any) {
      setErr(`Could not read that file - ${e?.message || "unknown error"}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
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
          Add news sites or feeds as data sources - paste a site homepage (e.g. cnn.com) and we
          find its feed automatically, or paste a feed URL directly. Each is validated, then
          included everywhere the built-in sources are used - SIGNAL Grid, Brand Mentions,
          Brand Watch and narrative analysis - as the same shared source.
        </p>
      </div>

      {!feeds.length && (
        <ToolIntro
          heading="Bring your own sources"
          what={<>Paste a news site (e.g. <span className="text-ink">cnn.com</span>, <span className="text-ink">bbc.com</span>, <span className="text-ink">nytimes.com</span>) or a feed URL - one per line, or comma-separated. If you give a homepage we find its RSS/Atom feed automatically (major outlets are recognized directly; others via their declared feed or common feed paths); we validate it, show a quick preview, and save it. From then on its items flow into SIGNAL Grid, Brand Mentions, Brand Watch and narrative analysis like any other source - with its own connected / error / empty status.</>}
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
          placeholder={"cnn.com\nhttps://www.theguardian.com/world/rss\n\nOr paste a column of sites from Excel, or import a CSV below."}
          className="h-24 w-full rounded-xl border border-white/15 bg-bg-elev p-3 font-mono text-sm outline-none focus:border-brand scroll-thin"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={addFeeds} disabled={busy || !input.trim()} className="btn shrink-0">
            {busy && !progress ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Add feed(s)</>}
          </button>
          <input
            ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); }}
          />
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-ghost shrink-0" title="Import a CSV/TSV list of sites (e.g. 'News websites by country')">
            <Upload className="h-4 w-4" /> Import list (CSV)
          </button>
          {progress && (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-secondary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Validating {progress.done}/{progress.total}…
            </span>
          )}
          {connected === false && (
            <span className="inline-flex items-center gap-1 text-xs text-yellow-200/80">
              <ShieldCheck className="h-3.5 w-3.5" /> Store not connected - feeds are saved in this browser only until KV is configured.
            </span>
          )}
        </div>
        <p className="text-[11px] text-ink-muted">
          Bulk-add up to {IMPORT_CAP} sites: paste a column copied from Excel, or import a CSV
          (any column of site addresses works - country names and headers are ignored). Excel
          .xlsx: use File → Save As → CSV first.
        </p>
        {msg && <p className="text-sm text-risk-legit">{msg}</p>}
        {err && <p className="text-sm text-risk-high">{err}</p>}
      </div>

      {/* Starter list (built-in "News websites by country") */}
      {starter && (
        <div className="card space-y-3">
          <div>
            <div className="label-muted">Starter list</div>
            <p className="mt-1 text-sm text-ink-secondary">
              <span className="text-ink">{starter.title}</span> — {starter.total} outlets across {starter.countries.length} countries.
              Add a whole country (or all, capped at {IMPORT_CAP}); each site is validated and only those
              with a discoverable RSS/Atom feed are kept.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={starterCountry} onChange={(e) => setStarterCountry(e.target.value)} disabled={busy}
              className="rounded-xl border border-white/15 bg-bg-elev px-3 py-2 text-sm outline-none focus:border-brand"
            >
              <option value="">All countries ({starter.total})</option>
              {starter.countries.map((c) => (
                <option key={c.country} value={c.country}>{c.country} ({c.count})</option>
              ))}
            </select>
            <button onClick={addStarter} disabled={busy} className="btn shrink-0">
              {busy && progress ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Add {starterCountry || "selection"}</>}
            </button>
          </div>
          <p className="text-[11px] text-ink-muted">
            Tip: many regional outlets don’t publish RSS or block automated access — those are
            reported as failed and skipped, never faked.
          </p>
        </div>
      )}

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
