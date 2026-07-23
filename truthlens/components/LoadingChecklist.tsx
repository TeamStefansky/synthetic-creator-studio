"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

// Neutral phase labels - progress without revealing the underlying sources/methods.
const STEPS = [
  "Collecting site signals",
  "Checking ownership records",
  "Mapping hosting footprint",
  "Validating security setup",
  "Reviewing site history",
  "Inspecting the page",
  "Analyzing content",
  "Scoring & relationships",
];

/** Cosmetic progressive checklist shown while /api/analyze runs. */
export default function LoadingChecklist() {
  const [done, setDone] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setDone((d) => (d < STEPS.length - 1 ? d + 1 : d));
    }, 700);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="card mx-auto max-w-md">
      <h3 className="mb-4 font-semibold">Analyzing…</h3>
      <ul className="space-y-2">
        {STEPS.map((label, i) => {
          const complete = i < done;
          const active = i === done;
          return (
            <li key={label} className="flex items-center gap-3 text-sm">
              {complete ? (
                <Check className="h-4 w-4 text-risk-legit" />
              ) : active ? (
                <Loader2 className="h-4 w-4 animate-spin text-brand-soft" />
              ) : (
                <span className="h-4 w-4 rounded-full border border-white/20" />
              )}
              <span className={complete ? "text-ink" : active ? "text-white" : "text-ink-secondary"}>
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
