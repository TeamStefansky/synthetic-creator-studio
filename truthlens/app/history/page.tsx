"use client";

// /history - every check you run, saved automatically and re-openable. Local to
// this browser; when a KV store is configured a shared team feed is also shown.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, RotateCcw, Network, ArrowRight, History as HistoryIcon } from "lucide-react";
import ConfidenceBadge, { ConfidenceLevel } from "@/components/ConfidenceBadge";
import Disclaimer from "@/components/Disclaimer";
import { CheckRecord, listLocal, removeLocal } from "@/lib/check/history";
import { buildFindings, type FindingsReport } from "@/lib/clues/findings";
import { fmtDate } from "@/lib/ui";

const TYPE_LABEL: Record<string, string> = {
  site: "Site Report", post: "Post Check", logs: "Log Analyzer", email: "Email Tracer",
  origin: "Origin Exposure", mentions: "Brand Mentions", signal: "SIGNAL Grid",
  linkboard: "Link Board", sanctions: "Sanctions Screening", crypto: "Crypto OSINT",
};

export default function HistoryPage() {
  const [local, setLocal] = useState<CheckRecord[]>([]);
  const [shared, setShared] = useState<CheckRecord[] | null>(null);
  const [findings, setFindings] = useState<FindingsReport | null>(null);

  useEffect(() => {
    setLocal(listLocal());
    setFindings(buildFindings());
    fetch("/api/checks").then((r) => r.json()).then((d) => { if (d.connected) setShared(d.checks || []); }).catch(() => {});
  }, []);

  const del = (id: string) => { removeLocal(id); setLocal(listLocal()); };

  const Row = ({ c, local: isLocal }: { c: CheckRecord; local?: boolean }) => (
    <div className="card flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <ConfidenceBadge level={(c.level as ConfidenceLevel) || "Unknown"} />
          <span className="truncate font-medium text-ink">{c.headline}</span>
        </div>
        <div className="mt-1 truncate text-xs text-ink-secondary">
          {TYPE_LABEL[c.type] || c.type} · {fmtDate(c.createdAt)} · <span className="text-ink-muted">{c.input.slice(0, 80)}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Link href={`/check?reopen=${encodeURIComponent(c.id)}`} className="flex items-center gap-1 text-xs text-brand-soft hover:underline">
          <RotateCcw className="h-3.5 w-3.5" /> Reopen
        </Link>
        {isLocal && (
          <button onClick={() => del(c.id)} className="text-ink-muted transition hover:text-risk-high" title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="animate-fade-up space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <HistoryIcon className="h-6 w-6 text-brand-soft" />
          <h1 className="font-display text-2xl font-bold">History</h1>
        </div>
        <p className="mt-1 text-sm text-ink-secondary">Every check you run is saved here automatically - re-openable, no filing.</p>
      </div>

      {/* Cross-search conclusions - a bridge from "my searches" to the Case Board. */}
      {findings && findings.findings.length > 0 && (
        <Link href="/tools/linkboard" className="block">
          <div className="card flex flex-wrap items-center gap-3 border-brand/30 bg-brand/[0.04] transition hover:bg-brand/[0.08]">
            <Network className="h-5 w-5 shrink-0 text-brand-soft" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">
                {findings.findings.length} connection{findings.findings.length === 1 ? "" : "s"} found across {findings.linkedSearches} of your searches
              </div>
              <div className="truncate text-xs text-ink-secondary">
                {findings.clusters.length > 0 && <>{findings.clusters.length} cluster{findings.clusters.length === 1 ? "" : "s"} · </>}
                strongest: {findings.strongest} · open the Case Board for leads, evidence and next steps.
              </div>
            </div>
            {findings.strongest && <ConfidenceBadge level={findings.strongest as ConfidenceLevel} />}
            <ArrowRight className="h-4 w-4 shrink-0 text-brand-soft" />
          </div>
        </Link>
      )}

      {local.length === 0 ? (
        <div className="card text-sm text-ink-secondary">
          No checks yet. Run one from <Link href="/check" className="text-brand-soft hover:underline">Check</Link>.
        </div>
      ) : (
        local.map((c) => <Row key={c.id} c={c} local />)
      )}

      {shared && shared.length > 0 && (
        <>
          <h2 className="pt-2 text-sm font-semibold text-ink-secondary">Shared team feed</h2>
          {shared.filter((s) => !local.some((l) => l.id === s.id)).map((c) => <Row key={c.id} c={c} />)}
        </>
      )}

      <Disclaimer />
    </div>
  );
}
