"use client";

// SIGNAL - Brand Intelligence Grid (v2 console). A faithful port of the
// uploaded dashboard's second revision - country borders, pan/zoom, GEO panel,
// narrative ROUTES web and a NETWORK cluster view - wired to TruthLens'
// server-side APIs instead of client-side LLM calls:
//   - mentions/sentiment/narratives: GET /api/mentions (real collection; AI
//     layers classify COLLECTED data server-side, never invent it),
//   - trend vectors: GET /api/signal-context (Wikipedia pageviews + GDELT
//     tone - real keyless series; direction computed, never asked),
//   - NETWORK: real accounts/outlets from the collected mentions grouped by
//     narrative thread (lib/signal-network) - the uploaded version's
//     "LLM invents named actors + DRILL" is prohibited (rules 1, 4) and is
//     NOT ported; edges are dashed co-behavior signals, never interactions.
// Country granularity by design - the outlet's country, never a person's.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSignal,
  isoDate,
  NARR_COLORS,
  outletName,
  resolveThreads,
  TYPE_COLORS,
  type MentionsApiResponse,
  type SignalData,
  type SignalMention,
} from "@/lib/signal";
import type { MentionSourceType } from "@/lib/mentions-map";
import type { NarrativeThread } from "@/lib/signal-narratives";
import type { ContextSignal, SignalContext } from "@/lib/signal-context";
import { buildSourceNetwork, type NetworkNode } from "@/lib/signal-network";
import { anomalyReport, type SeriesAnomaly } from "@/lib/signal-anomaly";
import { borderByName, COUNTRIES, type BorderCountry } from "@/lib/geo-borders";
import { countryName } from "@/lib/countries";

type Filter = "all" | MentionSourceType;
type View = "map" | "web" | "net";

const LAT_TOP = 75;
const LAT_BOT = -56;

// Neutral recon labels - progress without revealing the underlying sources.
const RECON_STEPS = [
  "Tasking recon on target brand…",
  "Sweeping public news & press…",
  "Listening across social & community sources…",
  "Geolocating mention clusters…",
  "Classifying sentiment on collected mentions…",
  "Clustering narrative threads…",
];

const SENT_ICON: Record<string, string> = { pos: "▲", neg: "▼", neu: "■" };

interface Tf { k: number; tx: number; ty: number }

function borderOf(country?: string): BorderCountry | null {
  const c = (country || "").trim();
  if (!c) return null;
  if (/^[A-Za-z]{2}$/.test(c)) return borderByName(countryName(c.toUpperCase()) || "");
  return borderByName(c);
}

export default function SignalGrid({ initialEntity = "" }: { initialEntity?: string }) {
  const [entity, setEntity] = useState(initialEntity);
  const [data, setData] = useState<SignalData | null>(null);
  const [context, setContext] = useState<SignalContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState(-1);
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [narrSel, setNarrSel] = useState(-1);
  const [view, setView] = useState<View>("map");
  const [step, setStep] = useState(0);
  const [pane, setPane] = useState<"left" | "right">("left");
  const [dims, setDims] = useState({ vw: 0, vh: 0 });
  const [tf, setTf] = useState<Tf>({ k: 1, tx: 0, ty: 0 });
  const [reduceMotion, setReduceMotion] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const mapzoneRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const dragging = useRef(false);

  // ---- projection ---------------------------------------------------------
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
  const zoomToBBox = useCallback(
    (bb: [number, number, number, number]) => {
      const [ax, ay] = baseXY(bb[3], bb[0]);
      const [bx, by] = baseXY(bb[1], bb[2]);
      const w = Math.max(8, bx - ax);
      const h = Math.max(8, by - ay);
      const k = Math.max(1, Math.min(24, Math.min(dims.vw / w, dims.vh / h) * 0.55));
      setTf(clampTf({ k, tx: dims.vw / 2 - (ax + w / 2) * k, ty: dims.vh / 2 - (ay + h / 2) * k }));
      if (view === "net") setView("map");
    },
    [baseXY, clampTf, dims, view],
  );

  // ---- data ----------------------------------------------------------------
  const scan = useCallback(async (value?: string) => {
    const e = (value ?? entity).trim();
    if (e.length < 2) return;
    setLoading(true);
    setError("");
    setSelected(-1);
    setSelectedNode(null);
    setNarrSel(-1);
    setFilter("all");
    setView("map");
    setStep(0);
    try {
      const ctxPromise = fetch(`/api/signal-context?entity=${encodeURIComponent(e)}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      const r = await fetch(`/api/mentions?entity=${encodeURIComponent(e)}&sentiment=1&narratives=1`);
      const txt = await r.text();
      let json: MentionsApiResponse & { error?: string };
      try {
        json = JSON.parse(txt);
      } catch {
        throw new Error(txt.slice(0, 160) || "unreadable response");
      }
      if (!r.ok) throw new Error(json.error || `scan failed (${r.status})`);
      setData(buildSignal(json));
      setContext(await ctxPromise);
    } catch (err: any) {
      setError(err?.message || "scan failed");
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    if (initialEntity && initialEntity.trim().length >= 2) scan(initialEntity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) return;
    setStep(0);
    const id = setInterval(() => setStep((s) => Math.min(s + 1, RECON_STEPS.length - 1)), 900);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // ---- derived models -------------------------------------------------------
  const threads = useMemo<NarrativeThread[]>(() => (data ? resolveThreads(data) : []), [data]);

  const threadOf = useCallback(
    (idx: number): number => {
      for (let i = 0; i < threads.length; i++) if (threads[i].mentions.includes(idx)) return i;
      return -1;
    },
    [threads],
  );
  const inThread = useCallback(
    (idx: number) => narrSel < 0 || (threads[narrSel]?.mentions.includes(idx) ?? true),
    [narrSel, threads],
  );
  const passesFilter = useCallback(
    (m: SignalMention) => filter === "all" || m.sourceType === filter,
    [filter],
  );

  const visible = useMemo<SignalMention[]>(
    () => (data ? data.mentions.filter(passesFilter) : []),
    [data, passesFilter],
  );

  // Screen positions for every geolocated mention (stable across filters);
  // stacked coordinates spiral out so co-located mentions stay clickable.
  const positions = useMemo(() => {
    const pos = new Map<number, [number, number]>();
    if (!data || dims.vw === 0) return pos;
    const seen = new Map<string, number>();
    data.mentions.forEach((m, idx) => {
      if (typeof m.lat !== "number" || typeof m.lon !== "number") return;
      const key = `${m.lat.toFixed(1)},${m.lon.toFixed(1)}`;
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      let [x, y] = project(m.lat, m.lon);
      if (n > 1) {
        const a = n * 2.4;
        x += Math.cos(a) * 8 * Math.ceil((n - 1) / 3);
        y += Math.sin(a) * 8 * Math.ceil((n - 1) / 3);
      }
      pos.set(idx, [x, y]);
    });
    return pos;
  }, [data, dims, project]);

  // Country highlights - dominant narrative color per country (real countries
  // from the mentions' reported source country).
  const highlights = useMemo(() => {
    const agg = new Map<string, { color: string; count: number }>();
    if (!data) return agg;
    const votes = new Map<string, Map<number, number>>();
    data.mentions.forEach((m, idx) => {
      if (!m.country || !passesFilter(m) || !inThread(idx)) return;
      const border = borderOf(m.country);
      if (!border) return;
      const v = votes.get(border.n) || new Map<number, number>();
      const t = threadOf(idx);
      v.set(t, (v.get(t) || 0) + 1);
      votes.set(border.n, v);
    });
    for (const [name, v] of votes) {
      let best = -1, bn = 0, total = 0;
      for (const [t, c] of v) { total += c; if (c > bn) { bn = c; best = t; } }
      agg.set(name, { color: best >= 0 ? NARR_COLORS[best % NARR_COLORS.length] : "#A98BF0", count: total });
    }
    return agg;
  }, [data, passesFilter, inThread, threadOf]);

  // NETWORK graph - real accounts only (see lib/signal-network).
  const network = useMemo(() => (data ? buildSourceNetwork(data.mentions, threads) : null), [data, threads]);
  const netLayout = useMemo(() => {
    if (!network || dims.vw === 0) return null;
    const C = Math.max(1, threads.length);
    const cx = dims.vw / 2, cy = dims.vh / 2, R = Math.min(dims.vw, dims.vh) * 0.3;
    const anchors: [number, number][] = [];
    for (let i = 0; i < C; i++) {
      const a = (i / C) * Math.PI * 2 - Math.PI / 2;
      anchors.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
    const nodes = network.nodes.map((n, i) => {
      const [ax, ay] = n.community >= 0 ? anchors[n.community] : [cx, cy];
      const a = (i * 2.4) % (Math.PI * 2), rr = 20 + (i % 9) * 7;
      return {
        ...n,
        x: ax + Math.cos(a) * rr, y: ay + Math.sin(a) * rr, vx: 0, vy: 0,
        r: 2.5 + Math.min(5, n.count) * 1.3,
      };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const edges = network.edges
      .map((e) => ({ s: byId.get(e.a)!, t: byId.get(e.b)!, community: e.community }))
      .filter((e) => e.s && e.t);
    const PAD = 40;
    for (let tick = 0; tick < 300; tick++) {
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          const d2 = dx * dx + dy * dy || 1;
          if (d2 > 22000) continue;
          const d = Math.sqrt(d2), f = 520 / d2;
          dx /= d; dy /= d;
          a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
        }
      edges.forEach((e) => {
        let dx = e.t.x - e.s.x, dy = e.t.y - e.s.y;
        const d = Math.hypot(dx, dy) || 1, f = (d - 42) * 0.02;
        dx /= d; dy /= d;
        e.s.vx += dx * f; e.s.vy += dy * f; e.t.vx -= dx * f; e.t.vy -= dy * f;
      });
      nodes.forEach((n) => {
        const [ax, ay] = n.community >= 0 ? anchors[n.community] : [cx, cy];
        n.vx += (ax - n.x) * 0.012;
        n.vy += (ay - n.y) * 0.012;
        n.vx *= 0.82; n.vy *= 0.82;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(PAD, Math.min(dims.vw - PAD, n.x));
        n.y = Math.max(PAD, Math.min(dims.vh - PAD, n.y));
      });
    }
    return { nodes, edges };
  }, [network, threads, dims]);

  // GEO rows - real countries with the accounts/outlets reporting from them.
  const geoRows = useMemo(() => {
    if (!data) return [];
    type GeoGroup = {
      display: string; flag: string; border: BorderCountry | null; count: number;
      votes: Map<number, number>; items: { idx: number; source: string; account?: string }[];
    };
    const groups = new Map<string, GeoGroup>();
    data.mentions.forEach((m, idx) => {
      if (!passesFilter(m) || !inThread(idx)) return;
      const key = (m.country || "").trim();
      if (!key) return;
      const g: GeoGroup = groups.get(key) || {
        display: /^[A-Za-z]{2}$/.test(key) ? countryName(key.toUpperCase()) || key : key,
        flag: "", border: borderOf(key), count: 0, votes: new Map(), items: [],
      };
      g.count++;
      const t = threadOf(idx);
      if (t >= 0) g.votes.set(t, (g.votes.get(t) || 0) + 1);
      g.items.push({ idx, source: m.source, account: m.account });
      groups.set(key, g);
    });
    return [...groups.values()].sort((a, b) => b.count - a.count).map((g) => {
      let best = -1, bn = 0;
      for (const [t, c] of g.votes) if (c > bn) { bn = c; best = t; }
      return { ...g, color: best >= 0 ? NARR_COLORS[best % NARR_COLORS.length] : "var(--sg-accent)" };
    });
  }, [data, passesFilter, inThread, threadOf]);

  // ROUTES web - hub per narrative thread at the centroid of its signals.
  const web = useMemo(() => {
    if (!data || dims.vw === 0 || !threads.length) return [];
    const hubs: { ni: number; x: number; y: number; color: string; name: string; note: string; arcs: { mi: number; d: string }[] }[] = [];
    threads.forEach((t, i) => {
      const pts = t.mentions
        .map((mi) => (positions.has(mi) ? { mi, x: positions.get(mi)![0], y: positions.get(mi)![1] } : null))
        .filter(Boolean) as { mi: number; x: number; y: number }[];
      if (!pts.length) return;
      let hx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      let hy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      hubs.forEach((h) => {
        const dx = hx - h.x, dy = hy - h.y, d = Math.hypot(dx, dy);
        if (d < 60) { const f = (60 - d + 8) / (d || 1); hx += dx * f; hy += dy * f; }
      });
      hx = Math.max(60, Math.min(dims.vw - 60, hx));
      hy = Math.max(34, Math.min(dims.vh - 24, hy));
      const arcs = pts.map((p) => {
        const mx = (hx + p.x) / 2, my = (hy + p.y) / 2;
        const dx = p.x - hx, dy = p.y - hy, d = Math.hypot(dx, dy) || 1;
        const lift = Math.min(70, d * 0.22);
        const cx2 = mx - (dy / d) * lift, cy2 = my + (dx / d) * lift - lift * 0.4;
        return { mi: p.mi, d: `M ${hx.toFixed(1)} ${hy.toFixed(1)} Q ${cx2.toFixed(1)} ${cy2.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}` };
      });
      hubs.push({ ni: i, x: hx, y: hy, color: NARR_COLORS[i % NARR_COLORS.length], name: t.name, note: t.note, arcs });
    });
    return hubs;
  }, [data, threads, positions, dims]);

  // ---- canvas: keep dims in sync with the stage (stable observer) -----------
  // Measurement is isolated from painting so it registers ONCE - a pan/zoom
  // (which only changes tf) never tears down and re-registers the observer.
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

  // ---- canvas: borders + graticule + highlights (rAF-throttled paint) --------
  // The heavy work (re-tracing ~170 country polygons) is scheduled on an
  // animation frame, so the many setTf updates a single drag emits coalesce
  // into one repaint per frame instead of one per pointermove event.
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
      // graticule (denser as you zoom)
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
      // country borders; highlighted countries tinted by dominant narrative
      ctx.lineJoin = "round";
      for (const c of COUNTRIES) {
        const [x0, y0] = project(c.bb[3], c.bb[0]);
        const [x1, y1] = project(c.bb[1], c.bb[2]);
        if (x1 < -8 || x0 > vw + 8 || y1 < -8 || y0 > vh + 8) continue;
        const h = highlights.get(c.n);
        ctx.beginPath();
        for (const ring of c.p) {
          for (let i = 0; i < ring.length; i++) {
            const [x, y] = project(ring[i][1], ring[i][0]);
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.closePath();
        }
        ctx.fillStyle = h ? h.color + "1F" : "#131318";
        ctx.fill();
        ctx.strokeStyle = h ? h.color + "90" : "#37373A";
        ctx.lineWidth = h ? 1.2 : 0.8;
        ctx.stroke();
      }
    };
    raf = requestAnimationFrame(paint);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [dims, tf, project, highlights]);

  // ---- pan / zoom interactions ----------------------------------------------
  useEffect(() => {
    const mz = mapzoneRef.current;
    if (!mz) return;
    const onWheel = (e: WheelEvent) => {
      if (view === "net") return;
      e.preventDefault();
      const r = mz.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.25 : 0.8);
    };
    mz.addEventListener("wheel", onWheel, { passive: false });

    const pts = new Map<number, [number, number]>();
    let lastMid: [number, number] | null = null;
    let lastDist = 0;
    const onDown = (e: PointerEvent) => {
      if (view === "net") return;
      const t = e.target as HTMLElement;
      if (t.closest(".sg-detail") || t.closest(".sg-viewtog") || t.closest(".sg-zoomctl")) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      dragging.current = false;
      lastMid = null;
      mz.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const arr = [...pts.values()];
      const r = mz.getBoundingClientRect();
      if (arr.length === 1) {
        const [x, y] = arr[0];
        if (lastMid) {
          const dx = x - lastMid[0], dy = y - lastMid[1];
          if (Math.abs(dx) + Math.abs(dy) > 2) dragging.current = true;
          if (dragging.current) setTf((prev) => clampTf({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }));
        }
        lastMid = [x, y];
      } else if (arr.length === 2) {
        dragging.current = true;
        const mid: [number, number] = [(arr[0][0] + arr[1][0]) / 2 - r.left, (arr[0][1] + arr[1][1]) / 2 - r.top];
        const dist = Math.hypot(arr[0][0] - arr[1][0], arr[0][1] - arr[1][1]);
        if (lastDist) zoomAt(mid[0], mid[1], dist / lastDist);
        lastDist = dist;
      }
    };
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      lastMid = null;
      lastDist = 0;
      if (dragging.current) setTimeout(() => { dragging.current = false; }, 50);
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
  }, [view, zoomAt, clampTf]);

  const selectMention = (idx: number, fromMap: boolean) => {
    if (dragging.current) return;
    setSelectedNode(null);
    setSelected(idx);
    if (fromMap) cardRefs.current[idx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const selMention = selected >= 0 ? data?.mentions[selected] : undefined;
  const detailPos = useMemo(() => {
    if (!selMention || typeof selMention.lat !== "number" || dims.vw === 0) return null;
    let [x, y] = project(selMention.lat, selMention.lon as number);
    x = Math.min(Math.max(10, x + 14), Math.max(10, dims.vw - 300));
    y = Math.min(Math.max(10, y - 20), Math.max(10, dims.vh - 190));
    return { x, y };
  }, [selMention, dims, project]);

  const maxType = Math.max(1, ...(data?.byType.map((t) => t.count) || [1]));

  // Anomaly watch - rolling z-score over the real series (volume + context).
  const anomalies = useMemo<SeriesAnomaly[]>(() => {
    if (!data) return [];
    return anomalyReport(data.mentions, context?.signals || []);
  }, [data, context]);
  const firstAnomaly = anomalies.find((a) => a.status === "spike" || a.status === "drop");

  // ---------------------------------------------------------------------------
  return (
    <div className="sg">
      <style>{CSS}</style>
      <div className="sg-app">
        {/* ---- header ---- */}
        <header className="sg-header">
          <div className="sg-brandmark">
            <b>SIGNAL</b>
            <span>BRAND INTELLIGENCE GRID</span>
          </div>
          <form className="sg-searchwrap" onSubmit={(e) => { e.preventDefault(); scan(); }}>
            <input
              className="sg-q" dir="auto" value={entity}
              onChange={(e) => setEntity(e.target.value)}
              placeholder="Enter a brand or term — e.g. Wolt, Nike, Monday.com"
              autoComplete="off" aria-label="Brand or term to scan"
            />
            <button className="sg-go" type="submit" disabled={loading || entity.trim().length < 2}>
              {loading ? "SCANNING" : "SCAN"}
            </button>
          </form>
          <div className="sg-status">
            {loading ? (
              <>SCANNING <span className="sg-live">●</span></>
            ) : data ? (
              <>TARGET: <span style={{ color: "var(--sg-accent)" }}>{(data.entity || "").toUpperCase()}</span> · <span className="sg-live">LIVE</span></>
            ) : ("STANDBY")}
          </div>
        </header>

        {/* ---- left: signal feed ---- */}
        <aside className={`sg-left ${pane === "left" ? "sg-show" : ""}`}>
          <div className="sg-ph">
            <i />SIGNAL FEED
            <span style={{ marginLeft: "auto", color: "var(--sg-accent)" }}>
              {data ? `${visible.length}/${data.mentions.length}` : ""}
            </span>
          </div>
          <div className="sg-chips">
            {(["all", "news", "social", "forum", "video"] as Filter[]).map((t) => (
              <button key={t} className={`sg-chip ${filter === t ? "sg-on" : ""}`} data-t={t} onClick={() => setFilter(t)}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="sg-scroll">
            {!data ? (
              <div className="sg-empty">
                Run a scan to populate the signal feed. Every card is a real public mention pulled from
                connected sources and geolocated on the grid.
              </div>
            ) : visible.length === 0 ? (
              <div className="sg-empty">No signals match this filter.</div>
            ) : (
              visible.map((m) => {
                const idx = data.mentions.indexOf(m);
                const dimmed = !inThread(idx);
                return (
                  <div
                    key={idx}
                    ref={(el) => { cardRefs.current[idx] = el; }}
                    className={`sg-m ${selected === idx ? "sg-sel" : ""}`}
                    style={dimmed ? { opacity: 0.28 } : undefined}
                    role="button" tabIndex={0}
                    onClick={() => selectMention(idx, false)}
                    onKeyDown={(e) => { if (e.key === "Enter") selectMention(idx, false); }}
                  >
                    <div className="sg-src">
                      <span className={`sg-t sg-t-${m.sourceType}`}>{m.sourceType.toUpperCase()}</span>
                      <span style={{ color: "var(--sg-dim)" }}>{m.source}</span>
                      <span className="sg-geo">{m.country || ""}</span>
                    </div>
                    <h4 dir="auto">{m.title}</h4>
                    {m.snippet && <p dir="auto">{m.snippet}</p>}
                    <div className="sg-foot">
                      <span>{m.date}</span>
                      {m.account && <span>· {m.account}</span>}
                      {m.sentiment && (
                        <span className={`sg-s${m.sentiment}`}
                          title={`sentiment: ${m.sentiment} (confidence ${Math.round((m.sentimentConfidence || 0) * 100)}%)`}
                          style={{ marginLeft: "auto" }}>
                          {SENT_ICON[m.sentiment]} {m.sentiment}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ---- map zone ---- */}
        <div
          ref={mapzoneRef}
          className="sg-mapzone"
          onClick={(e) => {
            if (dragging.current) return;
            const t = e.target as HTMLElement;
            if (t.closest(".sg-detail") || t.closest(".sg-marker") || t.closest(".sg-wn") || t.closest(".sg-nnode")) return;
            setSelected(-1); setSelectedNode(null);
          }}
        >
          <div className="sg-stage" ref={stageRef}>
            <canvas ref={canvasRef} className="sg-canvas" style={{ display: view === "net" ? "none" : undefined }} />
            {view !== "net" && <div className="sg-sweep" />}

            {/* markers */}
            {view !== "net" && dims.vw > 0 && (
              <svg className="sg-overlay" viewBox={`0 0 ${dims.vw} ${dims.vh}`}>
                {visible.map((m) => {
                  const idx = data!.mentions.indexOf(m);
                  const pos = positions.get(idx);
                  if (!pos) return null;
                  const col = TYPE_COLORS[m.sourceType] || "#A98BF0";
                  const dimmed = !inThread(idx);
                  return (
                    <g key={idx} className="sg-marker" transform={`translate(${pos[0]},${pos[1]})`}
                      opacity={dimmed ? 0.18 : 1}
                      onClick={(e) => { e.stopPropagation(); selectMention(idx, true); }}>
                      <circle className="sg-pulse" r={7} fill="none" stroke={col} strokeWidth={1.4}
                        style={{ animationDelay: `${(idx % 5) * 0.35}s` }} />
                      <circle r={selected === idx ? 5 : 3.4} fill={col} stroke="#050506" strokeWidth={1.2} />
                      {view === "map" && tf.k >= 2.6 && (
                        <text className="sg-mlabel" y={16} textAnchor="middle">
                          {outletName(m.source, m.account)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}

            {/* ROUTES web - hubs + animated arcs to each signal */}
            {view === "web" && dims.vw > 0 && (
              <svg className="sg-overlay sg-web" viewBox={`0 0 ${dims.vw} ${dims.vh}`}>
                {web.map((h) => (
                  <g key={h.ni} opacity={narrSel < 0 || narrSel === h.ni ? 1 : 0.12}>
                    {h.arcs.map((a, ai) => {
                      const on = inThread(a.mi) && passesFilter(data!.mentions[a.mi]);
                      const id = `sg-arc-${h.ni}-${ai}`;
                      return (
                        <g key={id} opacity={on ? 1 : 0.1}>
                          <path id={id} className="sg-arc" d={a.d} stroke={h.color} strokeWidth={1.1} opacity={0.5} />
                          {!reduceMotion && (
                            <circle r={2} fill={h.color}>
                              <animateMotion dur={`${(2.8 + (a.mi % 5) * 0.8).toFixed(1)}s`} repeatCount="indefinite" rotate="auto">
                                <mpath href={`#${id}`} />
                              </animateMotion>
                            </circle>
                          )}
                        </g>
                      );
                    })}
                    <g className="sg-wn" transform={`translate(${h.x},${h.y})`}
                      onClick={(e) => { e.stopPropagation(); setNarrSel(narrSel === h.ni ? -1 : h.ni); }}>
                      <title>{h.note}</title>
                      <circle r={11 + Math.min(6, h.arcs.length) + 5} fill="none" stroke={h.color} strokeWidth={1} opacity={0.35} strokeDasharray="2 4" />
                      <circle r={6 + Math.min(6, h.arcs.length)} fill="var(--sg-panel)" stroke={h.color} strokeWidth={1.6} />
                      <circle r={(6 + Math.min(6, h.arcs.length)) * 0.4} fill={h.color} />
                      <text className="sg-wlabel" y={-(6 + Math.min(6, h.arcs.length)) - 9} textAnchor="middle">{h.name.toUpperCase()}</text>
                    </g>
                  </g>
                ))}
              </svg>
            )}

            {/* NETWORK - real accounts clustered by narrative thread */}
            {view === "net" && dims.vw > 0 && netLayout && (
              <svg className="sg-overlay sg-net" viewBox={`0 0 ${dims.vw} ${dims.vh}`}>
                <defs>
                  <filter id="sg-haloblur" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation={16} />
                  </filter>
                </defs>
                {threads.map((t, ci) => {
                  const pts = netLayout.nodes.filter((n) => n.community === ci);
                  if (!pts.length) return null;
                  const hx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
                  const hy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
                  const rad = Math.max(34, Math.max(...pts.map((p) => Math.hypot(p.x - hx, p.y - hy))) + 16);
                  const color = NARR_COLORS[ci % NARR_COLORS.length];
                  const on = narrSel < 0 || narrSel === ci;
                  return (
                    <g key={ci} opacity={on ? 1 : 0.12} style={{ cursor: "pointer" }}
                      onClick={(e) => { e.stopPropagation(); setNarrSel(narrSel === ci ? -1 : ci); }}>
                      <circle cx={hx} cy={hy} r={rad} fill={color} opacity={0.08} filter="url(#sg-haloblur)" />
                      <text className="sg-clabel" x={hx} y={hy - rad - 6} textAnchor="middle" fill={color}>{t.name.toUpperCase()}</text>
                      <text className="sg-clabel sg-csub" x={hx} y={hy - rad + 7} textAnchor="middle">{pts.length} SOURCES</text>
                    </g>
                  );
                })}
                {netLayout.edges.map((e, i) => {
                  const mx = (e.s.x + e.t.x) / 2, my = (e.s.y + e.t.y) / 2;
                  const dx = e.t.x - e.s.x, dy = e.t.y - e.s.y, d = Math.hypot(dx, dy) || 1;
                  const off = Math.min(26, d * 0.12);
                  const on = narrSel < 0 || (e.s.community === narrSel && e.t.community === narrSel);
                  return (
                    <path key={i} className="sg-nedge"
                      d={`M ${e.s.x.toFixed(1)} ${e.s.y.toFixed(1)} Q ${(mx - (dy / d) * off).toFixed(1)} ${(my + (dx / d) * off).toFixed(1)} ${e.t.x.toFixed(1)} ${e.t.y.toFixed(1)}`}
                      stroke={NARR_COLORS[e.community % NARR_COLORS.length]}
                      strokeWidth={0.7} strokeDasharray="3 3" opacity={on ? 0.25 : 0.05} fill="none" />
                  );
                })}
                {netLayout.nodes.map((n) => {
                  const color = n.community >= 0 ? NARR_COLORS[n.community % NARR_COLORS.length] : "#9A9A9F";
                  const on = narrSel < 0 || n.community === narrSel;
                  return (
                    <g key={n.id} className="sg-nnode" transform={`translate(${n.x},${n.y})`} opacity={on ? 1 : 0.12}
                      onClick={(e) => { e.stopPropagation(); setSelected(-1); setSelectedNode(n); }}>
                      <title>{`${n.label} · ${n.source} · ${n.count} collected mention(s)`}</title>
                      <circle r={n.r} fill={color} stroke="#050506" strokeWidth={1} />
                      {n.count >= 2 && (
                        <text className="sg-clabel sg-csub" y={-n.r - 4} textAnchor="middle" style={{ fill: "var(--sg-text)" }}>
                          {n.label.slice(0, 24)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          {/* view toggle + zoom controls */}
          {data && (
            <div className="sg-viewtog">
              {(["map", "web", "net"] as View[]).map((v) => (
                <button key={v} className={view === v ? "sg-on" : ""} onClick={() => setView(v)}>
                  {v === "map" ? "MAP" : v === "web" ? "ROUTES" : "NETWORK"}
                </button>
              ))}
            </div>
          )}
          {view !== "net" && (
            <div className="sg-zoomctl">
              <button aria-label="Zoom in" onClick={() => zoomAt(dims.vw / 2, dims.vh / 2, 1.5)}>+</button>
              <button aria-label="Zoom out" onClick={() => zoomAt(dims.vw / 2, dims.vh / 2, 0.66)}>−</button>
              <button aria-label="Reset view" onClick={() => setTf({ k: 1, tx: 0, ty: 0 })}>⌂</button>
            </div>
          )}
          {view === "web" && (
            <div className="sg-webhint">ROUTES SHOW WHICH SIGNALS FEED EACH NARRATIVE · CLICK A HUB TO ISOLATE IT</div>
          )}
          {view === "net" && (
            <div className="sg-webhint">
              REAL ACCOUNTS/OUTLETS FROM COLLECTED MENTIONS · DASHED EDGE = SHARED NARRATIVE (CO-BEHAVIOR SIGNAL, NOT AN OBSERVED INTERACTION)
            </div>
          )}
          {narrSel >= 0 && threads[narrSel] && (
            <button className="sg-threadbar" onClick={() => setNarrSel(-1)}>
              THREAD «{threads[narrSel].name.toUpperCase()}» — {threads[narrSel].mentions.length} SIGNALS · CLEAR ✕
            </button>
          )}

          {!data && !loading && (
            <div className="sg-idle">
              <h1>GLOBAL MENTION GRID</h1>
              <div className="sg-big">AWAITING TARGET</div>
              <div className="sg-hint">
                Type a brand above and press SCAN — TruthLens sweeps connected public sources
                <br />and plots who is talking, where, across the open web.
              </div>
            </div>
          )}

          {loading && (
            <div className="sg-scanlog">
              <div className="sg-lt">RECON IN PROGRESS</div>
              <div>
                <div className="sg-ln sg-ok">TARGET: {entity.toUpperCase()}</div>
                {RECON_STEPS.slice(0, step + 1).map((s, i) => (
                  <div key={i} className={`sg-ln ${i === step ? "sg-cur" : "sg-ok"}`}>{s}</div>
                ))}
              </div>
            </div>
          )}

          {/* mention detail popover */}
          {selMention && detailPos && view !== "net" && (
            <div className="sg-detail" style={{ left: detailPos.x, top: detailPos.y, display: "block" }}>
              <button className="sg-x" aria-label="Close" onClick={() => setSelected(-1)}>✕</button>
              <div className="sg-src" style={{ color: TYPE_COLORS[selMention.sourceType] }}>
                {selMention.sourceType.toUpperCase()} · {selMention.source}
              </div>
              <h4 dir="auto">{selMention.title}</h4>
              {selMention.snippet && <p dir="auto">{selMention.snippet}</p>}
              <div className="sg-dfoot">
                <span>{isoDate(selMention.timestamp)}</span>
                <span>{selMention.country || ""}</span>
                {selMention.sentiment && (
                  <span className={`sg-s${selMention.sentiment}`}>{SENT_ICON[selMention.sentiment]} {selMention.sentiment}</span>
                )}
              </div>
              {selMention.url && (
                <p style={{ marginBottom: 0 }}>
                  <a href={selMention.url} target="_blank" rel="noopener noreferrer">open source ↗</a>
                </p>
              )}
            </div>
          )}

          {/* account-node popover - real collected facts only, no drill */}
          {selectedNode && view === "net" && (
            <div className="sg-detail" style={{ left: 14, top: 14, display: "block" }}>
              <button className="sg-x" aria-label="Close" onClick={() => setSelectedNode(null)}>✕</button>
              <div className="sg-src" style={{ color: TYPE_COLORS[selectedNode.sourceType] }}>
                {selectedNode.sourceType.toUpperCase()} · {selectedNode.source}
              </div>
              <h4 dir="auto">{selectedNode.label}</h4>
              <p>
                {selectedNode.count} collected mention{selectedNode.count === 1 ? "" : "s"}
                {selectedNode.community >= 0 && threads[selectedNode.community]
                  ? ` · thread: ${threads[selectedNode.community].name}` : ""}
              </p>
              <p style={{ fontSize: 10, color: "var(--sg-dim)" }}>
                An account/outlet observed in collected public mentions - grouping by shared
                narrative is a co-behavior signal, not proof of coordination.
              </p>
              {selectedNode.mentions.slice(0, 4).map((mi) => {
                const m = data?.mentions[mi];
                return m ? (
                  <p key={mi} style={{ margin: "4px 0" }}>
                    <a href={m.url || "#"} target="_blank" rel="noopener noreferrer">{m.title.slice(0, 60)} ↗</a>
                  </p>
                ) : null;
              })}
            </div>
          )}

          {error && (
            <div className="sg-err" style={{ display: "block" }}>
              Scan failed ({error}). Public sources may be throttling — press SCAN to retry.
            </div>
          )}
        </div>

        {/* ---- right: analysis ---- */}
        <aside className={`sg-right ${pane === "right" ? "sg-show" : ""}`}>
          <div className="sg-ph"><i />ANALYSIS</div>
          <div className="sg-scroll">
            <div className={`sg-summary ${data ? "" : "sg-empty"}`} dir="auto">
              {data ? data.summary : "A real, sourced intelligence picture appears here after a scan. Every figure traces to a collected public mention or an official public data series."}
            </div>

            {/* Sentiment - server-side classification of collected mentions. */}
            <div className="sg-blk">
              <div className="sg-ph sg-sub"><i style={{ background: "var(--sg-pos)" }} />SENTIMENT</div>
              <div className="sg-gauge">
                {!data ? (
                  <div className="sg-empty" style={{ padding: 0 }}>—</div>
                ) : !data.sentiment ? (
                  <div className="sg-empty" style={{ padding: 0 }}>Not requested for this scan.</div>
                ) : !data.sentiment.available ? (
                  <div className="sg-empty" style={{ padding: 0 }}>Not connected — {data.sentiment.reason}</div>
                ) : data.sentiment.score === null ? (
                  <div className="sg-empty" style={{ padding: 0 }}>Unknown — no mention could be labeled.</div>
                ) : (
                  <>
                    <div className="sg-gval" style={{
                      color: data.sentiment.score > 15 ? "var(--sg-pos)" : data.sentiment.score < -15 ? "var(--sg-neg)" : "var(--sg-text)",
                    }}>
                      {data.sentiment.score > 0 ? "+" : ""}{data.sentiment.score}
                    </div>
                    <div className="sg-gtrack">
                      <div className="sg-gfill" style={
                        data.sentiment.score >= 0
                          ? { left: "50%", right: `${50 - Math.abs(data.sentiment.score) / 2}%`, background: "linear-gradient(90deg, var(--sg-accent), var(--sg-pos))" }
                          : { right: "50%", left: `${50 - Math.abs(data.sentiment.score) / 2}%`, background: "linear-gradient(90deg, var(--sg-neg), var(--sg-accent))" }
                      } />
                    </div>
                    <div className="sg-glabels"><span>NEGATIVE</span><span>NEUTRAL</span><span>POSITIVE</span></div>
                    <div className="sg-gmeta">
                      <span className="sg-spos">▲ {data.sentiment.pos}</span>
                      <span className="sg-sneu">■ {data.sentiment.neu}</span>
                      <span className="sg-sneg">▼ {data.sentiment.neg}</span>
                      <span style={{ marginLeft: "auto" }}>labeled {data.sentiment.labeled}/{data.total}</span>
                    </div>
                    <div className="sg-galt">{data.sentiment.alternative}</div>
                  </>
                )}
              </div>
            </div>

            {/* GEO sources - real countries; click zooms the map. */}
            <div className="sg-blk">
              <div className="sg-ph sg-sub">
                <i style={{ background: "var(--sg-cat-news)" }} />
                {narrSel >= 0 && threads[narrSel] ? `GEO · ${threads[narrSel].name.toUpperCase()}` : "GEO SOURCES"}
              </div>
              <div>
                {!data ? (
                  <div className="sg-empty">—</div>
                ) : geoRows.length === 0 ? (
                  <div className="sg-empty">No source reported a country in this view.</div>
                ) : (
                  geoRows.slice(0, 10).map((g, ri) => (
                    <div key={ri} className="sg-georow" role="button" tabIndex={0} title="Zoom to country"
                      onClick={() => g.border && zoomToBBox(g.border.bb)}
                      onKeyDown={(e) => { if (e.key === "Enter" && g.border) zoomToBBox(g.border.bb); }}>
                      <div className="sg-geotop">
                        <i style={{ background: g.color }} />
                        <b dir="auto">{g.display}</b>
                        <span className="sg-geocnt">{g.count} SIGNAL{g.count > 1 ? "S" : ""}</span>
                      </div>
                      <div className="sg-geocities">
                        {g.items.slice(0, 4).map((it, i) => (
                          <span key={i}>
                            <em dir="auto">{outletName(it.source, it.account)}</em> — {it.source}
                            {i < Math.min(3, g.items.length - 1) ? <br /> : null}
                          </span>
                        ))}
                        {g.items.length > 4 ? <><br />+{g.items.length - 4} more</> : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Anomaly watch - rolling z-score over the collected series. */}
            <div className="sg-blk">
              <div className="sg-ph sg-sub">
                <i style={{ background: firstAnomaly ? "var(--sg-neg)" : "var(--sg-pos)" }} />
                ANOMALY WATCH
                {firstAnomaly && <span className="sg-anofl">{firstAnomaly.status === "spike" ? "▲ SPIKE" : "▼ DROP"}</span>}
              </div>
              <div>
                {!data ? (
                  <div className="sg-empty">—</div>
                ) : (
                  anomalies.map((a) => (
                    <div key={a.key} className="sg-trend">
                      <div className={`sg-tarrow ${a.status === "spike" ? "sg-up" : a.status === "drop" ? "sg-down" : "sg-flat"}`}>
                        {a.status === "spike" ? "▲" : a.status === "drop" ? "▼" : a.status === "normal" ? "▪" : "·"}
                      </div>
                      <div>
                        <b>
                          {a.label}
                          {a.z !== null && isFinite(a.z) && (
                            <span style={{ color: "var(--sg-dim)", fontWeight: 400 }}> · {a.z > 0 ? "+" : ""}{a.z.toFixed(1)}σ</span>
                          )}
                        </b>
                        <span>{a.note}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Trend vectors - REAL public series (attention + news tone). */}
            <div className="sg-blk">
              <div className="sg-ph sg-sub"><i style={{ background: "var(--sg-cat-forum)" }} />TREND VECTORS</div>
              <div>
                {!context ? (
                  <div className="sg-empty">—</div>
                ) : (
                  context.signals.map((s: ContextSignal) => (
                    <div key={s.key} className="sg-trend">
                      <div className={`sg-tarrow ${s.direction === "up" ? "sg-up" : s.direction === "down" ? "sg-down" : "sg-flat"}`}>
                        {s.direction === "up" ? "▲" : s.direction === "down" ? "▼" : "▪"}
                      </div>
                      <div>
                        <b>
                          {s.label}
                          {s.collected && s.changePct !== null && (
                            <span style={{ color: "var(--sg-dim)", fontWeight: 400 }}>
                              {" "}· {s.changePct > 0 ? "+" : ""}{Math.round(s.changePct)}% (7d)
                            </span>
                          )}
                        </b>
                        <span>{s.collected ? s.note : `Not collected — ${s.reason}`}</span>
                        {s.sourceUrl && (
                          <span><a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">source ↗</a></span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Narrative threads - real clusters of collected mentions. */}
            <div className="sg-blk">
              <div className="sg-ph sg-sub"><i style={{ background: "var(--sg-cat-social)" }} />NARRATIVE THREADS</div>
              <div>
                {!data ? (
                  <div className="sg-empty">—</div>
                ) : !data.narratives?.available ? (
                  <div className="sg-empty">Not connected — {data.narratives?.reason || "narratives not requested."}</div>
                ) : threads.length === 0 ? (
                  <div className="sg-empty">No threads found in the collected mentions.</div>
                ) : (
                  threads.map((t, i) => (
                    <div key={i} className="sg-georow" role="button" tabIndex={0}
                      onClick={() => setNarrSel(narrSel === i ? -1 : i)}
                      onKeyDown={(e) => { if (e.key === "Enter") setNarrSel(narrSel === i ? -1 : i); }}
                      style={narrSel >= 0 && narrSel !== i ? { opacity: 0.4 } : undefined}>
                      <div className="sg-geotop">
                        <i style={{ background: NARR_COLORS[i % NARR_COLORS.length] }} />
                        <b dir="auto">{t.name}</b>
                        <span className="sg-geocnt">{t.mentions.length}</span>
                      </div>
                      {t.note && <div className="sg-geocities">{t.note}</div>}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Signal by type. */}
            <div className="sg-blk">
              <div className="sg-ph sg-sub"><i style={{ background: "var(--sg-cat-video)" }} />SIGNAL BY TYPE</div>
              <div style={{ padding: "10px 14px" }}>
                {!data ? (
                  <div className="sg-empty" style={{ padding: 0 }}>—</div>
                ) : (
                  data.byType.map((t) => (
                    <div key={t.type} className="sg-bar">
                      <div className="sg-bar-label" style={{ color: TYPE_COLORS[t.type] }}>{t.type}</div>
                      <div className="sg-bar-track">
                        <div className="sg-bar-fill" style={{ width: `${(t.count / maxType) * 100}%`, background: TYPE_COLORS[t.type] }} />
                      </div>
                      <div className="sg-bar-num">{t.count}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Most active accounts. */}
            <div className="sg-blk">
              <div className="sg-ph sg-sub"><i style={{ background: "var(--sg-cat-social)" }} />MOST ACTIVE ACCOUNTS</div>
              <div>
                {!data || data.talkers.length === 0 ? (
                  <div className="sg-empty">—</div>
                ) : (
                  data.talkers.map((t, i) => (
                    <div key={i} className="sg-talker">
                      <b dir="auto">{t.name}</b>{" "}
                      <span style={{ color: "var(--sg-dim)", fontSize: 10 }}>· {t.source}</span>
                      <em>{t.count} mention{t.count === 1 ? "" : "s"}</em>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Sources - honest connected / not-connected. */}
            {data && (
              <div className="sg-blk" style={{ borderBottom: 0 }}>
                <div className="sg-ph sg-sub"><i style={{ background: "var(--sg-cat-video)" }} />SOURCES</div>
                <div className="sg-sources">
                  {data.sources.map((s) => (
                    <span key={s.source} className={`sg-srcchip ${s.connected ? "" : "sg-off"}`}
                      title={s.connected ? s.error || "" : s.reason || "not connected"}>
                      {s.source}{s.connected ? ` · ${s.count}` : " · off"}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ---- mobile tabs ---- */}
        <div className="sg-tabs">
          <button className={pane === "left" ? "sg-on" : ""} onClick={() => setPane("left")}>FEED</button>
          <button className={pane === "right" ? "sg-on" : ""} onClick={() => setPane("right")}>ANALYSIS</button>
        </div>

        {/* ---- timeline ticker ---- */}
        <div className="sg-ticker">
          <div className="sg-lbl">TIMELINE</div>
          <div className="sg-tickitems" style={data && data.timeline.length ? undefined : { animation: "none" }}>
            {data && data.timeline.length ? (
              [...data.timeline, ...data.timeline].map((e, i) => (
                <span key={i} className="sg-tk"><b>{e.date}</b><span dir="auto">{e.event}</span></span>
              ))
            ) : (
              <span className="sg-tk">No dated events yet — run a scan.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Scoped console styling - Aurora Dark token contract (see tailwind.config /
// globals.css). Hues that live only in tailwind.config are mirrored with their
// token name in a comment.
const CSS = `
.sg{
  --sg-ink:var(--color-bg);
  --sg-panel:var(--color-surface);
  --sg-panel-2:var(--color-surface-2);
  --sg-line:var(--color-border);
  --sg-text:var(--color-text);
  --sg-dim:var(--color-text-secondary);
  --sg-accent:#A98BF0;        /* brand.soft */
  --sg-cat-news:var(--color-warm);      /* grad-start */
  --sg-cat-social:var(--grad-mid);
  --sg-cat-forum:#A98BF0;               /* brand.soft */
  --sg-cat-video:var(--color-badge);
  --sg-pos:#22C55E;           /* risk.legit */
  --sg-neg:#F0454F;           /* risk.high */
  --sg-warn:#F5A623;          /* risk.unknown */
  --sg-mono:var(--font-mono);
  color:var(--sg-text); font-family:var(--sg-mono); font-size:13px; line-height:1.5;
}
.sg *{box-sizing:border-box}
.sg a{color:var(--sg-accent);text-decoration:none}
.sg a:hover{text-decoration:underline}
.sg-app{
  display:grid; height:min(84vh,900px); min-height:600px;
  grid-template-rows:52px 1fr 34px; grid-template-columns:320px 1fr 300px;
  grid-template-areas:"top top top" "left map right" "tick tick tick";
  border:1px solid var(--sg-line); border-radius:var(--radius-lg); overflow:hidden; background:var(--sg-ink);
}
.sg-header{grid-area:top;display:flex;align-items:center;gap:14px;padding:0 14px;
  border-bottom:1px solid var(--sg-line);background:var(--sg-panel)}
.sg-brandmark{display:flex;align-items:baseline;gap:8px;white-space:nowrap}
.sg-brandmark b{font-size:15px;letter-spacing:.32em;font-weight:700;font-family:var(--font-display);
  background-image:var(--gradient-brand);-webkit-background-clip:text;background-clip:text;color:transparent}
.sg-brandmark span{font-size:9px;color:var(--sg-dim);letter-spacing:.12em}
.sg-searchwrap{flex:1;display:flex;gap:8px;max-width:520px}
.sg-q{flex:1;background:var(--color-surface-sunken);border:1px solid var(--sg-line);color:var(--sg-text);
  padding:8px 12px;font-size:13px;border-radius:var(--radius-sm);font-family:var(--sg-mono);outline:none;
  transition:border-color var(--dur-fast) var(--ease-out),box-shadow var(--dur-fast) var(--ease-out)}
.sg-q::placeholder{color:var(--color-text-muted)}
.sg-q:focus{border-color:var(--color-primary);box-shadow:0 0 0 3px var(--color-primary-glow)}
.sg-go{background-image:var(--gradient-brand);color:var(--color-on-primary);border:0;padding:8px 18px;
  font-weight:700;letter-spacing:.14em;border-radius:var(--radius-sm);font-size:12px;font-family:var(--sg-mono);
  cursor:pointer;box-shadow:0 6px 22px -8px var(--color-primary-glow);
  transition:box-shadow var(--dur-fast) var(--ease-out),transform var(--dur-fast) var(--ease-out)}
.sg-go:hover:not(:disabled){box-shadow:0 10px 30px -8px var(--color-primary-glow);transform:translateY(-1px)}
.sg-go:disabled{background-image:none;background-color:var(--sg-panel-2);color:var(--sg-dim);cursor:wait;box-shadow:none}
.sg-status{margin-left:auto;font-size:11px;color:var(--sg-dim);letter-spacing:.1em;white-space:nowrap}
.sg-live{color:var(--sg-pos)}
.sg-left,.sg-right{background:var(--sg-panel);overflow:hidden;display:flex;flex-direction:column;min-height:0}
.sg-left{grid-area:left;border-right:1px solid var(--sg-line)}
.sg-right{grid-area:right;border-left:1px solid var(--sg-line)}
.sg-ph{padding:10px 14px;border-bottom:1px solid var(--sg-line);font-size:10px;letter-spacing:.24em;
  color:var(--sg-dim);display:flex;align-items:center;gap:8px;flex-shrink:0}
.sg-ph.sg-sub{border-top:0}
.sg-ph i{width:6px;height:6px;background-image:var(--gradient-brand);display:inline-block;border-radius:50%}
.sg-scroll{overflow-y:auto;flex:1;min-height:0}
.sg-scroll::-webkit-scrollbar{width:8px}
.sg-scroll::-webkit-scrollbar-thumb{background:var(--sg-line)}
.sg-empty{padding:20px 16px;color:var(--sg-dim);font-size:12px}
.sg-chips{display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid var(--sg-line);flex-wrap:wrap;flex-shrink:0}
.sg-chip{background:transparent;border:1px solid var(--sg-line);color:var(--sg-dim);font-size:10px;
  letter-spacing:.08em;padding:3px 10px;border-radius:var(--radius-full);font-family:var(--sg-mono);cursor:pointer;
  transition:color var(--dur-fast) var(--ease-out),border-color var(--dur-fast) var(--ease-out)}
.sg-chip:hover:not(.sg-on){border-color:var(--color-border-strong);color:var(--sg-text)}
.sg-chip.sg-on{color:var(--sg-ink)}
.sg-chip[data-t="all"].sg-on{background:var(--sg-text);border-color:var(--sg-text)}
.sg-chip[data-t="news"].sg-on{background:var(--sg-cat-news);border-color:var(--sg-cat-news)}
.sg-chip[data-t="social"].sg-on{background:var(--sg-cat-social);border-color:var(--sg-cat-social);color:#fff}
.sg-chip[data-t="forum"].sg-on{background:var(--sg-cat-forum);border-color:var(--sg-cat-forum)}
.sg-chip[data-t="video"].sg-on{background:var(--sg-cat-video);border-color:var(--sg-cat-video)}
.sg-m{padding:11px 14px;border-bottom:1px solid var(--sg-line);cursor:pointer;position:relative}
.sg-m:hover,.sg-m.sg-sel{background:var(--sg-panel-2)}
.sg-m.sg-sel::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background-image:var(--gradient-brand)}
.sg-src{font-size:10px;letter-spacing:.1em;display:flex;gap:8px;align-items:center;margin-bottom:3px}
.sg-t{font-weight:700}
.sg-t-news{color:var(--sg-cat-news)} .sg-t-social{color:var(--sg-cat-social)}
.sg-t-forum{color:var(--sg-cat-forum)} .sg-t-video{color:var(--sg-cat-video)}
.sg-geo{color:var(--sg-dim);margin-left:auto}
.sg-m h4{font-size:12.5px;font-weight:600;color:var(--sg-text);margin:0}
.sg-m p{font-size:11.5px;color:var(--sg-dim);margin-top:3px}
.sg-foot{display:flex;gap:10px;margin-top:5px;font-size:10px;color:var(--sg-dim)}
.sg-blk{border-bottom:1px solid var(--sg-line)}
.sg-summary{padding:12px 14px;font-size:12px;color:var(--sg-text);border-bottom:1px solid var(--sg-line)}
.sg-gauge{padding:12px 14px}
.sg-gval{text-align:center;font-size:22px;font-weight:700;margin-bottom:8px;letter-spacing:.05em}
.sg-gtrack{height:6px;background:var(--sg-ink);border:1px solid var(--sg-line);position:relative;border-radius:3px}
.sg-gtrack::after{content:"";position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:var(--sg-line)}
.sg-gfill{position:absolute;top:0;bottom:0;border-radius:3px;transition:all .9s ease}
.sg-glabels{display:flex;justify-content:space-between;font-size:9px;color:var(--sg-dim);margin-top:6px;letter-spacing:.08em}
.sg-gmeta{display:flex;gap:12px;font-size:10.5px;color:var(--sg-dim);margin-top:8px}
.sg-galt{font-size:9.5px;color:var(--sg-dim);margin-top:7px;line-height:1.45}
.sg-spos{color:var(--sg-pos)} .sg-sneg{color:var(--sg-neg)} .sg-sneu{color:var(--sg-dim)}
.sg-bar{display:flex;align-items:center;gap:8px;margin:5px 0;font-size:11px}
.sg-bar-label{width:92px;flex-shrink:0;color:var(--sg-text);text-transform:capitalize;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sg-bar-track{flex:1;height:6px;background:var(--sg-ink);border-radius:3px;overflow:hidden}
.sg-bar-fill{height:6px;border-radius:3px;transition:width .5s ease;min-width:2px}
.sg-bar-num{width:26px;text-align:right;color:var(--sg-dim)}
.sg-talker{padding:8px 14px;border-bottom:1px solid var(--sg-line);font-size:11.5px}
.sg-talker:last-child{border-bottom:0}
.sg-talker b{color:var(--sg-text)}
.sg-talker em{color:var(--sg-dim);font-style:normal;font-size:10.5px;display:block}
.sg-trend{padding:9px 14px;border-bottom:1px solid var(--sg-line);display:flex;gap:10px;align-items:flex-start}
.sg-trend:last-child{border-bottom:0}
.sg-tarrow{font-size:14px;width:16px;text-align:center;flex-shrink:0;line-height:1.4}
.sg-up{color:var(--sg-pos)} .sg-down{color:var(--sg-neg)} .sg-flat{color:var(--sg-dim)}
.sg-anofl{margin-left:auto;color:var(--sg-neg);font-weight:700;letter-spacing:.1em}
.sg-trend b{font-size:12px;display:block}
.sg-trend span{font-size:11px;color:var(--sg-dim);display:block}
.sg-georow{padding:8px 14px;border-bottom:1px solid var(--sg-line);cursor:pointer}
.sg-georow:hover{background:var(--sg-panel-2)}
.sg-georow:last-child{border-bottom:0}
.sg-geotop{display:flex;align-items:center;gap:8px;font-size:12px}
.sg-geotop i{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.sg-geotop b{color:var(--sg-text)}
.sg-geocnt{margin-left:auto;color:var(--sg-dim);font-size:10px}
.sg-geocities{font-size:10.5px;color:var(--sg-dim);margin-top:2px;line-height:1.45}
.sg-geocities em{font-style:normal;color:var(--sg-text)}
.sg-sources{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px}
.sg-srcchip{border:1px solid var(--sg-line);color:var(--sg-dim);font-size:10px;padding:2px 8px;border-radius:var(--radius-full)}
.sg-srcchip.sg-off{border-color:rgba(245,166,35,.3);color:var(--sg-warn);background:rgba(245,166,35,.05)}
.sg-mapzone{grid-area:map;position:relative;overflow:hidden;touch-action:none;
  background:radial-gradient(ellipse at 50% 40%, rgba(127,73,225,.08) 0%, transparent 70%),var(--color-surface-sunken)}
.sg-stage{position:absolute;inset:0}
.sg-canvas,.sg-overlay{position:absolute;left:0;top:0;width:100%;height:100%}
.sg-overlay{overflow:visible}
.sg-sweep{position:absolute;inset:-40%;pointer-events:none;opacity:.5;
  background:conic-gradient(from 0deg, transparent 0deg, transparent 342deg, rgba(127,73,225,.06) 356deg, rgba(169,139,240,.16) 360deg);
  animation:sg-spin 14s linear infinite}
@keyframes sg-spin{to{transform:rotate(360deg)}}
.sg-marker{cursor:pointer}
.sg-pulse{transform-origin:center;animation:sg-pulse 2.4s ease-out infinite}
@keyframes sg-pulse{0%{opacity:.7;transform:scale(.4)}80%{opacity:0;transform:scale(2.6)}100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.sg-sweep{animation:none;display:none}.sg-pulse{animation:none}.sg-arc{animation:none}}
.sg-mlabel{fill:var(--sg-text);font-size:9.5px;letter-spacing:.04em;pointer-events:none;
  paint-order:stroke;stroke:#050506;stroke-width:3px}
.sg-msub{fill:var(--sg-dim);font-size:8.5px}
.sg-arc{fill:none;stroke-dasharray:6 8;animation:sg-dash 1.1s linear infinite}
@keyframes sg-dash{to{stroke-dashoffset:-14}}
.sg-wn{cursor:pointer;pointer-events:auto}
.sg-wlabel{fill:var(--sg-text);font-size:11px;font-weight:700;letter-spacing:.1em;
  paint-order:stroke;stroke:#050506;stroke-width:4px}
.sg-nnode{cursor:pointer}
.sg-nedge{fill:none}
.sg-clabel{fill:var(--sg-text);font-size:11px;font-weight:700;letter-spacing:.14em;
  paint-order:stroke;stroke:#050506;stroke-width:4px}
.sg-clabel.sg-csub{font-size:8.5px;font-weight:400;letter-spacing:.08em;fill:var(--sg-dim)}
.sg-viewtog{position:absolute;top:10px;right:12px;z-index:20;display:flex;border:1px solid var(--sg-line);
  border-radius:var(--radius-sm);overflow:hidden;background:rgba(5,5,6,.75);backdrop-filter:blur(2px)}
.sg-viewtog button{background:none;border:0;color:var(--sg-dim);font-size:10px;letter-spacing:.18em;
  padding:6px 12px;font-family:var(--sg-mono);cursor:pointer}
.sg-viewtog button.sg-on{color:var(--color-on-primary);background-image:var(--gradient-brand);font-weight:700}
.sg-zoomctl{position:absolute;right:12px;bottom:14px;z-index:20;display:flex;flex-direction:column;
  border:1px solid var(--sg-line);border-radius:var(--radius-sm);overflow:hidden;background:rgba(5,5,6,.75);backdrop-filter:blur(2px)}
.sg-zoomctl button{background:none;border:0;border-bottom:1px solid var(--sg-line);color:var(--sg-dim);
  width:30px;height:30px;font-size:15px;line-height:1;font-family:var(--sg-mono);cursor:pointer}
.sg-zoomctl button:last-child{border-bottom:0}
.sg-zoomctl button:hover{color:var(--sg-accent)}
.sg-webhint{position:absolute;left:14px;bottom:10px;font-size:10px;color:var(--sg-dim);
  letter-spacing:.12em;pointer-events:none;max-width:70%}
.sg-threadbar{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);z-index:25;
  background:rgba(5,5,6,.88);border:1px solid var(--color-primary);border-radius:var(--radius-sm);
  color:var(--sg-accent);font-size:11px;letter-spacing:.16em;padding:8px 18px;backdrop-filter:blur(2px);
  font-family:var(--sg-mono);cursor:pointer}
.sg-threadbar:hover{background:var(--color-primary);color:var(--color-on-primary)}
.sg-idle{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:10px;pointer-events:none;text-align:center;padding:20px}
.sg-idle h1{font-size:12px;letter-spacing:.4em;color:var(--sg-dim);font-weight:400;margin:0}
.sg-idle .sg-big{font-size:24px;letter-spacing:.18em;color:var(--sg-text);font-weight:700}
.sg-idle .sg-hint{font-size:11px;color:var(--sg-dim)}
.sg-scanlog{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  background:rgba(5,5,6,.88);border:1px solid var(--sg-line);border-radius:var(--radius-md);
  min-width:320px;max-width:88%;padding:16px 18px;backdrop-filter:blur(3px)}
.sg-lt{font-size:10px;letter-spacing:.3em;color:var(--sg-accent);margin-bottom:10px}
.sg-ln{font-size:11.5px;color:var(--sg-dim);padding:1.5px 0}
.sg-ln.sg-ok{color:var(--sg-text)}
.sg-cur::after{content:"▌";color:var(--sg-accent);animation:sg-blink 1s steps(1) infinite;margin-left:4px}
@keyframes sg-blink{50%{opacity:0}}
.sg-detail{position:absolute;background:var(--sg-panel-2);border:1px solid var(--sg-line);
  border-radius:var(--radius-md);width:288px;padding:12px 14px;z-index:30;box-shadow:0 10px 30px rgba(0,0,0,.5)}
.sg-detail .sg-x{position:absolute;top:6px;right:8px;background:none;border:0;color:var(--sg-dim);font-size:14px;cursor:pointer}
.sg-detail h4{font-size:12.5px;margin:2px 0 4px;padding-right:14px}
.sg-detail .sg-src{font-size:10px;letter-spacing:.1em}
.sg-detail p{font-size:11.5px;color:var(--sg-dim);margin:6px 0}
.sg-dfoot{font-size:10px;color:var(--sg-dim);display:flex;gap:10px}
.sg-err{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);
  background:rgba(240,69,79,.08);border:1px solid var(--sg-neg);border-radius:var(--radius-sm);
  color:#FFD7D9;padding:10px 16px;font-size:12px;max-width:80%;backdrop-filter:blur(3px)}
.sg-ticker{grid-area:tick;border-top:1px solid var(--sg-line);background:var(--sg-panel);
  display:flex;align-items:center;overflow:hidden;white-space:nowrap}
.sg-lbl{padding:0 14px;font-size:10px;letter-spacing:.24em;color:var(--sg-dim);
  border-right:1px solid var(--sg-line);flex-shrink:0;height:100%;display:flex;align-items:center;background:var(--sg-panel)}
.sg-tickitems{display:flex;gap:34px;padding:0 20px;animation:sg-roll 40s linear infinite}
.sg-ticker:hover .sg-tickitems{animation-play-state:paused}
@keyframes sg-roll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.sg-tk{font-size:11px;color:var(--sg-dim)}
.sg-tk b{color:var(--sg-accent);font-weight:600;margin-right:8px}
.sg-tabs{display:none}
@media (max-width:940px){
  .sg-app{grid-template-rows:auto 40vh 38px 1fr 34px;grid-template-columns:1fr;
    grid-template-areas:"top" "map" "tabs" "panels" "tick";height:auto}
  .sg-header{flex-wrap:wrap;padding:8px 12px;gap:8px}
  .sg-status{display:none}
  .sg-searchwrap{max-width:none;width:100%}
  .sg-tabs{grid-area:tabs;display:flex;border-bottom:1px solid var(--sg-line);background:var(--sg-panel)}
  .sg-tabs button{flex:1;background:none;border:0;border-right:1px solid var(--sg-line);
    color:var(--sg-dim);font-size:10px;letter-spacing:.2em;padding:10px 0;font-family:var(--sg-mono);cursor:pointer}
  .sg-tabs button.sg-on{color:var(--sg-accent);box-shadow:inset 0 -2px 0 var(--color-primary)}
  .sg-left,.sg-right{grid-area:panels;border:0;display:none;min-height:340px}
  .sg-left.sg-show,.sg-right.sg-show{display:flex}
}
`;
