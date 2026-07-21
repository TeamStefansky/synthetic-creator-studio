// ConfidenceBadge - REQUIRED wherever an attribution / indicator renders.
// A confidence level is never shown without its evidence (see EvidenceList).

export type ConfidenceLevel = "Low" | "Medium" | "High" | "Unknown";

const TONE: Record<ConfidenceLevel, string> = {
  High: "text-risk-high bg-risk-high/10 border-risk-high/30",
  Medium: "text-risk-unknown bg-risk-unknown/10 border-risk-unknown/30",
  Low: "text-risk-legit bg-risk-legit/10 border-risk-legit/30",
  Unknown: "text-gray-400 bg-white/[0.05] border-white/10",
};

export default function ConfidenceBadge({
  level,
  label,
  className = "",
}: {
  level: ConfidenceLevel;
  label?: string;
  className?: string;
}) {
  const tone = TONE[level] || TONE.Unknown;
  return (
    <span
      title={level === "Unknown" ? "Unknown - no signals; a valid, correct result" : `${level} confidence`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${tone} ${className}`}
    >
      {label ? `${label} · ` : ""}{level}
    </span>
  );
}
