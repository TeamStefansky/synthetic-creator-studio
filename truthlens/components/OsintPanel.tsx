"use client";

import { useState } from "react";
import { Telescope, Loader2, ExternalLink, Users, Share2, Banknote, AlertTriangle, Link2 } from "lucide-react";
import type { Report, OsintDossier } from "@/lib/types";

export default function OsintPanel({
  report,
  onLoaded,
}: {
  report: Report;
  onLoaded?: (d: OsintDossier) => void;
}) {
  const [dossier, setDossier] = useState<OsintDossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true);
    setError("");
    try {
      const siblingDomains = report.network.nodes
        .filter((n) => n.kind === "domain")
        .map((n) => n.label);
      const r = await fetch("/api/osint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: report.domain,
          finalUrl: report.finalUrl,
          registrantOrg: report.infrastructure.domain.value?.registrantOrg,
          siblingDomains,
        }),
      });
      const data = (await r.json()) as OsintDossier;
      if (!r.ok) throw new Error((data as any).error || "Research failed");
      setDossier(data);
      onLoaded?.(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Telescope className="h-5 w-5 text-indigo-400" />
          <h2 className="text-lg font-semibold">Deep OSINT Research</h2>
        </div>
        {!loading && (
          <button className="btn-ghost text-sm" onClick={run}>
            {dossier ? "Re-run" : "Run research"}
          </button>
        )}
      </div>

      {!dossier && !loading && !error && (
        <p className="text-sm text-gray-400">
          Investigate who is behind this site across the open web - owners,
          affiliations, social presence, funding, reputation, controversies, and
          related sites - with sources. Runs on demand (uses Claude web search).
        </p>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
          Researching the open web… this can take 20–60 seconds.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-risk-high">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {dossier && !dossier.available && (
        <p className="text-sm text-yellow-300/90">{dossier.note}</p>
      )}

      {dossier && dossier.available && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="rounded bg-white/10 px-2 py-0.5">Confidence: {dossier.confidence}</span>
          </div>
          {dossier.summary && <p className="text-sm text-gray-200">{dossier.summary}</p>}

          {dossier.entities.length > 0 && (
            <Section icon={<Users className="h-4 w-4" />} title="People & organizations">
              <ul className="space-y-1.5 text-sm">
                {dossier.entities.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium text-gray-100">{e.name}</span>
                    <span className="text-gray-500"> · {e.role}</span>
                    {e.evidence && <div className="text-gray-400">{e.evidence}</div>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {dossier.affiliations.length > 0 && (
            <Section icon={<Link2 className="h-4 w-4" />} title="Affiliations">
              <ul className="list-inside list-disc text-sm text-gray-300">
                {dossier.affiliations.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </Section>
          )}

          {dossier.socialProfiles.length > 0 && (
            <Section icon={<Share2 className="h-4 w-4" />} title="Social profiles">
              <ul className="space-y-1 text-sm">
                {dossier.socialProfiles.map((s, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-gray-400">{s.platform}:</span>
                    <span className="text-gray-200">{s.handle}</span>
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-indigo-400">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {dossier.funding && (
            <Section icon={<Banknote className="h-4 w-4" />} title="Funding / monetization">
              <p className="text-sm text-gray-300">{dossier.funding}</p>
            </Section>
          )}

          {dossier.reputation && (
            <Section title="Reputation">
              <p className="text-sm text-gray-300">{dossier.reputation}</p>
            </Section>
          )}

          {dossier.controversies.length > 0 && (
            <Section icon={<AlertTriangle className="h-4 w-4 text-risk-high" />} title="Controversies">
              <ul className="list-inside list-disc text-sm text-risk-high/90">
                {dossier.controversies.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </Section>
          )}

          {dossier.relatedSites.length > 0 && (
            <Section title="Related sites">
              <p className="text-sm text-gray-300">{dossier.relatedSites.join(", ")}</p>
            </Section>
          )}

          {dossier.citations.length > 0 && (
            <Section title="Sources">
              <ul className="space-y-1 text-sm">
                {dossier.citations.map((c, i) => (
                  <li key={i}>
                    <a href={c.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-indigo-400 hover:underline">
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{c.title || c.url}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <p className="text-xs text-gray-500">{dossier.note}</p>
        </div>
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-bg-elev p-3">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-200">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
