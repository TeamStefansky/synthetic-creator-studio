"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Globe,
  Server,
  Mail,
  Lock,
  Cpu,
  History,
  ArrowLeft,
  AlertCircle,
  ShieldAlert,
  Users,
  Share2,
  Cloud,
} from "lucide-react";
import type { Report, Likelihood } from "@/lib/types";
import VerdictBadge from "@/components/VerdictBadge";
import ScoreGauge from "@/components/ScoreGauge";
import InfraCard, { Chips, YesNo } from "@/components/InfraCard";
import EvidenceList from "@/components/EvidenceList";
import ContentAnalysisCard from "@/components/ContentAnalysisCard";
import NetworkGraph from "@/components/NetworkGraph";
import LoadingChecklist from "@/components/LoadingChecklist";
import Disclaimer from "@/components/Disclaimer";
import Nav from "@/components/Nav";

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ReportInner() {
  const params = useSearchParams();
  const url = params.get("url") ?? "";

  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setError("No URL provided.");
      return;
    }
    let cancelled = false;
    setReport(null);
    setError(null);

    (async () => {
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error ?? "Analysis failed.");
          return;
        }
        setReport(data as Report);
      } catch {
        if (!cancelled) setError("Could not reach the analysis service.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6">
          <Nav />
          <div className="mt-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              New analysis
            </Link>
          </div>
        </div>

        {error ? (
          <ErrorState message={error} />
        ) : !report ? (
          <div className="py-16">
            <LoadingChecklist />
          </div>
        ) : (
          <ReportBody report={report} />
        )}

        <Disclaimer className="mt-10" />
      </div>
    </main>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
      <AlertCircle className="mx-auto mb-2 h-8 w-8 text-band-red" />
      <p className="text-slate-200">{message}</p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
      >
        Try another URL
      </Link>
    </div>
  );
}

function ReportBody({ report }: { report: Report }) {
  const { infrastructure: infra, risk } = report;

  return (
    <div className="space-y-6">
      {/* Target + verdict */}
      <section className="rounded-2xl border border-surface-border bg-surface-card p-5">
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Analyzed
          </div>
          <a
            href={report.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all text-lg font-semibold text-slate-100 hover:text-blue-400"
          >
            {report.domain}
          </a>
        </div>
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
          <VerdictBadge band={risk.band} confidence={risk.confidence} />
          <ScoreGauge score={risk.score} band={risk.band} />
        </div>

        {/* Adversary-origin flag (operator-configured policy) */}
        {report.adversaryOrigin.flagged && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-slate-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-band-red" />
            <span>
              <strong className="text-band-red">Adversary-country origin.</strong>{" "}
              {report.adversaryOrigin.matches
                .map((m) => `${m.country} (${m.source})`)
                .join(", ")}{" "}
              matches your configured adversary list.
            </span>
          </div>
        )}
        {report.adversaryOrigin.cdnMasked && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs text-slate-300">
            <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-purple-300" />
            <span>
              Served via{" "}
              {report.adversaryOrigin.cdnProvider ?? "a CDN"}. The true origin
              server is masked — origin-country flagging is suppressed to avoid a
              false-confidence claim.
            </span>
          </div>
        )}
      </section>

      {/* Infrastructure cards */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Infrastructure exposure
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <InfraCard
            title="Domain"
            icon={<Globe className="h-5 w-5" />}
            rows={[
              { label: "Registrar", value: infra.domain.registrar },
              { label: "Created", value: fmtDate(infra.domain.createdAt) },
              { label: "Expires", value: fmtDate(infra.domain.expiresAt) },
              {
                label: "Age",
                value:
                  infra.domain.ageDays !== null
                    ? `${infra.domain.ageDays} days`
                    : null,
              },
              { label: "Registrant", value: infra.domain.registrantOrg },
              {
                label: "WHOIS privacy",
                value: <YesNo value={infra.domain.privacyProtected} />,
              },
            ]}
          />

          <InfraCard
            title="Hosting"
            icon={<Server className="h-5 w-5" />}
            rows={[
              { label: "IP", value: infra.hosting.ip },
              { label: "ASN", value: infra.hosting.asn },
              { label: "Provider", value: infra.hosting.org },
              {
                label: "Location",
                value: infra.hosting.isCdn ? (
                  <span className="inline-flex items-center gap-1 text-purple-300">
                    <Cloud className="h-3.5 w-3.5" />
                    CDN edge ({infra.hosting.cdnProvider ?? "CDN"}) — true origin
                    masked
                  </span>
                ) : (
                  [infra.hosting.city, infra.hosting.region, infra.hosting.country]
                    .filter(Boolean)
                    .join(", ")
                ),
              },
              { label: "Reverse host", value: infra.hosting.hostname },
            ]}
          />

          <InfraCard
            title="Mail"
            icon={<Mail className="h-5 w-5" />}
            rows={[
              { label: "MX provider", value: infra.mail.mxProvider },
              { label: "SPF", value: <YesNo value={infra.mail.hasSpf} /> },
              { label: "DKIM", value: <YesNo value={infra.mail.hasDkim} /> },
              { label: "DMARC", value: <YesNo value={infra.mail.hasDmarc} /> },
              {
                label: "Emails in source",
                value: <Chips items={infra.mail.emailsFound} />,
              },
            ]}
          />

          <InfraCard
            title="SSL"
            icon={<Lock className="h-5 w-5" />}
            rows={[
              { label: "Issuer", value: infra.ssl.issuer },
              { label: "Valid from", value: fmtDate(infra.ssl.validFrom) },
              { label: "Valid to", value: fmtDate(infra.ssl.validTo) },
              { label: "Valid HTTPS", value: <YesNo value={infra.ssl.validHttps} /> },
              {
                label: `SAN domains (${infra.ssl.sanDomains.length})`,
                value: (
                  <Chips items={infra.ssl.sanDomains.slice(0, 12)} />
                ),
              },
            ]}
          />

          <InfraCard
            title="Tech stack"
            icon={<Cpu className="h-5 w-5" />}
            rows={[
              { label: "CMS", value: infra.tech.cms },
              { label: "Server", value: infra.tech.server },
              { label: "Frameworks", value: <Chips items={infra.tech.frameworks} /> },
              { label: "Ad networks", value: <Chips items={infra.tech.adNetworks} /> },
              { label: "Trackers", value: <Chips items={infra.tech.trackers} /> },
              {
                label: "Analytics IDs",
                value: <Chips items={[...infra.tech.gaIds, ...infra.tech.adsenseIds]} />,
              },
              {
                label: "Transparency",
                value: (
                  <span className="text-xs text-slate-300">
                    About {infra.tech.hasAbout ? "✓" : "✗"} · Contact{" "}
                    {infra.tech.hasContact ? "✓" : "✗"} · Authors{" "}
                    {infra.tech.hasAuthors ? "✓" : "✗"} · Corrections{" "}
                    {infra.tech.hasCorrections ? "✓" : "✗"}
                  </span>
                ),
              },
            ]}
          />

          <InfraCard
            title="Archive"
            icon={<History className="h-5 w-5" />}
            rows={[
              { label: "First seen", value: fmtDate(infra.archive.firstSeen) },
              {
                label: "Snapshots",
                value: infra.archive.snapshotCount
                  ? String(infra.archive.snapshotCount)
                  : null,
              },
            ]}
          />
        </div>
      </section>

      {/* Network graph */}
      <section>
        <NetworkGraph network={report.network} />
      </section>

      {/* Coordination + propagation (attribution addendum) */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CoordinationCard report={report} />
        <PropagationCard report={report} />
      </section>

      {/* Content analysis */}
      <section>
        <ContentAnalysisCard content={report.contentAnalysis} />
      </section>

      {/* Evidence */}
      <section>
        <EvidenceList evidence={risk.evidence} />
      </section>
    </div>
  );
}

function likelihoodStyle(l: Likelihood) {
  if (l === "High") return "text-band-red";
  if (l === "Medium") return "text-band-yellow";
  return "text-band-green";
}

function CoordinationCard({ report }: { report: Report }) {
  const c = report.coordination;
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-5 w-5 text-emerald-400" />
        <h3 className="font-semibold text-slate-200">Coordination likelihood</h3>
        <span className={`ml-auto text-lg font-bold ${likelihoodStyle(c.likelihood)}`}>
          {c.likelihood}
        </span>
      </div>
      {c.evidence.length === 0 ? (
        <p className="text-sm text-slate-500">
          No coordination signals detected from the available infrastructure.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {c.evidence.map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 text-emerald-400">•</span>
              <span>
                <span className="text-slate-200">{e.label}</span>
                <span className="text-slate-500"> — {e.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PropagationCard({ report }: { report: Report }) {
  const p = report.propagation;
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Share2 className="h-5 w-5 text-blue-400" />
        <h3 className="font-semibold text-slate-200">Content propagation</h3>
      </div>

      {p.query && (
        <p className="mb-3 rounded bg-surface/50 p-2 text-xs italic text-slate-400">
          Tracing phrase: “{p.query}”
        </p>
      )}

      {!p.available ? (
        <p className="text-sm text-slate-500">{p.note ?? "Unavailable."}</p>
      ) : p.hits.length === 0 ? (
        <p className="text-sm text-slate-500">
          {p.note ?? "No other publishers of this phrase were found."}
        </p>
      ) : (
        <>
          {p.earliestPublisher && (
            <p className="mb-2 text-sm">
              <span className="text-slate-400">Likely origin: </span>
              <span className="font-medium text-slate-100">
                {p.earliestPublisher}
              </span>
              {p.earliestDate && (
                <span className="text-slate-500"> ({p.earliestDate})</span>
              )}
            </p>
          )}
          {p.coordinatedAmplification && (
            <p className="mb-2 text-xs text-band-red">
              ⚠ Coordinated amplification: republishers share this
              operator&apos;s infrastructure.
            </p>
          )}
          <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
            {p.hits.map((h, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-slate-600">{h.publishedAt ?? "—"}</span>
                <a
                  href={h.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="break-all text-slate-300 hover:text-blue-400"
                >
                  {h.domain}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16">
          <LoadingChecklist />
        </div>
      }
    >
      <ReportInner />
    </Suspense>
  );
}
