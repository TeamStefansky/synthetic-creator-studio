"use client";

// Authenticity panel - per-amplifying-account inauthenticity assessment:
// 0–100 suspicion score + confidence + ranked contributing signals with
// evidence and an innocent alternative. PROBABILISTIC - never a binary
// fake/real label, never an assessment of a person. Bands map onto the
// existing risk tokens; insufficient data renders gray, never red.

import { useEffect } from "react";
import { UserCheck } from "lucide-react";

interface SignalRow {
  key: string; layer: string; weight: number; computed: boolean;
  subscore?: number; contribution?: number;
  evidence?: Record<string, unknown>; alternative: string;
}
export interface AccountAssessment {
  account: string;
  assessment: {
    suspicion_score: number; confidence: number; band: string;
    signals: SignalRow[]; missing_signals: string[];
    assessed_at: string; model_version: string; note: string;
  };
}

const BAND_UI: Record<string, { label: string; chip: string }> = {
  authentic: { label: "Likely authentic", chip: "bg-risk-legit/15 text-risk-legit" },
  low: { label: "Low concern", chip: "bg-risk-unknown/15 text-risk-unknown" },
  elevated: { label: "Elevated - review", chip: "bg-risk-unknown/15 text-risk-unknown" },
  high: { label: "High likelihood inauthentic", chip: "bg-risk-high/15 text-risk-high" },
  insufficient_data: { label: "Insufficient data", chip: "bg-white/[0.06] text-ink-secondary" },
};

const label = (key: string) => key.replace(/_/g, " ");
const fmtEvidence = (e?: Record<string, unknown>) =>
  e ? Object.entries(e).map(([k, v]) => `${label(k)}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" · ") : "";

export default function AuthenticityPanel({ entity, accounts }: { entity: string; accounts: AccountAssessment[] }) {
  // Anonymous-user fallback snapshot (server-side KV snapshot is written by the
  // API route when a store is connected).
  useEffect(() => {
    try {
      localStorage.setItem(
        `tl:auth:${entity.toLowerCase()}`,
        JSON.stringify({ entity, accounts, savedAt: new Date().toISOString() }),
      );
    } catch { /* private mode etc. - non-essential */ }
  }, [entity, accounts]);

  if (!accounts?.length) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <UserCheck className="h-4 w-4" /> Account authenticity
        <span className="text-xs font-normal text-ink-secondary"> - suspicion score per amplifying account, with evidence</span>
      </div>
      <div className="space-y-3">
        {accounts.map(({ account, assessment: a }) => {
          const ui = BAND_UI[a.band] || BAND_UI.insufficient_data;
          const top = a.signals.filter((s) => s.computed && (s.contribution || 0) > 0).slice(0, 5);
          return (
            <div key={account} className="rounded-lg border border-white/[0.06] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-ink">{account}</span>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`rounded px-1.5 py-0.5 font-medium ${ui.chip}`}>{ui.label}</span>
                  {a.band !== "insufficient_data" && (
                    <span className="text-ink-secondary">suspicion {a.suspicion_score}/100</span>
                  )}
                  <span className="text-ink-secondary">confidence {Math.round(a.confidence * 100)}%</span>
                </div>
              </div>
              {top.length > 0 && a.band !== "insufficient_data" && (
                <ul className="mt-2 space-y-1.5">
                  {top.map((s) => (
                    <li key={s.key} className="text-xs">
                      <span className="text-ink">{label(s.key)}</span>
                      <span className="text-ink-secondary"> · +{s.contribution} of {s.weight}</span>
                      {s.evidence && <div className="text-ink-secondary">{fmtEvidence(s.evidence)}</div>}
                      <div className="text-ink-muted">Could also be: {s.alternative}</div>
                    </li>
                  ))}
                </ul>
              )}
              {a.missing_signals.length > 0 && (
                <p className="mt-2 text-[11px] text-ink-muted">
                  {a.missing_signals.length} signal(s) not collected (lowering confidence) - never guessed.
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-secondary">
        Probabilistic indicators about ACCOUNTS - never a claim about a person, and never a verdict. Review the evidence.
      </p>
    </div>
  );
}
