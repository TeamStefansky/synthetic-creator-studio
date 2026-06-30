import { CENTROIDS, project } from "@/lib/geo-centroids";
import { flagEmoji, countryName } from "@/lib/countries";

export interface MapMarker {
  code: string;
  title: string; // tooltip / label, e.g. "Server", "MX"
}

// Equirectangular mini-map (360x180). Plots a marker per country involved.
export default function MiniMap({ markers }: { markers: MapMarker[] }) {
  const W = 360;
  const H = 180;

  // Group titles per country code so overlapping endpoints share one marker.
  const byCode = new Map<string, string[]>();
  for (const m of markers) {
    const c = m.code?.toUpperCase();
    if (!c || !CENTROIDS[c]) continue;
    if (!byCode.has(c)) byCode.set(c, []);
    byCode.get(c)!.push(m.title);
  }

  const graticule: number[] = [-120, -60, 0, 60, 120];
  const parallels: number[] = [-60, -30, 0, 30, 60];

  if (byCode.size === 0) {
    return <p className="text-sm text-gray-500">No geolocatable endpoints to map.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0a1020]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Origin map">
        {/* ocean */}
        <rect x="0" y="0" width={W} height={H} fill="#0a1020" />
        {/* graticule */}
        {graticule.map((lon) => {
          const [x] = project(0, lon, W, H);
          return <line key={`m${lon}`} x1={x} y1={0} x2={x} y2={H} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />;
        })}
        {parallels.map((lat) => {
          const [, y] = project(lat, 0, W, H);
          return <line key={`p${lat}`} x1={0} y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />;
        })}
        {/* equator slightly brighter */}
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.1)" strokeWidth={0.6} />

        {/* markers */}
        {Array.from(byCode.entries()).map(([code, titles]) => {
          const [lat, lon] = CENTROIDS[code];
          const [x, y] = project(lat, lon, W, H);
          return (
            <g key={code}>
              <circle cx={x} cy={y} r={3.5} fill="#818cf8" stroke="#c7d2fe" strokeWidth={0.8}>
                <title>{`${countryName(code) || code}: ${titles.join(", ")}`}</title>
              </circle>
              <text x={x} y={y - 5} textAnchor="middle" fontSize={9}>
                {flagEmoji(code)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
