"use client";

// WorldMapCanvas - a small, reusable equirectangular world map. It renders the
// COUNTRIES border set on a canvas (with graticule + pan/zoom) and plots caller-
// supplied markers on an SVG overlay. The projection math is the same approach
// used by SignalGrid (baseXY/project); this component isolates just the map so
// pages that need a geographic view don't each re-implement pan/zoom.
//
// Data only - it never invents a marker. Callers pass real, geolocated points.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COUNTRIES } from "@/lib/geo-borders";

const LAT_TOP = 75;
const LAT_BOT = -56;

export interface WorldMarker {
  id: string;
  lat: number;
  lon: number;
  color: string;
  /** marker radius in px (default 3.4) */
  r?: number;
  /** optional ring color drawn around the dot (earliest / infrastructure pins) */
  ring?: string;
  /** shape: "dot" (default) or "pin" (diamond, for infrastructure origins) */
  shape?: "dot" | "pin";
  label?: string;
  title?: string;
}

interface Tf { k: number; tx: number; ty: number }

export default function WorldMapCanvas({
  markers,
  onSelect,
  selectedId,
  height = 440,
  showLabelsFrom = 2.6,
}: {
  markers: WorldMarker[];
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  height?: number;
  showLabelsFrom?: number;
}) {
  const [dims, setDims] = useState({ vw: 0, vh: 0 });
  const [tf, setTf] = useState<Tf>({ k: 1, tx: 0, ty: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const baseXY = useCallback(
    (lat: number, lon: number): [number, number] => {
      const cl = Math.max(LAT_BOT, Math.min(LAT_TOP, lat));
      const wl = ((lon + 540) % 360) - 180;
      return [((wl + 180) / 360) * dims.vw, ((LAT_TOP - cl) / (LAT_TOP - LAT_BOT)) * dims.vh];
    },
    [dims],
  );
  const project = useCallback(
    (lat: number, lon: number): [number, number] => {
      const [bx, by] = baseXY(lat, lon);
      return [bx * tf.k + tf.tx, by * tf.k + tf.ty];
    },
    [baseXY, tf],
  );
  const clampTf = useCallback(
    (t: Tf): Tf => {
      const k = Math.max(1, Math.min(24, t.k));
      return {
        k,
        tx: Math.min(0, Math.max(dims.vw - dims.vw * k, t.tx)),
        ty: Math.min(0, Math.max(dims.vh - dims.vh * k, t.ty)),
      };
    },
    [dims],
  );
  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      setTf((prev) => {
        const k2 = Math.max(1, Math.min(24, prev.k * factor));
        return clampTf({ k: k2, tx: px - ((px - prev.tx) * k2) / prev.k, ty: py - ((py - prev.ty) * k2) / prev.k });
      });
    },
    [clampTf],
  );

  // Keep dims in sync with the stage.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      setDims((d) => (rect.width !== d.vw || rect.height !== d.vh ? { vw: rect.width, vh: rect.height } : d));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // Canvas paint - graticule + country borders (rAF-throttled).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dims.vw === 0) return;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const vw = dims.vw, vh = dims.vh;
      const dpr = window.devicePixelRatio || 1;
      const pw = Math.round(vw * dpr), ph = Math.round(vh * dpr);
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vw, vh);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      const gstep = tf.k >= 6 ? 10 : tf.k >= 2.5 ? 15 : 30;
      for (let lon = -180; lon <= 180; lon += gstep) {
        const [x] = project(0, lon);
        if (x < -2 || x > vw + 2) continue;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, vh); ctx.stroke();
      }
      for (let lat = -50; lat <= 70; lat += gstep) {
        const [, y] = project(lat, 0);
        if (y < -2 || y > vh + 2) continue;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(vw, y); ctx.stroke();
      }
      ctx.lineJoin = "round";
      for (const c of COUNTRIES) {
        ctx.beginPath();
        for (const ring of c.p) {
          for (let i = 0; i < ring.length; i++) {
            const [x, y] = project(ring[i][1], ring[i][0]);
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.closePath();
        }
        ctx.fillStyle = "#131318";
        ctx.fill();
        ctx.strokeStyle = "#37373A";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    };
    raf = requestAnimationFrame(paint);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [dims, tf, project]);

  // Pan / zoom.
  useEffect(() => {
    const mz = zoneRef.current;
    if (!mz) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = mz.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.25 : 0.8);
    };
    mz.addEventListener("wheel", onWheel, { passive: false });
    let last: [number, number] | null = null;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".wm-marker") || t.closest(".wm-ctl")) return;
      dragging.current = false;
      last = [e.clientX, e.clientY];
      mz.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!last) return;
      const dx = e.clientX - last[0], dy = e.clientY - last[1];
      if (Math.abs(dx) + Math.abs(dy) > 2) dragging.current = true;
      if (dragging.current) setTf((prev) => clampTf({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }));
      last = [e.clientX, e.clientY];
    };
    const onUp = () => {
      last = null;
      if (dragging.current) setTimeout(() => { dragging.current = false; }, 40);
    };
    mz.addEventListener("pointerdown", onDown);
    mz.addEventListener("pointermove", onMove);
    mz.addEventListener("pointerup", onUp);
    mz.addEventListener("pointercancel", onUp);
    return () => {
      mz.removeEventListener("wheel", onWheel);
      mz.removeEventListener("pointerdown", onDown);
      mz.removeEventListener("pointermove", onMove);
      mz.removeEventListener("pointerup", onUp);
      mz.removeEventListener("pointercancel", onUp);
    };
  }, [zoomAt, clampTf]);

  const placed = useMemo(() => {
    if (dims.vw === 0) return [];
    return markers.map((m) => {
      const [x, y] = project(m.lat, m.lon);
      return { m, x, y };
    });
  }, [markers, project, dims]);

  return (
    <div
      ref={zoneRef}
      className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40"
      style={{ height, touchAction: "none" }}
    >
      <div className="absolute inset-0" ref={stageRef}>
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {dims.vw > 0 && (
          <svg className="absolute inset-0" width={dims.vw} height={dims.vh} viewBox={`0 0 ${dims.vw} ${dims.vh}`}>
            {placed.map(({ m, x, y }) => {
              const r = m.r ?? 3.4;
              const sel = selectedId === m.id;
              return (
                <g
                  key={m.id}
                  className="wm-marker"
                  transform={`translate(${x},${y})`}
                  style={{ cursor: onSelect ? "pointer" : "default" }}
                  onClick={(e) => { e.stopPropagation(); if (!dragging.current) onSelect?.(m.id); }}
                >
                  {m.title && <title>{m.title}</title>}
                  {m.ring && (
                    <circle r={r + 4} fill="none" stroke={m.ring} strokeWidth={1.6} strokeDasharray="2 2" />
                  )}
                  {m.shape === "pin" ? (
                    <rect
                      x={-r} y={-r} width={r * 2} height={r * 2}
                      transform="rotate(45)" fill={m.color} stroke="#050506" strokeWidth={1.2}
                    />
                  ) : (
                    <circle r={sel ? r + 1.6 : r} fill={m.color} stroke="#050506" strokeWidth={1.2} />
                  )}
                  {m.label && tf.k >= showLabelsFrom && (
                    <text
                      y={r + 12} textAnchor="middle"
                      style={{ fontSize: 9, fill: "rgba(229,231,235,0.9)", paintOrder: "stroke", stroke: "#050506", strokeWidth: 2 }}
                    >
                      {m.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div className="wm-ctl absolute bottom-2 right-2 flex flex-col gap-1">
        <button aria-label="Zoom in" className="grid h-7 w-7 place-items-center rounded-md border border-white/15 bg-black/60 text-sm text-ink-secondary hover:text-white" onClick={() => zoomAt(dims.vw / 2, dims.vh / 2, 1.5)}>+</button>
        <button aria-label="Zoom out" className="grid h-7 w-7 place-items-center rounded-md border border-white/15 bg-black/60 text-sm text-ink-secondary hover:text-white" onClick={() => zoomAt(dims.vw / 2, dims.vh / 2, 0.66)}>−</button>
        <button aria-label="Reset view" className="grid h-7 w-7 place-items-center rounded-md border border-white/15 bg-black/60 text-xs text-ink-secondary hover:text-white" onClick={() => setTf({ k: 1, tx: 0, ty: 0 })}>⌂</button>
      </div>
    </div>
  );
}
