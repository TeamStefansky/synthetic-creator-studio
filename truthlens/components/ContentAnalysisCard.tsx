import { Bot, AlertTriangle, FileText } from "lucide-react";
import type { ContentAnalysis } from "@/lib/types";

/** A single 0-100 meter. For sourcingQuality, higher is GOOD (green); for the
 * others, higher is BAD (red). `invert` flips the color logic. */
function Meter({
  label,
  value,
  invert = false,
}: {
  label: string;
  value: number | null;
  invert?: boolean;
}) {
  const v = value ?? 0;
  // "Bad" share of the bar: high value is bad unless inverted.
  const badness = invert ? 100 - v : v;
  const color =
    badness > 66 ? "#ef4444" : badness > 33 ? "#eab308" : "#22c55e";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-slate-300">
          {value === null ? "—" : `${v}/100`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700/50">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${v}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default function ContentAnalysisCard({
  content,
}: {
  content: ContentAnalysis;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="mb-4 flex items-center gap-2">
        <FileText className="h-5 w-5 text-blue-400" />
        <h3 className="font-semibold text-slate-200">Content analysis</h3>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500">
          <Bot className="h-3.5 w-3.5" />
          Claude
        </span>
      </div>

      {!content.available ? (
        <p className="text-sm text-slate-500">
          Content analysis unavailable. Set <code className="text-slate-400">ANTHROPIC_API_KEY</code>{" "}
          to enable the AI media-literacy layer. The rest of the report is
          unaffected (confidence is lowered accordingly).
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Meter label="Sensationalism" value={content.sensationalism} />
            <Meter
              label="Emotional manipulation"
              value={content.emotionalManipulation}
            />
            <Meter
              label="Sourcing quality"
              value={content.sourcingQuality}
              invert
            />
            <Meter
              label="AI-generation likelihood"
              value={content.aiGeneratedLikelihood}
            />
          </div>

          {content.summary && (
            <p className="mt-4 rounded-lg bg-surface/50 p-3 text-sm text-slate-300">
              {content.summary}
            </p>
          )}

          {content.redFlags.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Red flags
              </div>
              <ul className="space-y-1">
                {content.redFlags.map((flag, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm text-slate-400"
                  >
                    <span className="text-amber-500">•</span>
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
