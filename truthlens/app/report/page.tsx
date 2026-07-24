"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Globe, Server, Mail, Lock, Cpu, History, AlertTriangle, Network as NetIcon,
  Share2, Radar, TrendingUp, Search, ArrowUpRight,
} from "lucide-react";
import type { Report, OsintDossier } from "@/lib/types";
import { fmtDate } from "@/lib/ui";
import VerdictBadge from "@/components/VerdictBadge";
import ScoreGauge from "@/components/ScoreGauge";
import InfraCard from "@/components/InfraCard";
import ContentAnalysisCard from "@/components/ContentAnalysisCard";
import NetworkGraph from "@/components/NetworkGraph";
import { recordSearch } from "@/lib/clues/record";
import LoadingChecklist from "@/components/LoadingChecklist";
import Disclaimer from "@/components/Disclaimer";
import OsintPanel from "@/components/OsintPanel";
import RatingReportCard from "@/components/RatingReportCard";
import NarrativeCard from "@/components/NarrativeCard";
import InsightsCard from "@/components/InsightsCard";
import SocialMediaPanel from "@/components/SocialMediaPanel";
import GeoOriginCard from "@/components/GeoOriginCard";
import OriginChainCard from "@/components/OriginChainCard";
import CibPanel from "@/components/CibPanel";

function ReportInner() {
  const params = useSearchParams();
  const url = params.get("url") || "";
  const [report, setReport] = useState<Report | null>(null);
  const [dossier, setDossier] = useState<OsintDossier | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!url) {
      setError("No URL provided.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Analysis failed");
        return data as Report;
      })
      .then((data) => {
        if (!cancelled) { setReport(data); recordSearch("site", data.domain || url, data.domain || url, data); }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Analysis failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading) return <div className="py-10"><LoadingChecklist /></div>;
  if (error)
    return (
      <div className="card mx-auto max-w-md text-center">
        <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-risk-high" />
        <p className="text-risk-high">{error}</p>
        <p className="mt-2 text-sm text-ink-secondary">Try a different URL.</p>
      </div>
    );
  if (!report) return null;

  const i = report.infrastructure;
  const dom = i.domain.value;
  const host = i.hosting.value;
  const mail = i.mail.value;
  const ssl = i.ssl.value;
  const tech = i.tech.value;
  const arch = i.archive.value;
  const seo = i.seo.value;
  const authority = i.authority.value;

  return (
    <div className="space-y-6">
      {/* Header / verdict */}
      <div className="card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="label-muted">Report for</div>
            <h1 className="font-display text-xl font-bold break-all">{report.domain}</h1>
            <a href={report.finalUrl || report.url} target="_blank" rel="noreferrer" className="text-xs text-brand-soft break-all">
              {report.finalUrl || report.url}
            </a>
            <div className="mt-1.5">
              <a href={`/check?type=narrative&input=${encodeURIComponent(report.domain)}`}
                className="inline-flex items-center gap-1 text-xs text-brand-soft hover:underline">
                <Search className="h-3.5 w-3.5" /> Check narratives from this site
              </a>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <ScoreGauge score={report.risk.score} band={report.risk.band} />
            <VerdictBadge band={report.risk.band} confidence={report.risk.confidence} />
          </div>
        </div>
        <div className="mt-4">
          <Disclaimer variant="inline" />
        </div>
      </div>

      {/* Infrastructure cards */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Infrastructure Exposure</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <InfraCard
            title="Domain" icon={<Globe className="h-5 w-5" />} data={i.domain}
            rows={[
              { label: "Registrar", value: dom?.registrar },
              { label: "Created", value: fmtDate(dom?.createdAt) },
              { label: "Expires", value: fmtDate(dom?.expiresAt) },
              { label: "Registrant", value: dom?.registrantOrg || (dom?.privacyProtected ? "Privacy-protected" : " - ") },
              { label: "Country", value: dom?.registrantCountry },
              { label: "Age (days)", value: dom?.ageDays != null ? String(dom.ageDays) : " - " },
            ]}
          />
          <InfraCard
            title="Hosting" icon={<Server className="h-5 w-5" />} data={i.hosting}
            note={host?.cdnMasksOrigin ? `${host.cdn} edge - true origin server is masked. Country reflects the CDN, not the operator.` : undefined}
            rows={[
              { label: "IP", value: host?.ip },
              { label: "ASN", value: host?.asn },
              { label: "Org", value: host?.asnOrg },
              { label: "Country", value: host?.cdnMasksOrigin ? "CDN edge (masked)" : host?.country },
              { label: "Type", value: host?.hostingType },
            ]}
          />
          <InfraCard
            title="Mail" icon={<Mail className="h-5 w-5" />} data={i.mail}
            rows={[
              { label: "MX", value: mail?.mxProviders.slice(0, 3).join(", ") || " - " },
              { label: "SPF", value: mail?.spf ? "✓" : "✗" },
              { label: "DKIM", value: mail?.dkim ? "✓" : "?" },
              { label: "DMARC", value: mail?.dmarc ? "✓" : "✗" },
              { label: "Emails found", value: mail?.emailsFound.slice(0, 2).join(", ") || " - " },
            ]}
          />
          <InfraCard
            title="SSL" icon={<Lock className="h-5 w-5" />} data={i.ssl}
            rows={[
              { label: "Issuer", value: ssl?.issuer },
              { label: "Valid to", value: fmtDate(ssl?.validTo) },
              { label: "Certs seen", value: ssl?.certCount != null ? String(ssl.certCount) : " - " },
              { label: "SAN domains", value: ssl?.sanDomains.length ? `${ssl.sanDomains.length} sibling(s)` : " - " },
            ]}
          />
          <InfraCard
            title="Tech" icon={<Cpu className="h-5 w-5" />} data={i.tech}
            rows={[
              { label: "CMS", value: tech?.cms },
              { label: "Frameworks", value: tech?.frameworks.join(", ") || " - " },
              { label: "Ad networks", value: tech?.adNetworks.join(", ") || " - " },
              { label: "Trackers", value: tech?.trackers.join(", ") || " - " },
              { label: "GA / AdSense", value: [...(tech?.gaIds || []), ...(tech?.adsenseIds || [])].join(", ") || " - " },
            ]}
          />
          <InfraCard
            title="Archive" icon={<History className="h-5 w-5" />} data={i.archive}
            rows={[
              { label: "First seen", value: fmtDate(arch?.firstSeen) },
              { label: "Snapshots", value: arch?.snapshotCount != null ? String(arch.snapshotCount) : " - " },
            ]}
          />
          <InfraCard
            title="Authority & Longevity" icon={<TrendingUp className="h-5 w-5" />} data={i.authority}
            rows={[
              { label: "Domain age (yrs)", value: authority?.domainAgeYears != null ? String(authority.domainAgeYears) : " - " },
              { label: "Web presence (yrs)", value: authority?.waybackYears != null ? String(authority.waybackYears) : " - " },
              { label: "Archive snapshots", value: authority?.snapshotCount != null ? String(authority.snapshotCount) : " - " },
              { label: "Open PageRank", value: authority?.openPageRank != null ? `${authority.openPageRank}/10` : "n/a" },
              { label: "Authority level", value: authority?.level },
            ]}
          />
          <InfraCard
            title="SEO Health" icon={<Search className="h-5 w-5" />} data={i.seo}
            rows={[
              { label: "SEO score", value: seo?.seoScore != null ? `${seo.seoScore}/100` : " - " },
              { label: "Meta description", value: seo?.metaDescription ? "✓" : "✗" },
              { label: "Open Graph", value: seo?.hasOpenGraph ? "✓" : "✗" },
              { label: "Structured data", value: seo?.hasStructuredData ? "✓" : "✗" },
              { label: "Canonical", value: seo?.hasCanonical ? "✓" : "✗" },
            ]}
          />
        </div>
      </section>

      {/* Geographic origin (server + registrant countries) */}
      <GeoOriginCard report={report} />

      {/* Origin chain - attempt to reveal the true server behind a CDN */}
      {report.originTrace && <OriginChainCard trace={report.originTrace} />}

      {/* Network graph */}
      <section className="card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <NetIcon className="h-5 w-5 text-brand-soft" />
            <h2 className="text-lg font-semibold">Operator Network</h2>
          </div>
          {(() => {
            // Send this domain + its discovered domain nodes to the Link Board
            // for a calibrated, evidenced overlap comparison.
            const domains = [report.domain, ...report.network.nodes.filter((n) => n.kind === "domain").map((n) => n.label)]
              .filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 12);
            return domains.length >= 2 ? (
              <a href={`/tools/linkboard?domains=${encodeURIComponent(domains.join(","))}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-soft hover:underline">
                Compare in Link Board <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            ) : null;
          })()}
        </div>
        <NetworkGraph network={report.network} />
        {report.network.note && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-yellow-300/80">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {report.network.note}
          </p>
        )}
      </section>

      {/* Coordinated Inauthentic Behavior (CIB) - on-demand, actor UNDETERMINED */}
      <CibPanel domain={report.domain} />

      {/* Content analysis */}
      <ContentAnalysisCard data={report.contentAnalysis} />

      {/* Narrative intelligence + authenticity (Cyabra-style) */}
      <NarrativeCard report={report} />

      {/* Insights - ask the report anything */}
      <InsightsCard report={report} />

      {/* Propagation + coordination */}
      <div className="grid gap-4 lg:grid-cols-2">
        {report.propagation && (
          <div className="card">
            <div className="mb-3 flex items-center gap-2">
              <Share2 className="h-5 w-5 text-brand-soft" />
              <h2 className="text-lg font-semibold">Content Propagation</h2>
            </div>
            {report.propagation.hits.length === 0 ? (
              <p className="text-sm text-ink-secondary">{report.propagation.note}</p>
            ) : (
              <>
                {report.propagation.earliestPublisher && (
                  <p className="mb-2 text-sm">
                    Likely origin:{" "}
                    <span className="font-medium text-brand-soft">{report.propagation.earliestPublisher}</span>{" "}
                    {report.propagation.earliestDate && <span className="text-ink-secondary">({report.propagation.earliestDate})</span>}
                  </p>
                )}
                {report.propagation.coordinatedAmplification && (
                  <p className="mb-2 text-sm text-risk-high">⚠ Possible coordinated network amplification.</p>
                )}
                <ul className="max-h-48 space-y-1 overflow-auto text-sm scroll-thin">
                  {report.propagation.hits.map((h, idx) => (
                    <li key={idx} className="flex justify-between gap-2">
                      <span className="truncate text-ink">{h.domain}</span>
                      <span className="shrink-0 text-ink-secondary">{h.publishedAt || " - "}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {report.coordination && (
          <div className="card">
            <div className="mb-3 flex items-center gap-2">
              <Radar className="h-5 w-5 text-brand-soft" />
              <h2 className="text-lg font-semibold">Coordination Likelihood</h2>
            </div>
            <div className={`mb-3 inline-block rounded-lg px-3 py-1 text-sm font-semibold ${
              report.coordination.level === "High" ? "bg-risk-high/15 text-risk-high"
                : report.coordination.level === "Medium" ? "bg-risk-unknown/15 text-risk-unknown"
                : "bg-risk-legit/15 text-risk-legit"
            }`}>
              {report.coordination.level}
            </div>
            {report.coordination.signals.length === 0 ? (
              <p className="text-sm text-ink-secondary">No coordination signals detected.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {report.coordination.signals.map((s, idx) => (
                  <li key={idx} className="text-ink">
                    <span className="font-medium">{s.label}</span> - <span className="text-ink-secondary">{s.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ink-secondary">{report.coordination.note}</p>
          </div>
        )}
      </div>

      {/* Social & media intelligence (on-demand) */}
      <SocialMediaPanel report={report} />

      {/* Deep OSINT research (on-demand) */}
      <OsintPanel report={report} onLoaded={setDossier} />

      {/* Detailed, auditable rating breakdown + export */}
      <RatingReportCard report={report} dossier={dossier} />

      <p className="text-center text-xs text-ink-secondary">
        Analyzed {fmtDate(report.fetchedAt)} · cached for 24h
      </p>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="py-10"><LoadingChecklist /></div>}>
      <ReportInner />
    </Suspense>
  );
}
