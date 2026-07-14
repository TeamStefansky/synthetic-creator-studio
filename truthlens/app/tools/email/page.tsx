"use client";

import { useState } from "react";
import {
  Loader2,
  Mailbox,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  CornerDownRight,
} from "lucide-react";
import Nav from "@/components/Nav";
import Disclaimer from "@/components/Disclaimer";
import type { EmailTrace } from "@/lib/types";

const VERDICT_STYLE: Record<
  EmailTrace["spoofingVerdict"],
  { cls: string; Icon: typeof ShieldCheck }
> = {
  "Likely authentic": { cls: "text-band-green", Icon: ShieldCheck },
  Suspicious: { cls: "text-band-yellow", Icon: ShieldQuestion },
  "Likely spoofed": { cls: "text-band-red", Icon: ShieldAlert },
  Unknown: { cls: "text-slate-400", Icon: ShieldQuestion },
};

export default function EmailTracePage() {
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EmailTrace | null>(null);

  async function trace() {
    setError(null);
    setResult(null);
    if (!raw.trim()) {
      setError("Paste the raw email source (including headers) first.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/email-trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error ?? "Trace failed.");
      else setResult(data as EmailTrace);
    } catch {
      setError("Could not reach the trace service.");
    } finally {
      setLoading(false);
    }
  }

  const verdict = result ? VERDICT_STYLE[result.spoofingVerdict] : null;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <Nav />

        <section className="mt-8">
          <h1 className="text-2xl font-bold tracking-tight">
            Email Header Tracer
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Paste the <strong className="text-slate-300">raw source</strong> of
            an email you received (in most clients: &quot;Show original&quot; /
            &quot;View source&quot;). TruthLens reconstructs the delivery path,
            infers the true origin, and checks SPF/DKIM/DMARC.
          </p>

          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={`Received: from mail.example.com ([203.0.113.9]) by mx.google.com ...\nReceived: from origin.host ([198.51.100.7]) by mail.example.com ...\nAuthentication-Results: mx.google.com; spf=pass dkim=pass dmarc=pass ...`}
            rows={9}
            className="mt-5 w-full resize-y rounded-lg border border-surface-border bg-surface p-3 font-mono text-xs text-slate-200 outline-none focus:border-blue-500"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={trace}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-70"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mailbox className="h-4 w-4" />
              )}
              Trace headers
            </button>
            {error && <span className="text-sm text-band-red">{error}</span>}
          </div>

          {result && verdict && (
            <div className="mt-8 space-y-6">
              {/* Verdict + origin */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-surface-border bg-surface-card p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Spoofing verdict
                  </div>
                  <div className={`mt-1 flex items-center gap-2 text-lg font-bold ${verdict.cls}`}>
                    <verdict.Icon className="h-6 w-6" />
                    {result.spoofingVerdict}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <AuthChip label="SPF" value={result.spf} />
                    <AuthChip label="DKIM" value={result.dkim} />
                    <AuthChip label="DMARC" value={result.dmarc} />
                  </div>
                  {result.spoofingReasons.length > 0 && (
                    <ul className="mt-2 text-xs text-slate-400">
                      {result.spoofingReasons.map((r, i) => (
                        <li key={i}>• {r}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-surface-border bg-surface-card p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Inferred true origin
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-100">
                    <MapPin className="h-5 w-5 text-blue-400" />
                    {result.originIp ?? "Unknown"}
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    {result.originCountry
                      ? `Country: ${result.originCountry}`
                      : "Country unavailable"}
                    {result.adversaryHops > 0 && (
                      <span className="ml-2 text-band-red">
                        · {result.adversaryHops} adversary-country hop(s)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Hop path */}
              <div className="rounded-xl border border-surface-border bg-surface-card p-4">
                <h3 className="mb-3 font-semibold text-slate-200">
                  Delivery path (origin first)
                </h3>
                <ol className="space-y-2">
                  {result.hops.map((h) => (
                    <li
                      key={h.index}
                      className={`flex items-start gap-2 rounded-lg border p-2 ${
                        h.info?.adversary
                          ? "border-red-500/30 bg-red-500/5"
                          : "border-surface-border/60 bg-surface/40"
                      }`}
                    >
                      <CornerDownRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      <div className="min-w-0 text-sm">
                        <div className="flex flex-wrap items-center gap-x-2 text-slate-200">
                          <span className="font-mono text-xs">
                            {h.ip ?? "no-ip"}
                          </span>
                          {h.info?.country && (
                            <span
                              className={`text-xs ${
                                h.info.adversary ? "text-band-red" : "text-slate-400"
                              }`}
                            >
                              {h.info.country}
                              {h.info.adversary ? " ⚠" : ""}
                            </span>
                          )}
                          {h.info?.asnOrg && (
                            <span className="text-xs text-slate-500">
                              {h.info.asnOrg}
                            </span>
                          )}
                        </div>
                        <div className="break-all text-xs text-slate-500">
                          {h.from ? `from ${h.from}` : ""}
                          {h.by ? ` → by ${h.by}` : ""}
                          {h.timestamp
                            ? ` · ${new Date(h.timestamp).toLocaleString()}`
                            : ""}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          <Disclaimer className="mt-10" />
        </section>
      </div>
    </main>
  );
}

function AuthChip({ label, value }: { label: string; value: string | null }) {
  const good = value === "pass";
  const bad = value && /fail|none|error/.test(value);
  const cls = good
    ? "bg-emerald-500/15 text-band-green"
    : bad
      ? "bg-red-500/15 text-band-red"
      : "bg-slate-700/40 text-slate-400";
  return (
    <span className={`rounded px-2 py-0.5 font-mono ${cls}`}>
      {label}={value ?? "—"}
    </span>
  );
}
