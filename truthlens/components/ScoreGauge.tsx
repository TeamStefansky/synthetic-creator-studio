import type { RiskBand } from "@/lib/types";
import { bandColor } from "@/lib/ui";

/** SVG arc gauge, 0-100 (higher = riskier). */
export default function ScoreGauge({ score, band }: { score: number; band: RiskBand }) {
  const c = bandColor(band);
  const radius = 52;
  const circ = Math.PI * radius; // semicircle
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const dash = circ * pct;

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="84" viewBox="0 0 140 84" role="img" aria-label={`Risk score ${score} of 100`}>
        <path d="M 18 78 A 52 52 0 0 1 122 78" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="12" strokeLinecap="round" />
        <path
          d="M 18 78 A 52 52 0 0 1 122 78"
          fill="none"
          stroke={c.hex}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
        />
        <text x="70" y="70" textAnchor="middle" className="fill-white" fontSize="28" fontWeight="700">
          {score}
        </text>
      </svg>
      <div className="label-muted">Risk score / 100</div>
    </div>
  );
}
