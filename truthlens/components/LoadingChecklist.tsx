"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Eye } from "lucide-react";

/**
 * Animated loading checklist. Because /api/analyze is a single orchestrated
 * call, we can't stream per-check status, so we simulate a realistic
 * progression of the checks turning from pending -> done while the request is
 * in flight. The list reflects the real lookups being performed server-side.
 */
const CHECKS = [
  "Resolving DNS records",
  "Querying WHOIS / RDAP",
  "Locating hosting & ASN",
  "Reading SSL certificates",
  "Scanning archive history",
  "Fingerprinting tech stack",
  "Mapping operator network",
  "Analyzing content",
];

export default function LoadingChecklist() {
  const [done, setDone] = useState(0);

  useEffect(() => {
    // Advance through checks at a natural pace; hold the last one until the
    // real response replaces this component.
    const timers = CHECKS.map((_, i) =>
      setTimeout(() => setDone((d) => Math.max(d, i + 1)), 500 + i * 650)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 flex items-center justify-center gap-2 text-slate-300">
        <Eye className="h-5 w-5 animate-pulse-ring text-blue-400" />
        <span className="font-medium">Analyzing…</span>
      </div>
      <ul className="space-y-2">
        {CHECKS.map((label, i) => {
          const isDone = i < done;
          const isActive = i === done;
          return (
            <li
              key={label}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                isDone
                  ? "border-emerald-500/20 bg-emerald-500/5 text-slate-300"
                  : isActive
                    ? "border-blue-500/30 bg-blue-500/5 text-slate-200"
                    : "border-surface-border bg-surface-card/40 text-slate-500"
              }`}
            >
              {isDone ? (
                <Check className="h-4 w-4 text-band-green" />
              ) : isActive ? (
                <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
              ) : (
                <div className="h-4 w-4 rounded-full border border-slate-600" />
              )}
              {label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
