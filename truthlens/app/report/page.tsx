"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Globe, Server, Mail, Lock, Cpu, History, AlertTriangle, Network as NetIcon,
  Share2, Radar,
} from "lucide-react";
import type { Report } from "@/lib/types";
import { fmtDate } from "@/lib/ui";
import VerdictBadge from "@/components/VerdictBadge";
import ScoreGauge from "@/components/ScoreGauge";
import InfraCard from "@/components/InfraCard";
import EvidenceList from "@/components/EvidenceList";
import ContentAnalysisCard from "@/components/ContentAnalysisCard";
import NetworkGraph from "@/components/NetworkGraph";
import LoadingChecklist from "@/components/LoadingChecklist";
import Disclaimer from "@/components/Disclaimer";

function ReportInner() {
  const params = useSearchParams();
  const url = params.get("url") || "";
  const [report, setReport] = useState<Report | null>(null);
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
        if (!cancelled) setReport(data);
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
        <p className="mt-2 text-sm text-gray-400">Try a different URL.</p>
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

  return (
    <div className="space-y-6">
      {/* Header / verdict */}
      <div className="card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="label-muted">Report for</div>
            <h1 className="text-xl font-bold break-all">{report.domain}</h1>
            <a href={report.finalUrl || report.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 break-all">
              {report.finalUrl || report.url}
            </a>
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
              { label: "Registrant", value: dom?.registrantOrg || (dom?.privacyProtected ? "Privacy-protected" : "—") },
              { label: "Country", value: dom?.registrantCountry },
              { label: "Age (days)", value: dom?.ageDays != null ? String(dom.ageDays) : "—" },
            ]}
          />
          <InfraCard
            title="Hosting" icon={<Server className="h-5 w-5" />} data={i.hosting}
            note={host?.cdnMasksOrigin ? `${host.cdn} edge — true origin server is masked. Country reflects the CDN, not the operator.` : undefined}
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
              { label: "MX", value: mail?.mxProviders.slice(0, 3).join(", ") || "—" },
              { label: "SPF", value: mail?.spf ? "✓" : "✗" },
              { label: "DKIM", value: mail?.dkim ? "✓" : "?" },
              { label: "DMARC", value: mail?.dmarc ? "✓" : "✗" },
              { label: "Emails found", value: mail?.emailsFound.slice(0, 2).join(", ") || "—" },
            ]}
          />
          <InfraCard
            title="SSL" icon={<Lock className="h-5 w-5" />} data={i.ssl}
            rows={[
              { label: "Issuer", value: ssl?.issuer },
              { label: "Valid to", value: fmtDate(ssl?.validTo) },
              { label: "Certs seen", value: ssl?.certCount != null ? String(ssl.certCount) : "—" },
              { label: "SAN domains", value: ssl?.sanDomains.length ? `${ssl.sanDomains.length} sibling(s)` : "—" },
            ]}
          />
          <InfraCard
            title="Tech" icon={<Cpu className="h-5 w-5" />} data={i.tech}
            rows={[
              { label: "CMS", value: tech?.cms },
              { label: "Frameworks", value: tech?.frameworks.join(", ") || "—" },
              { label: "Ad networks", value: tech?.adNetworks.join(", ") || "—" },
              { label: "Trackers", value: tech?.trackers.join(", ") || "—" },
              { label: "GA / AdSense", value: [...(tech?.gaIds || []), ...(tech?.adsenseIds || [])].join(", ") || "—" },
            ]}
          />
          <InfraCard
            title="Archive" icon={<History className="h-5 w-5" />} data={i.archive}
            rows={[
              { label: "First seen", value: fmtDate(arch?.firstSeen) },
              { label: "Snapshots", value: arch?.snapshotCount != null ? String(arch.snapshotCount) : "—" },
            ]}
          />
        </div>
      </section>

      {/* Network graph */}
      <section className="card">
        <div className="mb-3 flex items-center gap-2">
          <NetIcon className="h-5 w-5 text-indigo-400" />
          <h2 className="text-lg font-semibold">Operator Network</h2>
        </div>
        <NetworkGraph network={report.network} />
      </section>

      {/* Content analysis */}
      <ContentAnalysisCard data={report.contentAnalysis} />

      {/* Propagation + coordination */}
      <div className="grid gap-4 lg:grid-cols-2">
        {report.propagation && (
          <div className="card">
            <div className="mb-3 flex items-center gap-2">
              <Share2 className="h-5 w-5 text-indigo-400" />
              <h2 className="text-lg font-semibold">Content Propagation</h2>
            </div>
            {report.propagation.hits.length === 0 ? (
              <p className="text-sm text-gray-500">{report.propagation.note}</p>
            ) : (
              <>
                {report.propagation.earliestPublisher && (
                  <p className="mb-2 text-sm">
                    Likely origin:{" "}
                    <span className="font-medium text-indigo-300">{report.propagation.earliestPublisher}</span>{" "}
                    {report.propagation.earliestDate && <span className="text-gray-500">({report.propagation.earliestDate})</span>}
                  </p>
                )}
                {report.propagation.coordinatedAmplification && (
                  <p className="mb-2 text-sm text-risk-high">⚠ Possible coordinated network amplification.</p>
                )}
                <ul className="max-h-48 space-y-1 overflow-auto text-sm scroll-thin">
                  {report.propagation.hits.map((h, idx) => (
                    <li key={idx} className="flex justify-between gap-2">
                      <span className="truncate text-gray-300">{h.domain}</span>
                      <span className="shrink-0 text-gray-500">{h.publishedAt || "—"}</span>
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
              <Radar className="h-5 w-5 text-indigo-400" />
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
              <p className="text-sm text-gray-500">No coordination signals detected.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {report.coordination.signals.map((s, idx) => (
                  <li key={idx} className="text-gray-300">
                    <span className="font-medium">{s.label}</span> — <span className="text-gray-400">{s.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-gray-500">{report.coordination.note}</p>
          </div>
        )}
      </div>

      {/* Evidence */}
      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Why this score? (Evidence)</h2>
        <EvidenceList evidence={report.risk.evidence} />
      </section>

      <p className="text-center text-xs text-gray-500">
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
