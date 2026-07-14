"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Network as NetworkIcon } from "lucide-react";
import type { OperatorNetwork, GraphNode } from "@/lib/types";

// react-force-graph-2d touches the DOM/canvas and must never run during SSR.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

const KIND_COLOR: Record<GraphNode["kind"], string> = {
  target: "#3b82f6",
  domain: "#94a3b8",
  ip: "#a78bfa",
  ga: "#f59e0b",
  adsense: "#10b981",
};

export default function NetworkGraph({
  network,
}: {
  network: OperatorNetwork;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [isMobile, setIsMobile] = useState(false);

  // Responsive sizing: graph fills its container and re-fits on resize.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setWidth(el.clientWidth);
      setIsMobile(el.clientWidth < 640);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // react-force-graph mutates the data object, so give it a stable clone.
  const data = useMemo(
    () => ({
      nodes: network.nodes.map((n) => ({ ...n })),
      links: network.edges.map((e) => ({ ...e })),
    }),
    [network]
  );

  const height = isMobile ? 320 : 440;
  const hasSiblings = network.nodes.length > 1;

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <NetworkIcon className="h-5 w-5 text-emerald-400" />
        <h3 className="font-semibold text-slate-200">Operator network</h3>
        <span className="ml-auto text-xs text-slate-500">
          {network.nodes.length} nodes · {network.edges.length} links
        </span>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        Domains linked to the target by a shared IP, analytics/AdSense ID, or
        SSL certificate. Red nodes match the known-fake seed list.
      </p>

      <div
        ref={containerRef}
        className="overflow-hidden rounded-lg border border-surface-border bg-surface/60"
        style={{ height }}
      >
        {hasSiblings ? (
          <ForceGraph2D
            graphData={data}
            width={width}
            height={height}
            backgroundColor="rgba(0,0,0,0)"
            cooldownTicks={isMobile ? 60 : 100}
            nodeRelSize={isMobile ? 5 : 6}
            linkColor={() => "rgba(148,163,184,0.25)"}
            linkWidth={1}
            nodeLabel={(node: any) =>
              `${node.label}${node.known === "fake" ? " (flagged)" : ""}`
            }
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const isTarget = node.kind === "target";
              const r = isTarget ? 7 : 5;
              const color =
                node.known === "fake"
                  ? "#ef4444"
                  : KIND_COLOR[node.kind as GraphNode["kind"]] ?? "#94a3b8";

              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
              if (isTarget) {
                ctx.lineWidth = 2;
                ctx.strokeStyle = "#dbeafe";
                ctx.stroke();
              }

              // On desktop (or for the target), draw a label. On mobile we keep
              // labels sparse so the graph stays readable on small screens.
              const showLabel = !isMobile || isTarget;
              if (showLabel && globalScale > 0.5) {
                const fontSize = Math.max(9, 11 / globalScale);
                ctx.font = `${fontSize}px ui-sans-serif, system-ui`;
                ctx.fillStyle = "#cbd5e1";
                ctx.textAlign = "center";
                ctx.fillText(
                  node.label.length > 22
                    ? node.label.slice(0, 21) + "…"
                    : node.label,
                  node.x,
                  node.y + r + fontSize
                );
              }
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-500">
            No connected sibling domains were found from the available signals
            (shared IP, analytics/AdSense IDs, or SSL SAN).
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <LegendDot color={KIND_COLOR.target} label="Target" />
        <LegendDot color={KIND_COLOR.domain} label="Domain" />
        <LegendDot color={KIND_COLOR.ip} label="IP" />
        <LegendDot color={KIND_COLOR.ga} label="Analytics ID" />
        <LegendDot color={KIND_COLOR.adsense} label="AdSense ID" />
        <LegendDot color="#ef4444" label="Flagged (known-fake)" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
