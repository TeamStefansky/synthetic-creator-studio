import { Sparkles, AlertTriangle } from "lucide-react";
import type { ContentAnalysis } from "@/lib/types";

function Meter({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  // invert=true means HIGH is GOOD (e.g. sourcing quality)
  const bad = invert ? value < 40 : value > 60;
  const color = bad ? "bg-risk-high" : value > 40 ? "bg-risk-unknown" : "bg-risk-legit";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-ink-secondary">{label}</span>
        <span className="text-ink">{value}/100</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function ContentAnalysisCard({ data }: { data: ContentAnalysis }) {
  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-brand-soft" />
        <h3 className="font-semibold">Content Analysis</h3>
      </div>
      {!data.available ? (
        <div className="flex items-center gap-2 text-sm text-ink-secondary">
          <AlertTriangle className="h-4 w-4" /> {data.summary}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Meter label="Sensationalism" value={data.sensationalism} />
            <Meter label="Emotional manipulation" value={data.emotionalManipulation} />
            <Meter label="Sourcing quality" value={data.sourcingQuality} invert />
            <Meter label="AI-generated likelihood" value={data.aiGeneratedLikelihood} />
          </div>
          <p className="mt-4 text-sm text-ink">{data.summary}</p>
          {data.redFlags.length > 0 && (
            <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-risk-high/90">
              {data.redFlags.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
