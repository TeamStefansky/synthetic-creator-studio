"use client";

import { useState } from "react";
import { ShieldAlert, ShieldCheck, Server, HelpCircle, ArrowRight } from "lucide-react";
import type { OriginExposureReport, OriginExposureBand } from "@/lib/origin-exposure";
import Disclaimer from "@/components/Disclaimer";
import ToolIntro from "@/components/ToolIntro";

const BAND_UI: Record<OriginExposureBand, { label: string; cls: string; Icon: any }> = {
  possible_exposure: { label: "Possible origin exposure", cls: "text-risk-high", Icon: ShieldAlert },
  no_exposure_observed: { label: "No exposure observed", cls: "text-risk-legit", Icon: ShieldCheck },
  not_cdn_fronted: { label: "Not CDN-fronted", cls: "text-risk-unknown", Icon: Server },
  insufficient_data: { label: "Insufficient data", cls: "text-ink-secondary", Icon: HelpCircle },
};

export default function OriginExposurePage() {
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<OriginExposureReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const audit = async (value?: string) => {
    const d = value ?? domain;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const r = await fetch("/api/origin-exposure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: d }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Audit failed");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const band = result ? BAND_UI[result.band] : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Server className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">Origin <span className="gradient-text">Exposure</span></h1>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          For a domain you are authorized to inspect, check whether the real server may be
          leaking past its CDN. We read only public, passive records (Certificate Transparency
          and current DNS) and never probe or connect to the origin. Hardening guidance, not a verdict.
        </p>
      </div>

      <div className="card">
        <form
          onSubmit={(e) => { e.preventDefault(); if (domain.trim()) audit(); }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="A domain you own, e.g. example.com"
            className="w-full rounded-xl border border-white/15 bg-bg-elev px-4 py-3 text-base outline-none transition focus:border-brand"
          />
          <button type="submit" className="btn shrink-0" disabled={loading || !domain.trim()}>
            {loading ? "Auditing…" : <>Run audit <ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-risk-high">{error}</p>}
        <p className="mt-2 text-xs text-ink-secondary">
          Only run this on assets you own or are authorized to test. This is a defensive posture
          check; results are cached per day for reproducibility.
        </p>
      </div>

      {!result && !loading && (
        <ToolIntro
          heading="What is origin exposure?"
          what={<>Sites behind a CDN like <span className="text-ink">Cloudflare</span> hide their real server IP so attacks hit the CDN, not the origin. But the true IP can leak through an old <span className="text-ink">subdomain</span>, a mail host, or a certificate logged in public <span className="text-ink">Certificate Transparency</span>. This audit reads only those public records and flags any address that resolves <span className="text-ink">outside</span> the CDN ranges, so you can lock it down.</>}
          examplesLabel="Try it"
          examples={[{ label: "Audit example.com", onClick: () => { setDomain("example.com"); audit("example.com"); } }]}
          legend={[
            { label: "Possible exposure", tone: "high", text: "a record resolves to a non-CDN IP - a lead to verify, not proof of the origin." },
            { label: "No exposure observed", tone: "legit", text: "every checked record stays inside the CDN ranges." },
            { label: "Not CDN-fronted", tone: "neutral", text: "the site is not behind this CDN; its serving IP is public by design." },
          ]}
          note="Reads public Certificate Transparency + DNS only. A non-CDN IP is frequently a third-party host, not the live origin - confirm ownership before acting."
        />
      )}

      {result && band && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <band.Icon className={`h-6 w-6 ${band.cls}`} />
                <div>
                  <div className={`text-lg font-bold ${band.cls}`}>{band.label}</div>
                  <div className="text-xs text-ink-secondary">
                    {result.domain} · CDN: {result.cdn} · {result.namesChecked} names checked · confidence {result.confidence} ({result.confidenceScore}/100)
                    {result.provider ? <> · provider {result.provider}</> : null}
                  </div>
                </div>
              </div>
            </div>

            {result.evidence.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-ink-secondary">
                {result.evidence.map((e, i) => (
                  <li key={i} className="flex gap-2"><span className="text-brand-soft">·</span><span>{e}</span></li>
                ))}
              </ul>
            )}
          </div>

          {result.exposed.length > 0 && (
            <div className="card">
              <div className="label-muted mb-2">Records resolving outside the CDN (possible leaks)</div>
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full text-left text-sm">
                  <thead className="text-ink-secondary">
                    <tr>
                      <th className="py-1 pr-4 font-medium">Name</th>
                      <th className="py-1 pr-4 font-medium">IP</th>
                      <th className="py-1 pr-4 font-medium">Provider</th>
                      <th className="py-1 font-medium">Version</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs">
                    {result.exposed.map((r, i) => (
                      <tr key={i} className="border-t border-white/5">
                        <td className="py-1 pr-4 text-ink">{r.name}</td>
                        <td className="py-1 pr-4 text-risk-high">{r.ip}</td>
                        <td className="py-1 pr-4 text-ink-secondary">{r.provider || r.org || "-"}</td>
                        <td className="py-1 text-ink-secondary">{r.version}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm text-yellow-200/90">
                <strong>Could also be explained by:</strong> {result.alternative}
              </p>
            </div>
          )}

          <div className="card">
            <div className="label-muted mb-2">Historical DNS (previously-exposed origins)</div>
            {result.historical.available ? (
              result.historical.candidates.length > 0 ? (
                <div className="overflow-x-auto scroll-thin">
                  <table className="w-full text-left text-sm">
                    <thead className="text-ink-secondary"><tr><th className="py-1 pr-4 font-medium">IP</th><th className="py-1 pr-4 font-medium">First seen</th><th className="py-1 font-medium">Last seen</th></tr></thead>
                    <tbody className="font-mono text-xs">
                      {result.historical.candidates.map((h, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="py-1 pr-4 text-risk-unknown">{h.ip}</td>
                          <td className="py-1 pr-4 text-ink-secondary">{h.firstSeen || "-"}</td>
                          <td className="py-1 text-ink-secondary">{h.lastSeen || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-risk-legit">No historical non-CDN IPs found.</p>
              )
            ) : (
              <p className="text-sm text-ink-secondary">{result.historical.note}</p>
            )}
          </div>

          {result.recommendations.length > 0 && (
            <div className="card">
              <div className="label-muted mb-2">Recommended hardening</div>
              <ol className="space-y-2 text-sm text-ink-secondary">
                {result.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-brand-soft">{i + 1}.</span><span>{r}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <p className="text-xs text-ink-secondary">{result.note}</p>
        </div>
      )}

      <Disclaimer variant="inline" />
    </div>
  );
}
