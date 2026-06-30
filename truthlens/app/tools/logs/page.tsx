"use client";

import { useState } from "react";
import { ScrollText, Upload, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import type { LogAnalysisResult, CoordinationResult, IpAggregate } from "@/lib/types";
import Disclaimer from "@/components/Disclaimer";

export default function LogsPage() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<LogAnalysisResult | null>(null);
  const [coord, setCoord] = useState<CoordinationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ""));
    reader.readAsText(file);
  };

  const analyze = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const r = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log: text }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Analysis failed");
      setResult(data.analysis);
      setCoord(data.coordination);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-indigo-400" />
          <h1 className="text-2xl font-bold">Log Analyzer</h1>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          Reconstruct where traffic came from, flag bots, datacenter ASNs and
          adversary origins, and trace each visitor&rsquo;s content path. Supports
          Apache/Nginx &ldquo;combined&rdquo; logs and generic CSV.
        </p>
      </div>

      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm text-yellow-200/90 flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span><strong>Analyze only logs you own or are authorized to inspect.</strong> This tool does not and cannot fetch a stranger&rsquo;s server logs.</span>
      </div>

      <div className="card">
        <label
          className="mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-6 text-sm text-gray-400 hover:border-indigo-400/50"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
        >
          <Upload className="h-4 w-4" />
          Drag & drop a log file, or click to browse
          <input type="file" className="hidden" accept=".log,.txt,.csv,text/*" onChange={(e) => onFile(e.target.files?.[0] || undefined)} />
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Paste log lines here, e.g.&#10;1.2.3.4 - - [10/Oct/2023:13:55:36 +0000] "GET /article HTTP/1.1" 200 1234 "https://ref" "Mozilla/5.0..."'
          className="h-40 w-full rounded-xl border border-white/15 bg-bg-elev p-3 font-mono text-xs outline-none focus:border-indigo-400 scroll-thin"
        />
        <div className="mt-3 flex items-center gap-3">
          <button className="btn" onClick={analyze} disabled={loading || !text.trim()}>
            {loading ? "Analyzing…" : "Analyze log"}
          </button>
          {error && <span className="text-sm text-risk-high">{error}</span>}
        </div>
      </div>

      {result && <Results result={result} coord={coord} />}

      <Disclaimer variant="inline" />
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="card-elev">
      <div className="label-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent || ""}`}>{value}</div>
    </div>
  );
}

function Results({ result, coord }: { result: LogAnalysisResult; coord: CoordinationResult | null }) {
  const maxCountry = Math.max(1, ...result.countryBreakdown.map((c) => c.requests));
  const maxBucket = Math.max(1, ...result.timeline.map((t) => t.requests));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card label="Total requests" value={result.totalRequests} />
        <Card label="Unique IPs" value={result.uniqueIps} />
        <Card label="% datacenter" value={`${result.datacenterPct}%`} accent={result.datacenterPct > 40 ? "text-risk-high" : ""} />
        <Card label="Adversary IPs" value={result.adversaryIpCount} accent={result.adversaryIpCount > 0 ? "text-risk-high" : ""} />
        <Card label="Suspected bots" value={result.suspectedBotIpCount} accent={result.suspectedBotIpCount > 0 ? "text-risk-unknown" : ""} />
      </div>

      {result.skippedLines > 0 && (
        <p className="text-xs text-gray-500">
          Parsed {result.parsedLines} lines; skipped {result.skippedLines} malformed line(s). {result.note}
        </p>
      )}

      {coord && (
        <div className="card">
          <h2 className="mb-2 text-lg font-semibold">Coordination likelihood: <span className={coord.level === "High" ? "text-risk-high" : coord.level === "Medium" ? "text-risk-unknown" : "text-risk-legit"}>{coord.level}</span></h2>
          <ul className="space-y-1 text-sm text-gray-400">
            {coord.signals.map((s, i) => <li key={i}><span className="text-gray-200">{s.label}</span> — {s.detail}</li>)}
            {coord.signals.length === 0 && <li>No coordination signals.</li>}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 text-lg font-semibold">Origins by country</h2>
          <div className="space-y-2">
            {result.countryBreakdown.slice(0, 12).map((c) => (
              <div key={c.country}>
                <div className="mb-0.5 flex justify-between text-xs"><span>{c.country}</span><span className="text-gray-500">{c.requests}</span></div>
                <div className="h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-indigo-400" style={{ width: `${(c.requests / maxCountry) * 100}%` }} /></div>
              </div>
            ))}
            {result.countryBreakdown.length === 0 && <p className="text-sm text-gray-500">No geolocated origins.</p>}
          </div>
        </div>
        <div className="card">
          <h2 className="mb-3 text-lg font-semibold">Request timeline (hourly)</h2>
          <div className="flex h-40 items-end gap-0.5 overflow-x-auto scroll-thin">
            {result.timeline.map((t) => (
              <div key={t.bucket} title={`${t.bucket}: ${t.requests}`} className={`w-2 shrink-0 rounded-t ${t.burst ? "bg-risk-high" : "bg-indigo-400/70"}`} style={{ height: `${(t.requests / maxBucket) * 100}%` }} />
            ))}
            {result.timeline.length === 0 && <p className="text-sm text-gray-500">No timestamps to chart.</p>}
          </div>
          <p className="mt-2 text-xs text-gray-500">Red bars = synchronized bursts.</p>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 text-lg font-semibold">Top IPs</h2>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-400">
              <tr className="border-b border-white/10">
                <th className="py-2 pr-3">IP</th><th className="pr-3">Reqs</th><th className="pr-3">Country</th>
                <th className="pr-3">ASN org</th><th className="pr-3">Type</th><th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {result.topIps.map((ip) => <IpRow key={ip.ip} ip={ip} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function IpRow({ ip }: { ip: IpAggregate }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-b border-white/5 align-top">
        <td className="py-2 pr-3 font-mono text-xs">
          <button className="flex items-center gap-1" onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {ip.ip}
          </button>
        </td>
        <td className="pr-3">{ip.requests}</td>
        <td className="pr-3">{ip.enrichment.country || "—"}</td>
        <td className="pr-3 max-w-[160px] truncate">{ip.enrichment.asnOrg || "—"}</td>
        <td className="pr-3">{ip.enrichment.hostingType}</td>
        <td className="space-x-1">
          {ip.flags.map((f) => (
            <span key={f} className="inline-block rounded bg-risk-high/15 px-1.5 py-0.5 text-[10px] text-risk-high">{f}</span>
          ))}
          {ip.flags.length === 0 && <span className="text-gray-600">—</span>}
        </td>
      </tr>
      {open && (
        <tr className="bg-black/20">
          <td colSpan={6} className="px-4 py-3">
            {ip.reasons.length > 0 && (
              <ul className="mb-2 list-inside list-disc text-xs text-gray-400">
                {ip.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
            <div className="label-muted mb-1">Content path</div>
            <ol className="max-h-40 space-y-0.5 overflow-auto font-mono text-[11px] text-gray-300 scroll-thin">
              {ip.contentPath.slice(0, 50).map((p, i) => (
                <li key={i}><span className="text-gray-600">{p.timestamp?.slice(11, 19) || "—"}</span> {p.status} {p.path}</li>
              ))}
            </ol>
          </td>
        </tr>
      )}
    </>
  );
}
