// Aurora signature: milestone progress curve. A smooth spline on the near-black
// canvas; milestone dots step through the gradient (orange -> magenta -> purple ->
// grey by progress) with dashed vertical gridlines and labels below. Tokens only.

import { GRADIENT_STOPS, TOKENS } from "@/lib/design-tokens";

export interface Milestone {
  label: string;
  state: "done" | "active" | "next";
}

const STEP_COLORS = [GRADIENT_STOPS[0], GRADIENT_STOPS[1], GRADIENT_STOPS[2], TOKENS.textMuted];

export default function ProgressCurve({ milestones }: { milestones: Milestone[] }) {
  const n = milestones.length;
  if (n < 2) return null;
  const W = 1100;
  const H = 200;
  const padX = 24;
  const usableW = W - padX * 2;
  // Points rise left->right as progress advances.
  const pts = milestones.map((_, i) => {
    const x = padX + (usableW * i) / (n - 1);
    const y = H - 24 - ((H - 60) * i) / (n - 1);
    return [x, y] as const;
  });
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const mx = (x0 + x1) / 2;
    d += ` C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`;
  }
  const colorFor = (i: number, state: Milestone["state"]) =>
    state === "next" ? TOKENS.textMuted : STEP_COLORS[Math.min(i, STEP_COLORS.length - 1)];

  return (
    <div className="rounded-2xl border border-line bg-bg-card p-4">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full" style={{ height: 150 }}
        role="img" aria-label="Milestone progress">
        <defs>
          <linearGradient id="pc-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={GRADIENT_STOPS[0]} />
            <stop offset="0.4" stopColor={GRADIENT_STOPS[1]} />
            <stop offset="0.7" stopColor={GRADIENT_STOPS[2]} />
            <stop offset="1" stopColor={TOKENS.textMuted} />
          </linearGradient>
        </defs>
        {pts.map(([x], i) => (
          <line key={`g${i}`} x1={x} y1={10} x2={x} y2={H - 10} stroke={TOKENS.border} strokeWidth={1} strokeDasharray="4 6" />
        ))}
        <path d={d} fill="none" stroke="url(#pc-line)" strokeWidth={2.5} />
        {pts.map(([x, y], i) => {
          const c = colorFor(i, milestones[i].state);
          return (
            <g key={`d${i}`}>
              <circle cx={x} cy={y} r={9} fill={TOKENS.surface} stroke={c} strokeWidth={2.5} />
              {milestones[i].state === "done" && (
                <path d={`M ${x - 3.5} ${y} l 2.5 2.8 l 4.5 -5`} fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex justify-between px-1">
        {milestones.map((m, i) => (
          <div key={i} className="flex-1 text-center">
            <div className={`text-xs font-semibold ${m.state === "next" ? "text-ink-muted" : "text-ink"}`}>{m.label}</div>
            <div className="text-[10px] text-ink-muted">{m.state}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
