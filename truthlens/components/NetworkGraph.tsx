"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ExternalLink, Search } from "lucide-react";
import type { OperatorNetwork } from "@/lib/types";

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

  // Clickable list of every domain node (target + siblings) — reliable on mobile.
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
        No connected sibling domains or shared identifiers found — the operator
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
          Linked domains — analyze in TruthLens, or open the site
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
