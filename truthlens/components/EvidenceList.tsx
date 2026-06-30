import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { EvidenceItem } from "@/lib/types";

export default function EvidenceList({ evidence }: { evidence: EvidenceItem[] }) {
  if (!evidence.length) {
    return <p className="text-sm text-gray-500">No signals produced.</p>;
  }
  return (
    <ul className="space-y-2">
      {evidence.map((e, i) => {
        const positive = e.impact > 0; // risk-increasing
        const neutral = e.impact === 0;
        return (
          <li key={i} className="flex items-start gap-3 rounded-lg border border-white/10 bg-bg-elev p-3">
            <span
              className={`flex h-7 w-12 shrink-0 items-center justify-center gap-0.5 rounded-md text-sm font-semibold ${
                neutral
                  ? "bg-white/5 text-gray-400"
                  : positive
                    ? "bg-risk-high/15 text-risk-high"
                    : "bg-risk-legit/15 text-risk-legit"
              }`}
            >
              {neutral ? <Minus className="h-3.5 w-3.5" /> : positive ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              {!neutral && Math.abs(e.impact)}
            </span>
            <div>
              <div className="font-medium text-gray-100">{e.label}</div>
              <div className="text-sm text-gray-400">{e.detail}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
