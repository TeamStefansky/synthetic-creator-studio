import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import type { Band, Confidence } from "@/lib/types";

/** Visual style + icon for each risk band. */
export function bandStyle(band: Band) {
  switch (band) {
    case "LIKELY LEGITIMATE":
      return {
        color: "#22c55e",
        text: "text-band-green",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/30",
        ring: "ring-emerald-500/30",
      };
    case "HIGH RISK":
      return {
        color: "#ef4444",
        text: "text-band-red",
        bg: "bg-red-500/10",
        border: "border-red-500/30",
        ring: "ring-red-500/30",
      };
    default:
      return {
        color: "#eab308",
        text: "text-band-yellow",
        bg: "bg-amber-500/10",
        border: "border-amber-500/30",
        ring: "ring-amber-500/30",
      };
  }
}

export default function VerdictBadge({
  band,
  confidence,
}: {
  band: Band;
  confidence: Confidence;
}) {
  const s = bandStyle(band);
  const Icon =
    band === "LIKELY LEGITIMATE"
      ? ShieldCheck
      : band === "HIGH RISK"
        ? ShieldAlert
        : ShieldQuestion;

  return (
    <div
      className={`inline-flex items-center gap-3 rounded-2xl border ${s.border} ${s.bg} px-5 py-3`}
    >
      <Icon className={`h-8 w-8 ${s.text}`} />
      <div>
        <div className={`text-lg font-bold leading-tight ${s.text}`}>{band}</div>
        <div className="text-xs text-slate-400">
          Confidence: <span className="font-medium text-slate-300">{confidence}</span>
        </div>
      </div>
    </div>
  );
}
