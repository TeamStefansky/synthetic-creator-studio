import { TrendingUp, TrendingDown, ListChecks } from "lucide-react";
import type { EvidenceItem } from "@/lib/types";

/**
 * The transparency centerpiece: every signal that moved the score, with its
 * sign, magnitude and a human-readable explanation.
 */
export default function EvidenceList({
  evidence,
}: {
  evidence: EvidenceItem[];
}) {
  if (!evidence.length) {
    return (
      <p className="text-sm text-slate-500">No scoring signals were available.</p>
    );
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="mb-4 flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-amber-400" />
        <h3 className="font-semibold text-slate-200">
          Evidence — every signal, with its weight
        </h3>
      </div>
      <ul className="space-y-2">
        {evidence.map((e, i) => {
          const increasesRisk = e.impact > 0;
          return (
            <li
              key={i}
              className="flex items-start gap-3 rounded-lg border border-surface-border/60 bg-surface/40 p-3"
            >
              <div
                className={`mt-0.5 flex h-7 w-12 shrink-0 items-center justify-center gap-1 rounded-md text-xs font-bold ${
                  increasesRisk
                    ? "bg-red-500/15 text-band-red"
                    : "bg-emerald-500/15 text-band-green"
                }`}
                title={increasesRisk ? "Increases risk" : "Decreases risk"}
              >
                {increasesRisk ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                {e.impact > 0 ? `+${e.impact}` : e.impact}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-200">
                  {e.label}
                </div>
                <div className="text-xs text-slate-400">{e.detail}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
