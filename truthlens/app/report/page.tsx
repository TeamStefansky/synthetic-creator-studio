"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Eye,
  Globe,
  Server,
  Mail,
  Lock,
  Cpu,
  History,
  ArrowLeft,
  AlertCircle,
} from "lucide-react";
import type { Report } from "@/lib/types";
import VerdictBadge from "@/components/VerdictBadge";
import ScoreGauge from "@/components/ScoreGauge";
import InfraCard, { Chips, YesNo } from "@/components/InfraCard";
import EvidenceList from "@/components/EvidenceList";
import ContentAnalysisCard from "@/components/ContentAnalysisCard";
import NetworkGraph from "@/components/NetworkGraph";
import LoadingChecklist from "@/components/LoadingChecklist";
import Disclaimer from "@/components/Disclaimer";

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
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-slate-300 transition hover:text-white"
          >
            <Eye className="h-5 w-5 text-blue-400" />
            <span className="font-semibold">TruthLens</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            New analysis
          </Link>
        </header>

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
                value: [infra.hosting.city, infra.hosting.region, infra.hosting.country]
                  .filter(Boolean)
                  .join(", "),
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
