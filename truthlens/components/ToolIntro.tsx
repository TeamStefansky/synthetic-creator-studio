"use client";

// First-run guidance shown on a tool page before the user's first action.
// One source of truth for onboarding across every tool: a plain-language "what
// this does", optional numbered steps, one-click examples, and a result legend.
// Matches the existing design system (.card, risk-* tones, brand accent).

import type { ReactNode } from "react";

export interface IntroExample {
  label: string;
  onClick: () => void;
}

export interface IntroLegendItem {
  label: string;
  text: string;
  tone?: "legit" | "unknown" | "high" | "neutral";
  icon?: ReactNode;
}

const DOT: Record<string, string> = {
  legit: "bg-risk-legit",
  unknown: "bg-risk-unknown",
  high: "bg-risk-high",
  neutral: "bg-gray-500",
};
const TEXT: Record<string, string> = {
  legit: "text-risk-legit",
  unknown: "text-risk-unknown",
  high: "text-risk-high",
  neutral: "text-gray-200",
};

export default function ToolIntro({
  heading = "New here? Here’s what this does",
  what,
  steps,
  examplesLabel = "Try an example",
  examples,
  legend,
  legendLabel = "How to read the result",
  note,
}: {
  heading?: string;
  what: ReactNode;
  steps?: ReactNode[];
  examplesLabel?: string;
  examples?: IntroExample[];
  legendLabel?: string;
  legend?: IntroLegendItem[];
  note?: ReactNode;
}) {
  return (
    <div className="card space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-white">{heading}</h2>
        <div className="mt-1 max-w-2xl text-sm text-gray-400">{what}</div>
        {steps && steps.length > 0 && (
          <ol className="mt-3 space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-400">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[11px] font-semibold text-gray-300">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {examples && examples.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{examplesLabel}</div>
          <div className="flex flex-wrap gap-2">
            {examples.map((ex) => (
              <button
                key={ex.label}
                onClick={ex.onClick}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-gray-200 transition hover:border-brand hover:bg-white/[0.06]"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {legend && legend.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{legendLabel}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {legend.map((l) => (
              <div key={l.label} className="flex items-start gap-2 rounded-lg border border-white/[0.06] px-3 py-2 text-xs">
                {l.icon ? (
                  <span className="mt-0.5 shrink-0">{l.icon}</span>
                ) : (
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DOT[l.tone || "neutral"]}`} />
                )}
                <span className="text-gray-400">
                  <span className={`font-semibold ${TEXT[l.tone || "neutral"]}`}>{l.label}</span> - {l.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {note && <p className="text-xs text-gray-600">{note}</p>}
    </div>
  );
}
