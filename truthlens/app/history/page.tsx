"use client";

// /history - every check you run, saved automatically and re-openable. Local to
// this browser; when a KV store is configured a shared team feed is also shown.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, RotateCcw } from "lucide-react";
import ConfidenceBadge, { ConfidenceLevel } from "@/components/ConfidenceBadge";
import Disclaimer from "@/components/Disclaimer";
import { CheckRecord, listLocal, removeLocal } from "@/lib/check/history";
import { fmtDate } from "@/lib/ui";

const TYPE_LABEL: Record<string, string> = {
  site: "Site Report", post: "Post Check", logs: "Log Analyzer", email: "Email Tracer",
};

export default function HistoryPage() {
  const [local, setLocal] = useState<CheckRecord[]>([]);
  const [shared, setShared] = useState<CheckRecord[] | null>(null);

  useEffect(() => {
    setLocal(listLocal());
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
        <h1 className="font-display text-xl font-bold tracking-tight text-white">History</h1>
        <p className="mt-1.5 text-sm text-ink-secondary">Every check you run is saved here automatically - re-openable, no filing.</p>
      </div>

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
