"use client";

import { useState, useCallback } from "react";
import {
  Upload,
  Loader2,
  ShieldAlert,
  Server,
  Bot,
  Globe2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Nav from "@/components/Nav";
import Disclaimer from "@/components/Disclaimer";
import type { LogAnalysis, LogIpRow } from "@/lib/types";

type SortKey = "requests" | "country" | "flags";

export default function LogsPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LogAnalysis | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("requests");
  const [expanded, setExpanded] = useState<string | null>(null);

  const onFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  }, []);

  async function analyze() {
    setError(null);
    setResult(null);
    if (!text.trim()) {
      setError("Paste a log or drop a log file first.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log: text }),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error ?? "Analysis failed.");
      else setResult(data as LogAnalysis);
    } catch {
      setError("Could not reach the analysis service.");
    } finally {
      setLoading(false);
    }
  }

  const rows = result ? sortRows(result.rows, sortKey) : [];

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <Nav />

        <section className="mt-8">
          <h1 className="text-2xl font-bold tracking-tight">Log Analyzer</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Apache/Nginx combined logs or generic CSV. Analyze{" "}
            <strong className="text-slate-300">
              only logs you own or are authorized to inspect.
            </strong>
          </p>

          {/* Input */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) onFile(f);
            }}
            className={`mt-5 rounded-2xl border-2 border-dashed p-4 transition ${
              dragOver
                ? "border-blue-500 bg-blue-500/5"
                : "border-surface-border bg-surface-card/40"
            }`}
          >
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-700/60 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-700">
                <Upload className="h-4 w-4" />
                Choose file
                <input
                  type="file"
                  accept=".log,.txt,.csv,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                  }}
                />
              </label>
              <span className="text-xs text-slate-500">
                …or drag &amp; drop a file, or paste below
              </span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`203.0.113.5 - - [10/Oct/2023:13:55:36 -0700] "GET /article HTTP/1.1" 200 2326 "-" "Mozilla/5.0 ..."`}
              rows={7}
              className="w-full resize-y rounded-lg border border-surface-border bg-surface p-3 font-mono text-xs text-slate-200 outline-none focus:border-blue-500"
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={analyze}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-70"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Server className="h-4 w-4" />
                )}
                Analyze log
              </button>
              {error && <span className="text-sm text-band-red">{error}</span>}
            </div>
          </div>

          {result && (
            <div className="mt-8 space-y-6">
              {!result.enrichmentAvailable && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  IP geolocation/ASN enrichment was unavailable (offline or rate
                  limited). Parsing, bot-signature and burst detection still ran;
                  country/datacenter flags may be incomplete.
                </div>
              )}

              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Stat label="Requests" value={result.parsedRequests.toLocaleString()} sub={`${result.malformedLines} malformed`} />
                <Stat label="Unique IPs" value={result.uniqueIps.toLocaleString()} />
                <Stat label="Datacenter %" value={`${result.datacenterPct}%`} tone={result.datacenterPct > 50 ? "bad" : "neutral"} icon={<Server className="h-4 w-4" />} />
                <Stat label="Adversary IPs" value={result.adversaryIpCount} tone={result.adversaryIpCount > 0 ? "bad" : "good"} icon={<ShieldAlert className="h-4 w-4" />} />
                <Stat label="Suspected bots" value={result.suspectedBotIpCount} tone={result.suspectedBotIpCount > 0 ? "bad" : "good"} icon={<Bot className="h-4 w-4" />} />
              </div>

              {/* Country breakdown + timeline */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card title="Origin countries" icon={<Globe2 className="h-5 w-5 text-emerald-400" />}>
                  <BarList
                    items={result.countryBreakdown.slice(0, 10).map((c) => ({
                      label: c.country,
                      value: c.requests,
                    }))}
                  />
                </Card>
                <Card title="Request volume timeline" icon={<Server className="h-5 w-5 text-blue-400" />}>
                  <Timeline data={result.timeline} />
                </Card>
              </div>

              {/* Top IPs table */}
              <Card title="Top source IPs" icon={<Server className="h-5 w-5 text-blue-400" />}>
                <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
                  Sort by:
                  {(["requests", "country", "flags"] as SortKey[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setSortKey(k)}
                      className={`rounded px-2 py-0.5 capitalize ${
                        sortKey === k
                          ? "bg-blue-600 text-white"
                          : "bg-slate-700/50 text-slate-300"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500">
                      <tr className="border-b border-surface-border">
                        <th className="py-2 pr-3"></th>
                        <th className="py-2 pr-3">IP</th>
                        <th className="py-2 pr-3">Reqs</th>
                        <th className="py-2 pr-3">Country</th>
                        <th className="py-2 pr-3">ASN / Org</th>
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2 pr-3">Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <IpRow
                          key={r.ip}
                          row={r}
                          open={expanded === r.ip}
                          onToggle={() =>
                            setExpanded(expanded === r.ip ? null : r.ip)
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {result.botUserAgents.length > 0 && (
                <Card title="Bot-farm User-Agent signatures" icon={<Bot className="h-5 w-5 text-amber-400" />}>
                  <ul className="space-y-1 text-sm">
                    {result.botUserAgents.map((b) => (
                      <li key={b.userAgent} className="flex items-start gap-2">
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-xs text-amber-300">
                          {b.ipCount} IPs
                        </span>
                        <span className="break-all font-mono text-xs text-slate-400">
                          {b.userAgent}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )}

          <Disclaimer className="mt-10" />
        </section>
      </div>
    </main>
  );
}

function sortRows(rows: LogIpRow[], key: SortKey): LogIpRow[] {
  const copy = [...rows];
  if (key === "requests") copy.sort((a, b) => b.requests - a.requests);
  if (key === "country")
    copy.sort((a, b) => (a.info.country ?? "").localeCompare(b.info.country ?? ""));
  if (key === "flags") copy.sort((a, b) => b.flags.length - a.flags.length);
  return copy;
}

function IpRow({
  row,
  open,
  onToggle,
}: {
  row: LogIpRow;
  open: boolean;
  onToggle: () => void;
}) {
  const flagged = row.flags.length > 0;
  return (
    <>
      <tr
        className={`border-b border-surface-border/50 ${
          flagged ? "bg-red-500/5" : ""
        }`}
      >
        <td className="py-2 pr-2">
          <button onClick={onToggle} aria-label="Toggle content path">
            {open ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-500" />
            )}
          </button>
        </td>
        <td className="py-2 pr-3 font-mono text-xs text-slate-200">{row.ip}</td>
        <td className="py-2 pr-3">{row.requests}</td>
        <td className="py-2 pr-3">
          {row.info.adversary ? (
            <span className="text-band-red">{row.info.country} ⚠</span>
          ) : (
            row.info.country ?? <span className="text-slate-600">—</span>
          )}
        </td>
        <td className="py-2 pr-3 text-xs text-slate-400">
          {row.info.asn ? `${row.info.asn} · ` : ""}
          {row.info.asnOrg ?? "—"}
        </td>
        <td className="py-2 pr-3 text-xs">
          {row.info.isCdn ? (
            <span className="text-purple-300">CDN</span>
          ) : row.info.isDatacenter ? (
            <span className="text-amber-300">Datacenter</span>
          ) : row.info.enriched ? (
            <span className="text-emerald-300">Residential</span>
          ) : (
            <span className="text-slate-600">—</span>
          )}
        </td>
        <td className="py-2 pr-3">
          {flagged ? (
            <span className="text-xs text-band-red">{row.flags.length} flag(s)</span>
          ) : (
            <span className="text-xs text-slate-600">clean</span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-surface-border/50 bg-surface/40">
          <td colSpan={7} className="px-4 py-3">
            {row.flags.length > 0 && (
              <ul className="mb-3 space-y-1">
                {row.flags.map((f, i) => (
                  <li key={i} className="text-xs text-band-red">
                    • {f}
                  </li>
                ))}
              </ul>
            )}
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Content path ({row.contentPath.length})
            </div>
            <ol className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-xs text-slate-400">
              {row.contentPath.map((p, i) => (
                <li key={i} className="flex gap-2 font-mono">
                  <span className="text-slate-600">
                    {p.at ? new Date(p.at).toLocaleTimeString() : "--:--"}
                  </span>
                  <span className="break-all">{p.path}</span>
                </li>
              ))}
            </ol>
          </td>
        </tr>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "good" | "bad" | "neutral";
  icon?: React.ReactNode;
}) {
  const toneCls =
    tone === "bad"
      ? "text-band-red"
      : tone === "good"
        ? "text-band-green"
        : "text-slate-100";
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold ${toneCls}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-600">{sub}</div>}
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="font-semibold text-slate-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function BarList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0)
    return <p className="text-sm text-slate-500">No data.</p>;
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2 text-xs">
          <span className="w-20 shrink-0 truncate text-slate-400">{it.label}</span>
          <div className="h-3 flex-1 overflow-hidden rounded bg-slate-700/40">
            <div
              className="h-full rounded bg-blue-500/70"
              style={{ width: `${(it.value / max) * 100}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right font-mono text-slate-400">
            {it.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function Timeline({
  data,
}: {
  data: { bucket: string; requests: number; burst: boolean }[];
}) {
  if (data.length === 0)
    return <p className="text-sm text-slate-500">No timestamped requests.</p>;
  const max = Math.max(1, ...data.map((d) => d.requests));
  return (
    <div className="flex h-32 items-end gap-0.5 overflow-x-auto">
      {data.map((d) => (
        <div
          key={d.bucket}
          title={`${d.bucket} — ${d.requests} req${d.burst ? " (burst)" : ""}`}
          className={`w-2 shrink-0 rounded-t ${
            d.burst ? "bg-band-red" : "bg-blue-500/60"
          }`}
          style={{ height: `${Math.max(4, (d.requests / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
