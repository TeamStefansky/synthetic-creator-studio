import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import type { RiskBand, Confidence } from "@/lib/types";
import { bandLabel, bandColor } from "@/lib/ui";

export default function VerdictBadge({
  band,
  confidence,
}: {
  band: RiskBand;
  confidence: Confidence;
}) {
  const c = bandColor(band);
  const Icon = band === "HIGH_RISK" ? ShieldAlert : band === "LIKELY_LEGITIMATE" ? ShieldCheck : ShieldQuestion;
  return (
    <div className={`flex items-center gap-3 rounded-xl border ${c.border} ${c.bg} px-4 py-3`}>
      <Icon className={`h-8 w-8 ${c.text}`} />
      <div>
        <div className={`text-xl font-bold ${c.text}`}>{bandLabel(band)}</div>
        <div className="text-xs text-ink-secondary">Confidence: {confidence}</div>
      </div>
    </div>
  );
}
