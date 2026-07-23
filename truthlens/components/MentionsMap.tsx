"use client";

// Interactive world map of brand mentions (MapLibre GL JS, WebGL). One bubble per
// source country at its centroid, sized by mention count, over a keyless CARTO
// dark GL style (no Mapbox token). If WebGL/MapLibre fails to initialise, it
// falls back to a dependency-free inline SVG map so a map ALWAYS renders.
// Country granularity by design - source countries, never a person's location.

import { useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { CountryCount } from "@/lib/mentions-map";

const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function useMapPoints(data: CountryCount[]) {
  return useMemo(
    () => data.filter((d) => typeof d.lat === "number" && typeof d.lon === "number"),
    [data],
  );
}

export default function MentionsMap({ data }: { data: CountryCount[] }) {
  const points = useMapPoints(data);
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (failed) return;
    let map: any;
    let cancelled = false;
    (async () => {
      try {
        const maplibregl: any = await import("maplibre-gl");
        if (cancelled || !ref.current) return;
        const max = Math.max(1, ...points.map((p) => p.count));
        map = new maplibregl.Map({
          container: ref.current,
          style: STYLE,
          center: [10, 25],
          zoom: 1.1,
          attributionControl: { compact: true },
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => {
          map.addSource("mentions", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: points.map((p) => ({
                type: "Feature",
                geometry: { type: "Point", coordinates: [p.lon as number, p.lat as number] },
                properties: {
                  label: `${p.flag ? p.flag + " " : ""}${p.label}`,
                  count: p.count,
                  radius: 6 + (p.count / max) * 30,
                },
              })),
            },
          });
          map.addLayer({
            id: "bubbles",
            type: "circle",
            source: "mentions",
            paint: {
              "circle-radius": ["get", "radius"],
              "circle-color": "rgba(225,128,74,0.5)",
              "circle-stroke-color": "#7F49E1",
              "circle-stroke-width": 1.5,
            },
          });
          map.addLayer({
            id: "counts",
            type: "symbol",
            source: "mentions",
            layout: { "text-field": ["to-string", ["get", "count"]], "text-size": 12, "text-allow-overlap": true },
            paint: { "text-color": "#EBEBEB" },
          });
          const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
          map.on("mouseenter", "bubbles", (e: any) => {
            map.getCanvas().style.cursor = "pointer";
            const f = e.features?.[0];
            if (f) popup.setLngLat(e.lngLat).setText(`${f.properties.label}: ${f.properties.count}`).addTo(map);
          });
          map.on("mouseleave", "bubbles", () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
          });
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      try { map?.remove(); } catch { /* ignore */ }
    };
  }, [points, failed]);

  if (failed) return <WorldSvg points={points} />;

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-white/10" style={{ height: 420, background: "#0a0a12" }}>
      <div ref={ref} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      {points.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded bg-black/60 px-3 py-1 text-center text-xs text-ink-secondary">
          No source reported a country yet - try a brand with press coverage.
        </div>
      )}
    </div>
  );
}

// Dependency-free equirectangular SVG fallback (no WebGL). Always renders.
function WorldSvg({ points }: { points: CountryCount[] }) {
  const W = 960, H = 480;
  const project = (lon: number, lat: number): [number, number] => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
  const max = Math.max(1, ...points.map((p) => p.count));
  const lons: number[] = []; for (let l = -150; l <= 150; l += 30) lons.push(l);
  const lats: number[] = []; for (let l = -60; l <= 60; l += 30) lats.push(l);
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-white/10" style={{ background: "#0a0a12" }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="World map of brand mentions">
        <rect x={0} y={0} width={W} height={H} fill="#0a0a12" />
        <g stroke="rgba(255,255,255,0.06)" strokeWidth={1}>
          {lons.map((lon) => { const [x] = project(lon, 0); return <line key={`o${lon}`} x1={x} y1={0} x2={x} y2={H} />; })}
          {lats.map((lat) => { const [, y] = project(0, lat); return <line key={`a${lat}`} x1={0} y1={y} x2={W} y2={y} />; })}
          <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.12)" />
        </g>
        <g>
          {[...points].sort((a, b) => b.count - a.count).map((p) => {
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
    </div>
  );
}
