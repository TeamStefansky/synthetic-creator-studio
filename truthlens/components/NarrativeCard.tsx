import { Brain, Megaphone, Users, Target, AlertTriangle, ShieldCheck } from "lucide-react";
import type { Report } from "@/lib/types";

function Chips({ items, tone }: { items: string[]; tone: "neutral" | "warn" }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <span
          key={i}
          className={`rounded-lg border px-2 py-1 text-xs ${
            tone === "warn"
              ? "border-risk-high/30 bg-risk-high/5 text-risk-high/90"
              : "border-white/10 bg-white/[0.03] text-gray-200"
          }`}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

// Authenticity = inverse of coordination likelihood (Cyabra-style framing).
function authenticity(report: Report): { label: string; tone: string; detail: string } {
  const level = report.coordination?.level;
  if (level === "High") return { label: "Coordinated / Inauthentic", tone: "text-risk-high", detail: "Strong coordination signals — likely orchestrated, not organic." };
  if (level === "Medium") return { label: "Mixed", tone: "text-risk-unknown", detail: "Some coordination signals present." };
  return { label: "Likely Organic", tone: "text-risk-legit", detail: "No strong coordination signals detected." };
}

export default function NarrativeCard({ report }: { report: Report }) {
  const c = report.contentAnalysis;
  const auth = authenticity(report);

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-indigo-400" />
          <h2 className="text-lg font-semibold">Narrative Intelligence</h2>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <ShieldCheck className={`h-4 w-4 ${auth.tone}`} />
          <span className={`font-medium ${auth.tone}`} title={auth.detail}>{auth.label}</span>
        </div>
      </div>

      {!c.available ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <AlertTriangle className="h-4 w-4" /> {c.summary}
        </div>
      ) : (
        <div className="space-y-4">
          {c.intent && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="label-muted">Intent</span>
              <span className="rounded-lg bg-indigo-500/15 px-2 py-0.5 font-medium text-indigo-200">{c.intent}</span>
              {c.targetAudience && (
                <>
                  <span className="label-muted ml-2 flex items-center gap-1"><Users className="h-3.5 w-3.5" />Audience</span>
                  <span className="text-gray-300">{c.targetAudience}</span>
                </>
              )}
            </div>
          )}

          {c.narratives.length > 0 && (
            <div>
              <div className="label-muted mb-1.5 flex items-center gap-1"><Megaphone className="h-3.5 w-3.5" />Main narratives</div>
              <ul className="space-y-1 text-sm text-gray-200">
                {c.narratives.map((n, i) => (
                  <li key={i} className="flex gap-2"><span className="text-indigo-400">•</span>{n}</li>
                ))}
              </ul>
            </div>
          )}

          {c.propagandaTechniques.length > 0 && (
            <div>
              <div className="label-muted mb-1.5 flex items-center gap-1"><Target className="h-3.5 w-3.5" />Propaganda techniques</div>
              <Chips items={c.propagandaTechniques} tone="warn" />
            </div>
          )}

          {c.manipulationTactics.length > 0 && (
            <div>
              <div className="label-muted mb-1.5">Manipulation tactics</div>
              <Chips items={c.manipulationTactics} tone="warn" />
            </div>
          )}

          <p className="text-xs text-gray-500">{auth.detail}</p>
        </div>
      )}
    </div>
  );
}
