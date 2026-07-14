import { ShieldAlert } from "lucide-react";

/**
 * Persistent framing disclaimer. The product surfaces risk INDICATORS with
 * evidence, never a verdict — this must always be visible.
 */
export default function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border border-surface-border bg-surface-card/60 px-3 py-2 text-xs text-slate-400 ${className}`}
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <span>
        <strong className="text-slate-300">
          Decision-support tool — not a verdict.
        </strong>{" "}
        TruthLens surfaces verifiable infrastructure facts and computes a risk
        score from observable signals. Results are indicators only, not
        accusations.
      </span>
    </div>
  );
}
