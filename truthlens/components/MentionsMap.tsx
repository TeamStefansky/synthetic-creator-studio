"use client";

// World map of brand mentions - dependency-free inline SVG (equirectangular).
// One bubble per source country at its real lat/lon, sized by mention count,
// with a flag + count and a graticule for geographic reference. No WebGL, no
// external tiles - always renders. Country granularity by design: source
// countries, never a person's location.

import { useMemo } from "react";
import type { CountryCount } from "@/lib/mentions-map";

const W = 960, H = 480; // 2:1 equirectangular

// lon [-180,180] -> x [0,W]; lat [90,-90] -> y [0,H].
function project(lon: number, lat: number): [number, number] {
  return [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
}

export default function MentionsMap({ data }: { data: CountryCount[] }) {
  const points = useMemo(
    () => data.filter((d) => typeof d.lat === "number" && typeof d.lon === "number"),
    [data],
  );
  const max = useMemo(() => Math.max(1, ...points.map((p) => p.count)), [points]);

  // Graticule lines every 30 degrees.
  const lons: number[] = [];
  for (let l = -150; l <= 150; l += 30) lons.push(l);
  const lats: number[] = [];
  for (let l = -60; l <= 60; l += 30) lats.push(l);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-white/10" style={{ background: "#0a0a12" }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="World map of brand mentions">
        {/* ocean */}
        <rect x={0} y={0} width={W} height={H} fill="#0a0a12" />

        {/* graticule */}
        <g stroke="rgba(255,255,255,0.06)" strokeWidth={1}>
          {lons.map((lon) => {
            const [x] = project(lon, 0);
            return <line key={`lon${lon}`} x1={x} y1={0} x2={x} y2={H} />;
          })}
          {lats.map((lat) => {
            const [, y] = project(0, lat);
            return <line key={`lat${lat}`} x1={0} y1={y} x2={W} y2={y} />;
          })}
          {/* equator slightly brighter */}
          <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.12)" />
        </g>

        {/* bubbles, largest first so smaller ones stay clickable/visible */}
        <g>
          {[...points]
            .sort((a, b) => b.count - a.count)
            .map((p) => {
              const [x, y] = project(p.lon as number, p.lat as number);
              const r = 6 + (p.count / max) * 30;
              return (
                <g key={p.key}>
                  <title>{`${p.flag ? p.flag + " " : ""}${p.label}: ${p.count}`}</title>
                  <circle cx={x} cy={y} r={r} fill="rgba(225,128,74,0.35)" stroke="#7F49E1" strokeWidth={1.5} />
                  <text x={x} y={y + 4} textAnchor="middle" fontSize={13} fill="#EBEBEB">{p.count}</text>
                </g>
              );
            })}
        </g>
      </svg>

      {points.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-4 text-center text-sm text-ink-secondary">
          No source reported a country for these mentions yet. The map plots source
          countries, which come mainly from news coverage - try a brand with press mentions.
        </div>
      )}
    </div>
  );
}
