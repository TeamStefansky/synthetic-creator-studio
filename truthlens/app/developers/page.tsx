"use client";

// Developer docs for the programmatic API (/api/v1). Static, honest, and shows
// the enabled state of THIS deployment (fetched from the keyless discovery
// endpoint). Copy-paste curl examples; no secrets rendered.

import { useEffect, useState } from "react";
import { Terminal, KeyRound, ShieldCheck } from "lucide-react";
import Disclaimer from "@/components/Disclaimer";

const ENDPOINTS = [
  { m: "GET", p: "/api/v1", d: "Discovery - endpoints, auth, enabled state (no key required)." },
  { m: "GET", p: "/api/v1/origin-exposure?domain=example.com", d: "Passive origin-exposure audit + documented host conduct." },
  { m: "GET", p: "/api/v1/radar?entity=some+term&horizon=7", d: "Early-warning narrative-escalation forecast." },
  { m: "GET", p: "/api/v1/host-conduct?asn=AS44925", d: "Documented, cited public-record conduct for a host/ASN/operator." },
];

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg border border-line bg-bg-sunken p-3 text-[12px] leading-relaxed text-ink-soft"><code className="font-mono">{children}</code></pre>;
}

export default function DevelopersPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/v1").then((r) => r.json()).then((j) => setEnabled(!!j?.data?.enabled)).catch(() => setEnabled(null));
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Terminal className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">Developer <span className="gradient-text">API</span></h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
          A programmatic REST API over the same engines the app uses. Every response is a decision-support
          indicator with confidence + evidence + an alternative - never a verdict, never a named private individual.
        </p>
      </div>

      <div className={`card ${enabled ? "border-risk-legit/30" : "border-risk-unknown/30"}`}>
        <div className="flex items-center gap-2 text-sm">
          <ShieldCheck className={`h-4 w-4 ${enabled ? "text-risk-legit" : "text-risk-unknown"}`} />
          {enabled == null ? "Checking API status…"
            : enabled ? "The API is enabled on this deployment."
            : "The API is not enabled here - set TRUTHLENS_API_KEYS on the deployment to turn it on."}
        </div>
      </div>

      <section className="card space-y-3">
        <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-brand-soft" /><h2 className="font-display font-bold text-ink">Authentication</h2></div>
        <p className="text-sm text-ink-secondary">Send your key in either header. Keys are configured on the deployment (env <code className="font-mono text-ink">TRUTHLENS_API_KEYS</code>, comma-separated); they are never issued or stored client-side.</p>
        <Code>{`curl -H "Authorization: Bearer $TRUTHLENS_KEY" \\
  "https://<your-deploy>/api/v1/origin-exposure?domain=example.com"`}</Code>
        <p className="text-[12px] text-ink-muted">Rate limited per key, per minute (best-effort; see the <code className="font-mono">X-RateLimit-*</code> response headers). Responses use the envelope <code className="font-mono">{`{ ok, version, data | error }`}</code>.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display font-bold text-ink">Endpoints</h2>
        {ENDPOINTS.map((e) => (
          <div key={e.p} className="card flex flex-wrap items-center gap-3">
            <span className="rounded bg-brand-soft/15 px-1.5 py-0.5 text-[11px] font-mono font-semibold text-brand-soft">{e.m}</span>
            <code className="font-mono text-[13px] text-ink">{e.p}</code>
            <span className="w-full text-[12px] text-ink-secondary sm:w-auto sm:flex-1">{e.d}</span>
          </div>
        ))}
      </section>

      <section className="card space-y-3">
        <h2 className="font-display font-bold text-ink">Example response</h2>
        <Code>{`{
  "ok": true,
  "version": "v1",
  "data": {
    "band": "Warning",
    "hazard": 0.78,
    "confidence": "Medium",
    "indicators": [ { "label": "Volume growth", "contribution": 1.02, "detail": "…" } ],
    "evidence": [ "…" ],
    "alternative": "An organic news cycle can produce the same rise…"
  }
}`}</Code>
      </section>

      <Disclaimer />
    </div>
  );
}
