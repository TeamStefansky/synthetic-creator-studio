// infra -> narrative bridge card. Shows which of a site's / board's domains match a
// documented io-reference list (state media, documented campaign, foreign-agent) or
// amplify a monitored narrative. Every hit is a LEAD with an innocent alternative -
// co-hosting/syndication is context, never proof. Organizations/domains only.

import { GitCompareArrows, ArrowUpRight } from "lucide-react";
import type { CrossLookupResult, CrossHitKind } from "@/lib/bridge";

const KIND_LABEL: Record<CrossHitKind, string> = {
  state_media: "state media",
  documented_campaign: "documented campaign",
  foreign_agent: "foreign agent",
  narrative_amplifier: "narrative amplifier",
};
const TONE: Record<string, string> = {
  High: "border-risk-high/40 text-risk-high",
  Medium: "border-risk-unknown/40 text-risk-unknown",
  Low: "border-white/15 text-ink-secondary",
};

export default function CrossLinksCard({ cross, title = "Cross-links: documented lists & monitored narratives" }: { cross: CrossLookupResult; title?: string }) {
  if (!cross || cross.hits.length === 0) return null; // only render when there is a lead
  return (
    <section className="card">
      <div className="mb-2 flex items-center gap-2">
        <GitCompareArrows className="h-5 w-5 text-brand-soft" />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <p className="mb-3 text-sm text-ink-secondary">
        Domains connected to this case that also appear on a documented public list or
        amplify a narrative under monitoring. Each is a lead to review - not proof.
        {!cross.registryConnected && " (Narrative-amplifier registry not connected - showing documented-list matches only.)"}
      </p>
      <ul className="space-y-2">
        {cross.hits.map((h, i) => (
          <li key={i} className={`rounded-lg border ${TONE[h.confidence]} bg-white/[0.02] p-2.5`}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] uppercase tracking-wide">{KIND_LABEL[h.kind]}</span>
              <span className="text-ink">{h.domain}</span>
              <span className="text-ink-secondary">- {h.detail}</span>
              <span className="text-[11px] text-ink-muted">· {h.confidence}</span>
              {h.citation && <a href={h.citation} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-brand-soft hover:underline">source <ArrowUpRight className="h-3 w-3" /></a>}
            </div>
            <div className="mt-1 text-xs text-ink-secondary">Could also be: {h.alternative}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
