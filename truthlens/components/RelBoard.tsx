"use client";

// Relationship Board - org-level link-analysis canvas (react-force-graph-2d,
// already a repo dep). Org + disclosed-role nodes, relationship edges, a side
// panel with cited sources + ConfidenceBadge, a HE/EN toggle (flips text + dir),
// and exports (JSON / nodes.csv+edges.csv / GraphML). No person dossiers by
// construction - the graph shape has no personal fields.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Building2, UserSquare2, ExternalLink, Download, Languages, ArrowRight } from "lucide-react";
import ConfidenceBadge, { type ConfidenceLevel } from "@/components/ConfidenceBadge";
import { toNodesCsv, toEdgesCsv, toGraphml } from "@/lib/relboard/export";
import type { RelGraph, RelNode } from "@/lib/relboard/schema";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

type Lang = "he" | "en";
const level = (c: number): ConfidenceLevel => (c >= 0.8 ? "High" : c >= 0.5 ? "Medium" : "Low");
const NODE_COLOR = { organization: "#7F49E1", role: "#E1804A" } as const;

function download(name: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function RelBoard() {
  const [company, setCompany] = useState("");
  const [graph, setGraph] = useState<RelGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lang, setLang] = useState<Lang>("en");
  const [selected, setSelected] = useState<RelNode | null>(null);
  const [width, setWidth] = useState(640);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setWidth(wrapRef.current?.clientWidth || 640);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [graph]);

  const build = useCallback(async () => {
    const q = company.trim();
    if (q.length < 2) return;
    setLoading(true); setError(""); setGraph(null); setSelected(null);
    try {
      // POST + no-store so a browser/CDN never replays a stale GET response.
      const r = await fetch(`/api/relboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ company: q }),
      });
      // Read text first, then parse - so a non-JSON error body never crashes
      // the client with "Unexpected token"; show the real message instead.
      const txt = await r.text();
      let data: any = {};
      try { data = txt ? JSON.parse(txt) : {}; } catch { throw new Error(txt.slice(0, 200) || `Request failed (${r.status})`); }
      if (!r.ok) throw new Error(data.error || data.reason || `Build failed (${r.status})`);
      if (!data.available) throw new Error(data.reason || "Engine not available");
      setGraph(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [company]);

  const gdata = useMemo(() => {
    if (!graph) return { nodes: [], links: [] };
    return {
      nodes: graph.nodes.map((n) => ({ id: n.id, node: n })),
      links: graph.edges.map((e) => ({ source: e.source, target: e.target, edge: e })),
    };
  }, [graph]);

  const dir = lang === "he" ? "rtl" : "ltr";

  return (
    <div className="space-y-4" dir={dir}>
      <div className="card">
        <form onSubmit={(e) => { e.preventDefault(); build(); }} className="flex flex-col gap-2 sm:flex-row">
          <input value={company} onChange={(e) => setCompany(e.target.value)} dir="auto"
            placeholder={lang === "he" ? "שם חברה, למשל McDonald's" : "Company name, e.g. McDonald's"}
            className="w-full rounded-xl border border-white/15 bg-bg-elev px-4 py-3 text-base outline-none transition focus:border-brand" />
          <button type="submit" className="btn shrink-0" disabled={loading || company.trim().length < 2}>
            {loading ? (lang === "he" ? "בונה…" : "Building…") : <>{lang === "he" ? "בנה לוח" : "Build board"} <ArrowRight className="h-4 w-4" /></>}
          </button>
          <button type="button" onClick={() => setLang(lang === "he" ? "en" : "he")}
            className="btn-ghost shrink-0" title="HE / EN">
            <Languages className="h-4 w-4" /> {lang === "he" ? "EN" : "עב"}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-risk-high">{error}</p>}
        <p className="mt-2 text-xs text-ink-secondary">
          {lang === "he"
            ? "ארגונים ותפקידים ציבוריים מתועדים בלבד - בלי פרופילים אישיים. כל צומת עם מקור ציבורי."
            : "Organizations and disclosed public roles only - no personal profiles. Every node is provenance-cited."}
        </p>
      </div>

      {graph && (
        <>
          <div className="card flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-ink-secondary">
              {graph.nodes.length} {lang === "he" ? "צמתים" : "nodes"} · {graph.edges.length} {lang === "he" ? "קשרים" : "edges"}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost text-xs" onClick={() => download(`relboard-${graph.company}.json`, JSON.stringify(graph, null, 2), "application/json")}><Download className="h-3.5 w-3.5" /> JSON</button>
              <button className="btn-ghost text-xs" onClick={() => download(`relboard-${graph.company}-nodes.csv`, toNodesCsv(graph), "text/csv")}><Download className="h-3.5 w-3.5" /> nodes.csv</button>
              <button className="btn-ghost text-xs" onClick={() => download(`relboard-${graph.company}-edges.csv`, toEdgesCsv(graph), "text/csv")}><Download className="h-3.5 w-3.5" /> edges.csv</button>
              <button className="btn-ghost text-xs" onClick={() => download(`relboard-${graph.company}.graphml`, toGraphml(graph), "application/xml")}><Download className="h-3.5 w-3.5" /> GraphML</button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div ref={wrapRef} className="card overflow-hidden p-0" style={{ height: 520, background: "#0a0a12" }}>
              <ForceGraph2D
                graphData={gdata as any}
                width={width}
                height={520}
                backgroundColor="#0a0a12"
                nodeRelSize={6}
                linkColor={() => "rgba(169,139,240,0.35)"}
                linkDirectionalArrowLength={4}
                linkDirectionalArrowRelPos={1}
                linkLabel={(l: any) => l.edge?.label?.[lang] || ""}
                onNodeClick={(n: any) => setSelected(n.node)}
                nodeCanvasObject={(n: any, ctx: any, scale: number) => {
                  const node: RelNode = n.node;
                  const r = node.id === graph.centralNodeId ? 8 : 5;
                  ctx.beginPath();
                  ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
                  ctx.fillStyle = NODE_COLOR[node.type];
                  ctx.globalAlpha = node.confidence < 0.5 ? 0.5 : 1;
                  ctx.fill();
                  if (node.confidence < 0.5) { ctx.globalAlpha = 1; ctx.strokeStyle = "#F5A623"; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]); }
                  ctx.globalAlpha = 1;
                  // Role nodes show the disclosed office-holder as the primary
                  // line, with the role title as subtitle; org nodes show name.
                  const primary = node.type === "role" && node.officeholder ? node.officeholder : node.name;
                  const subtitle = node.type === "role" ? node.label[lang] || node.name : node.label[lang] || "";
                  const fs = 12 / scale;
                  ctx.font = `${fs}px Inter, sans-serif`;
                  ctx.fillStyle = "#EBEBEB";
                  ctx.textAlign = "center";
                  ctx.fillText(primary.slice(0, 28), n.x, n.y + r + fs + 1);
                  if (subtitle) {
                    ctx.fillStyle = "#9A9A9F";
                    ctx.fillText(subtitle.slice(0, 30), n.x, n.y + r + fs * 2 + 2);
                  }
                }}
              />
            </div>

            <div className="card">
              {selected ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {selected.type === "organization" ? <Building2 className="h-4 w-4 text-brand-soft" /> : <UserSquare2 className="h-4 w-4 text-warm" />}
                    <div className="font-semibold">
                      {selected.type === "role" && selected.officeholder ? selected.officeholder : selected.name}
                    </div>
                  </div>
                  <div className="text-sm text-ink-secondary">
                    {selected.type === "role" ? selected.label[lang] : selected.label[lang]}
                    {selected.type === "role" && selected.orgName ? ` · ${selected.orgName}` : ""}
                  </div>
                  {selected.type === "organization" && selected.orgInfo && (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-line p-2 text-xs">
                      {selected.orgInfo.sector && <div><span className="text-ink-muted">{lang === "he" ? "סקטור" : "Sector"}:</span> {selected.orgInfo.sector}</div>}
                      {selected.orgInfo.hq && <div><span className="text-ink-muted">{lang === "he" ? "מטה" : "HQ"}:</span> {selected.orgInfo.hq}</div>}
                      {selected.orgInfo.founded && <div><span className="text-ink-muted">{lang === "he" ? "נוסדה" : "Founded"}:</span> {selected.orgInfo.founded}</div>}
                      {selected.orgInfo.employees && <div><span className="text-ink-muted">{lang === "he" ? "עובדים" : "Employees"}:</span> {selected.orgInfo.employees}</div>}
                      {selected.orgInfo.ticker && <div><span className="text-ink-muted">{lang === "he" ? "טיקר" : "Ticker"}:</span> {selected.orgInfo.ticker}</div>}
                      {selected.orgInfo.website && <div className="col-span-2 truncate"><a href={selected.orgInfo.website.startsWith("http") ? selected.orgInfo.website : `https://${selected.orgInfo.website}`} target="_blank" rel="noopener noreferrer" className="text-brand-soft hover:underline">{selected.orgInfo.website}</a></div>}
                    </div>
                  )}
                  <ConfidenceBadge level={level(selected.confidence)} label={lang === "he" ? "ודאות" : "confidence"} />
                  <p className="text-xs text-ink-secondary">{selected.confidenceReason[lang]}</p>
                  <div className="label-muted pt-1">{lang === "he" ? "מקורות" : "Sources"}</div>
                  <ul className="space-y-1">
                    {selected.sources.map((s, i) => (
                      <li key={i} className="text-xs">
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-soft hover:underline">
                          {s.title.slice(0, 60)} <ExternalLink className="h-3 w-3" />
                        </a>
                        <span className="text-ink-muted"> · {s.publisher}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-ink-secondary">{lang === "he" ? "בחר צומת כדי לראות מקורות וודאות." : "Click a node to see its sources and confidence."}</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
