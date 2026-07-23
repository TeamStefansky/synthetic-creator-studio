// Relationship Board graph exports for professional analyst tools. Pure - no
// browser, no network - so it is unit-testable. English side of each Bilingual
// is primary (analyst tools are ASCII/LTR-first); Hebrew kept as a secondary
// column/attribute so nothing is lost.

import type { RelGraph, RelNode } from "./schema";

function csvCell(v: string | number | undefined | null): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function roleOrg(n: RelNode): string {
  return n.type === "role" ? n.orgName || "" : "";
}

/** nodes.csv - one row per node (i2 / Maltego). */
export function toNodesCsv(g: RelGraph): string {
  const header = "id,label,label_he,type,role,org,confidence,confidence_reason,primary_source_url";
  const rows = g.nodes.map((n) =>
    [
      n.id,
      n.name,
      n.label.he,
      n.type,
      n.type === "role" ? n.label.en : "",
      roleOrg(n),
      n.confidence.toFixed(2),
      n.confidenceReason.en,
      n.sources[0]?.url || "",
    ].map(csvCell).join(","),
  );
  return [header, ...rows].join("\n");
}

/** edges.csv - one row per edge (i2 / Maltego). ids reference nodes.csv. */
export function toEdgesCsv(g: RelGraph): string {
  const header = "source_id,target_id,label,label_he,type,confidence";
  const rows = g.edges.map((e) =>
    [e.source, e.target, e.label.en, e.label.he, e.type, e.confidence.toFixed(2)].map(csvCell).join(","),
  );
  return [header, ...rows].join("\n");
}

function xml(v: string | number | undefined | null): string {
  const s = v === undefined || v === null ? "" : String(v);
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** GraphML for Maltego / Gephi / yEd / Cytoscape. */
export function toGraphml(g: RelGraph): string {
  const nodeKeys = [
    ["label", "string"], ["label_he", "string"], ["type", "string"], ["role", "string"],
    ["org", "string"], ["confidence", "double"], ["primary_source_url", "string"],
  ];
  const edgeKeys = [["elabel", "string"], ["etype", "string"], ["econfidence", "double"]];
  const keyDecls = [
    ...nodeKeys.map(([id, t]) => `  <key id="${id}" for="node" attr.name="${id}" attr.type="${t}"/>`),
    ...edgeKeys.map(([id, t]) => `  <key id="${id}" for="edge" attr.name="${id.replace(/^e/, "")}" attr.type="${t}"/>`),
  ].join("\n");
  const nodeEls = g.nodes.map((n) => `    <node id="${xml(n.id)}">
      <data key="label">${xml(n.name)}</data>
      <data key="label_he">${xml(n.label.he)}</data>
      <data key="type">${xml(n.type)}</data>
      <data key="role">${xml(n.type === "role" ? n.label.en : "")}</data>
      <data key="org">${xml(roleOrg(n))}</data>
      <data key="confidence">${n.confidence.toFixed(2)}</data>
      <data key="primary_source_url">${xml(n.sources[0]?.url || "")}</data>
    </node>`).join("\n");
  const edgeEls = g.edges.map((e) => `    <edge id="${xml(e.id)}" source="${xml(e.source)}" target="${xml(e.target)}">
      <data key="elabel">${xml(e.label.en)}</data>
      <data key="etype">${xml(e.type)}</data>
      <data key="econfidence">${e.confidence.toFixed(2)}</data>
    </edge>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
${keyDecls}
  <graph id="relboard" edgedefault="directed">
${nodeEls}
${edgeEls}
  </graph>
</graphml>`;
}
