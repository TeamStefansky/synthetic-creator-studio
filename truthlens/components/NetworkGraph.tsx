"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ExternalLink, Search } from "lucide-react";
import type { OperatorNetwork } from "@/lib/types";
import type { InfluenceNetwork } from "@/lib/social-analyze/network-map";
import ConfidenceBadge, { ConfidenceLevel } from "@/components/ConfidenceBadge";

// react-force-graph-2d is browser-only; load it client-side without SSR.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const KIND_COLOR: Record<string, string> = {
  target: "#818cf8",
  domain: "#94a3b8",
  ip: "#38bdf8",
  ga: "#f59e0b",
  adsense: "#10b981",
};

const reportHref = (domain: string) => `/report?url=${encodeURIComponent(domain)}`;

// External OSINT pivot for non-domain nodes (IP lookup, or "who else uses this ID").
function externalNodeUrl(node: { kind?: string; label?: string }): string | null {
  if (!node.label) return null;
  if (node.kind === "ip") return `https://ipinfo.io/${node.label}`;
  if (node.kind === "ga" || node.kind === "adsense")
    return `https://www.google.com/search?q=${encodeURIComponent(`"${node.label}"`)}`;
  return null;
}

export default function NetworkGraph({ network }: { network: OperatorNetwork }) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [isMobile, setIsMobile] = useState(false);
  const [hovering, setHovering] = useState(false);

  // Domain/target -> run a fresh TruthLens report; IP/ID -> external OSINT pivot.
  const clickNode = (node: { kind?: string; label?: string }) => {
    if (!node.label) return;
    if (node.kind === "domain" || node.kind === "target") {
      router.push(reportHref(node.label));
      return;
    }
    const url = externalNodeUrl(node);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    const update = () => {
      const w = wrapRef.current?.clientWidth || 600;
      setWidth(w);
      setIsMobile(w < 640);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const data = useMemo(
    () => ({
      nodes: network.nodes.map((n) => ({ ...n })),
      links: network.edges.map((e) => ({ ...e })),
    }),
    [network],
  );

  // Clickable list of every domain node (target + siblings) - reliable on mobile.
  const domainLinks = useMemo(
    () =>
      network.nodes
        .filter((n) => n.kind === "domain" || n.kind === "target")
        .map((n) => ({ label: n.label, flaggedFake: n.flaggedFake })),
    [network],
  );

  if (network.nodes.length <= 1) {
    return (
      <p className="text-sm text-gray-500">
        No connected sibling domains or shared identifiers found - the operator
        network is just this domain.
      </p>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="overflow-hidden rounded-xl border border-white/10 bg-black/30"
      style={{ cursor: hovering ? "pointer" : "default" }}
    >
      <ForceGraph2D
        graphData={data as any}
        width={width}
        height={isMobile ? 320 : 460}
        backgroundColor="rgba(0,0,0,0)"
        nodeRelSize={isMobile ? 4 : 5}
        linkColor={() => "rgba(255,255,255,0.18)"}
        linkWidth={1}
        cooldownTicks={isMobile ? 60 : 120}
        onNodeClick={(n: any) => clickNode(n)}
        onNodeHover={(n: any) => setHovering(!!n)}
        nodeColor={(n: any) => (n.flaggedFake ? "#ef4444" : KIND_COLOR[n.kind] || "#94a3b8")}
        nodeCanvasObjectMode={() => "after"}
        nodeCanvasObject={(node: any, ctx: any, scale: number) => {
          // On mobile only label the target node to reduce clutter.
          if (isMobile && node.kind !== "target") return;
          const label = node.label as string;
          const fontSize = Math.max(10 / scale, 3);
          ctx.font = `${fontSize}px ui-sans-serif, system-ui`;
          ctx.fillStyle = node.kind === "target" ? "#c7d2fe" : "rgba(229,231,235,0.8)";
          ctx.textAlign = "center";
          ctx.fillText(label.length > 28 ? label.slice(0, 27) + "…" : label, node.x, node.y + 9);
        }}
      />
      <div className="flex flex-wrap gap-3 px-3 py-2 text-xs text-gray-400">
        <Legend color="#818cf8" label="Target" />
        <Legend color="#94a3b8" label="Sibling domain" />
        <Legend color="#38bdf8" label="IP" />
        <Legend color="#f59e0b" label="GA id" />
        <Legend color="#10b981" label="AdSense id" />
        <Legend color="#ef4444" label="Flagged fake" />
      </div>

      {/* Clickable domain links (tap-friendly; nodes are also clickable). */}
      <div className="border-t border-white/10 px-3 py-2.5">
        <div className="label-muted mb-1.5">
          Linked domains - analyze in TruthLens, or open the site
        </div>
        <div className="flex flex-wrap gap-1.5">
          {domainLinks.map((d) => (
            <span
              key={d.label}
              className={`inline-flex items-center overflow-hidden rounded-lg border text-xs ${
                d.flaggedFake ? "border-risk-high/40" : "border-white/10"
              }`}
            >
              <button
                onClick={() => router.push(reportHref(d.label))}
                title="Analyze in TruthLens"
                className={`inline-flex items-center gap-1 px-2 py-1 transition hover:bg-white/[0.06] ${
                  d.flaggedFake ? "text-risk-high" : "text-gray-200"
                }`}
              >
                <Search className="h-3 w-3 opacity-70" />
                {d.label}
              </button>
              <a
                href={`https://${d.label}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Open the site in a new tab"
                className="border-l border-white/10 px-1.5 py-1 text-gray-400 transition hover:bg-white/[0.06] hover:text-gray-200"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Influence-network map renderer (BUILD_ORDER [4]). Reuses the same
// react-force-graph-2d stack. Accounts sized by influence, coloured by cluster;
// OBSERVED edges solid vs INFERRED edges dashed (with a legend); earliest and
// flagged-inauthentic nodes badged; hovering an edge shows its evidence +
// alternative. Below the graph: cluster + core/bridge lists. Nodes are accounts
// and domains only - never people/actors.
// ---------------------------------------------------------------------------

const CLUSTER_COLORS = ["#818cf8", "#34d399", "#fbbf24", "#fb7185", "#38bdf8", "#f472b6", "#a3e635", "#c084fc"];
const clusterColor = (c?: number) => (c === undefined ? "#94a3b8" : CLUSTER_COLORS[c % CLUSTER_COLORS.length]);
const CONF: Record<string, ConfidenceLevel> = { High: "High", Medium: "Medium", Low: "Low" };

function profileUrl(platform?: string, handle?: string): string | null {
  if (!handle) return null;
  if (platform === "bluesky") return `https://bsky.app/profile/${handle}`;
  if (platform === "x") return `https://x.com/${handle}`;
  return null;
}

export function InfluenceNetworkGraph({ network }: { network: InfluenceNetwork }) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [isMobile, setIsMobile] = useState(false);
  const [hoverEdge, setHoverEdge] = useState<any>(null);

  useEffect(() => {
    const update = () => {
      const w = wrapRef.current?.clientWidth || 600;
      setWidth(w); setIsMobile(w < 640);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const data = useMemo(() => ({
    nodes: network.nodes.map((n) => ({ ...n, val: n.kind === "account" ? 1 + (n.influence || 0) * 6 : 1 })),
    links: network.edges.map((e) => ({ ...e })),
  }), [network]);

  const clickNode = (n: any) => {
    if (n.kind === "domain") { router.push(reportHref(n.label)); return; }
    const url = profileUrl(n.platform, n.label);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  if (network.insufficient) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-gray-400">
        Insufficient data to map a network - {network.note || "too few connected nodes/edges in the collected set."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div ref={wrapRef} className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30">
        <ForceGraph2D
          graphData={data as any}
          width={width}
          height={isMobile ? 340 : 500}
          backgroundColor="rgba(0,0,0,0)"
          nodeRelSize={isMobile ? 4 : 5}
          nodeVal={(n: any) => n.val}
          linkColor={(l: any) => (l.evidence?.mode === "observed" ? "rgba(129,140,248,0.55)" : "rgba(255,255,255,0.22)")}
          linkLineDash={(l: any) => (l.evidence?.mode === "inferred" ? [4, 3] : null)}
          linkWidth={(l: any) => (l.evidence?.mode === "observed" ? 1.5 : 1)}
          cooldownTicks={isMobile ? 60 : 120}
          onNodeClick={clickNode}
          onLinkHover={(l: any) => setHoverEdge(l)}
          nodeColor={(n: any) => (n.kind === "domain" ? "#94a3b8" : clusterColor(n.cluster))}
          nodeCanvasObjectMode={() => "after"}
          nodeCanvasObject={(node: any, ctx: any, scale: number) => {
            // Rings: earliest-observable (cyan) and flagged-inauthentic (red).
            const r = Math.sqrt(node.val) * (isMobile ? 4 : 5) + 1.5;
            if (node.flaggedInauthentic) { ctx.strokeStyle = "#fb7185"; ctx.lineWidth = 1.5 / scale; ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, 2 * Math.PI); ctx.stroke(); }
            if (node.earliestObservable) { ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 1.5 / scale; ctx.beginPath(); ctx.arc(node.x, node.y, r + 2 / scale, 0, 2 * Math.PI); ctx.stroke(); }
            if (isMobile && node.kind === "domain") return;
            const label = String(node.label || "");
            const fontSize = Math.max(10 / scale, 3);
            ctx.font = `${fontSize}px ui-sans-serif, system-ui`;
            ctx.fillStyle = node.kind === "domain" ? "rgba(148,163,184,0.85)" : "rgba(229,231,235,0.85)";
            ctx.textAlign = "center";
            ctx.fillText(label.length > 24 ? label.slice(0, 23) + "…" : label, node.x, node.y + r + fontSize);
          }}
        />
        {hoverEdge?.evidence && (
          <div className="pointer-events-none absolute left-2 top-2 max-w-[85%] rounded-lg border border-white/15 bg-black/85 p-2 text-xs text-gray-200">
            <span className={`font-semibold ${hoverEdge.evidence.mode === "observed" ? "text-brand-soft" : "text-gray-300"}`}>
              {hoverEdge.evidence.mode === "observed" ? "Observed" : "Inferred"} · {hoverEdge.evidence.kind}
            </span>
            <span className="text-gray-500"> ({hoverEdge.evidence.confidence})</span>
            <div className="mt-0.5 text-gray-400">{hoverEdge.evidence.signals?.join("; ")}</div>
            <div className="text-gray-500">Could also be: {hoverEdge.evidence.alternative}</div>
          </div>
        )}
        <div className="flex flex-wrap gap-3 px-3 py-2 text-xs text-gray-400">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-4 border-t-2 border-brand-soft" /> Observed (real interaction / citation)</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-4 border-t-2 border-dashed border-white/40" /> Inferred (co-behavior)</span>
          <Legend color="#38bdf8" label="Earliest observed (not the origin)" />
          <Legend color="#fb7185" label="Flagged inauthentic (indicator)" />
        </div>
      </div>

      {network.observedEdgeKinds.length === 0 && (
        <p className="text-xs text-gray-500">
          No OBSERVED interaction edges - the connected sources don’t expose a repost/reply/quote graph (that needs a paid platform API). All lines shown are inferred co-behavior.
        </p>
      )}

      {/* Cluster summaries */}
      {network.clusters.length > 0 && (
        <div>
          <div className="label-muted mb-1.5">Coordination clusters</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {network.clusters.map((c) => (
              <div key={c.id} className="rounded-lg border border-white/[0.06] p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-gray-200">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: clusterColor(c.id) }} />
                    Cluster {c.id + 1} · {c.size} accounts
                  </span>
                  <ConfidenceBadge level={CONF[c.confidence] || "Unknown"} />
                </div>
                <div className="mt-1 text-gray-500">
                  {c.dominantEdgeKinds.length ? `co-behavior: ${c.dominantEdgeKinds.join(", ")}` : "no dominant co-behavior"}
                  {c.languages.length ? ` · ${c.multiLanguage ? "multi-language: " : "language: "}${c.languages.join(", ")}` : ""}
                </div>
                <div className="text-gray-600">A tightly co-behaving group - not an organization or actor.</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Core + bridge */}
      {(network.core.length > 0 || network.bridges.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <RankedList title="Core amplifiers" nodes={network.core} />
          <RankedList title="Bridge accounts (cross-cluster)" nodes={network.bridges} />
        </div>
      )}

      <p className="text-xs text-gray-500">
        Structure of a coordinated cluster - accounts and domains, never a person or actor. A visual line is a claim: it carries its evidence and an innocent alternative. Solid = observed fact; dashed = inferred co-behavior.
      </p>
    </div>
  );
}

function RankedList({ title, nodes }: { title: string; nodes: InfluenceNetwork["core"] }) {
  if (!nodes.length) return <div className="text-xs text-gray-500">{title}: none.</div>;
  return (
    <div>
      <div className="label-muted mb-1.5">{title}</div>
      <ul className="space-y-1.5">
        {nodes.map((n) => (
          <li key={n.id} className="rounded-lg border border-white/[0.06] p-2 text-xs">
            <div className="text-gray-200">{n.label} <span className="text-gray-500">· influence {n.influence}{n.bridges ? ` · bridges ${n.bridges}` : ""}</span></div>
            {n.signals.map((s, i) => <div key={i} className="text-gray-500">{s}</div>)}
            <div className="text-gray-600">Could also be: {n.alternative}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
