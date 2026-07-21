// Small presentation helpers shared across components.

import type { RiskBand } from "./types";

export function bandLabel(band: RiskBand): string {
  switch (band) {
    case "LIKELY_LEGITIMATE":
      return "Likely Legitimate";
    case "HIGH_RISK":
      return "High Risk";
    default:
      return "Unknown";
  }
}

export function bandColor(band: RiskBand): {
  text: string;
  bg: string;
  border: string;
  ring: string;
  hex: string;
} {
  switch (band) {
    case "LIKELY_LEGITIMATE":
      return { text: "text-risk-legit", bg: "bg-risk-legit/10", border: "border-risk-legit/40", ring: "ring-risk-legit", hex: "#22c55e" };
    case "HIGH_RISK":
      return { text: "text-risk-high", bg: "bg-risk-high/10", border: "border-risk-high/40", ring: "ring-risk-high", hex: "#ef4444" };
    default:
      return { text: "text-risk-unknown", bg: "bg-risk-unknown/10", border: "border-risk-unknown/40", ring: "ring-risk-unknown", hex: "#eab308" };
  }
}

export function fmtDate(iso?: string): string {
  if (!iso) return " - ";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}
