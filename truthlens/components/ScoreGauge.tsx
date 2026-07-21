import type { RiskBand } from "@/lib/types";
import { GRADIENT_STOPS, TOKENS, STATUS } from "@/lib/design-tokens";

// Aurora signature: radial tick gauge. A ring of ticks; the filled arc runs the
// signature gradient, remaining ticks sit in surface-2, with the score + label
// in the center. 0-100 (higher = riskier). Tokens only - no raw hex.
const N = 48;
const CX = 80;
const CY = 80;
const R_IN = 54;
const R_OUT = 70;

function bandHex(band: RiskBand): string {
  if (band === "HIGH_RISK") return STATUS.high;
  if (band === "LIKELY_LEGITIMATE") return STATUS.legit;
  return STATUS.unknown;
}

export default function ScoreGauge({ score, band }: { score: number; band: RiskBand }) {
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const filled = Math.round(N * pct);
  const gid = `gauge-grad-${band}`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label={`Risk score ${score} of 100`}>
          <defs>
            <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor={GRADIENT_STOPS[0]} />
              <stop offset="0.5" stopColor={GRADIENT_STOPS[1]} />
              <stop offset="1" stopColor={GRADIENT_STOPS[2]} />
            </linearGradient>
          </defs>
          {Array.from({ length: N }, (_, i) => {
            const a = (-90 + (i * 360) / N) * (Math.PI / 180);
            const x1 = CX + R_IN * Math.cos(a);
            const y1 = CY + R_IN * Math.sin(a);
            const x2 = CX + R_OUT * Math.cos(a);
            const y2 = CY + R_OUT * Math.sin(a);
            return (
              <line
                key={i}
                x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)}
                stroke={i < filled ? `url(#${gid})` : TOKENS.surface2}
                strokeWidth="4.5" strokeLinecap="round"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-display text-4xl font-bold leading-none" style={{ color: bandHex(band) }}>{score}</div>
          <div className="mt-1 text-xs text-ink-muted">/ 100</div>
        </div>
      </div>
      <div className="label-muted mt-1">Risk score</div>
    </div>
  );
}
