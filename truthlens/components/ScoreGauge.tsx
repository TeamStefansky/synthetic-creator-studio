import type { Band } from "@/lib/types";
import { bandStyle } from "./VerdictBadge";

/**
 * Circular 0-100 risk gauge. Higher = higher risk. The arc color follows the
 * band so the number and the verdict always agree visually.
 */
export default function ScoreGauge({
  score,
  band,
}: {
  score: number;
  band: Band;
}) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * circumference;
  const color = bandStyle(band).color;

  return (
    <div className="relative inline-flex h-32 w-32 items-center justify-center">
      <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120" aria-hidden>
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#1f2937"
          strokeWidth="10"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold" style={{ color }}>
          {clamped}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          risk / 100
        </span>
      </div>
    </div>
  );
}
