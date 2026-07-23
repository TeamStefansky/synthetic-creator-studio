// Relationship Board - ORG-LEVEL link analysis. Nodes are organizations and
// disclosed corporate ROLE labels (role + org + citation) - never a person
// dossier. There is deliberately NO field for bio, photo, personal activity,
// contact, address, family, etc.: the shape itself makes person-profiling
// impossible (CLAUDE.md rule 1; "nodes are accounts/orgs/infra, never people";
// registry rule "organizations only; no person records"). Provenance is
// mandatory (>=1 source per node). Zero-dependency validation (repo convention).

export interface Bilingual { he: string; en: string }

export interface RelSource {
  title: string;
  url: string;
  publisher: string;
  retrievedAt: string; // ISO date
}

export type RelNodeType = "organization" | "role";
export type RelEdgeType =
  | "parent" | "subsidiary" | "partner" | "funder" | "related_org" | "shared_infra" | "officer_role";

export const REL_EDGE_TYPES: RelEdgeType[] = [
  "parent", "subsidiary", "partner", "funder", "related_org", "shared_infra", "officer_role",
];

export interface RelNode {
  id: string;
  type: RelNodeType;
  /** Proper noun - org name, or a disclosed role title (e.g. "Chief Executive"). NOT a personal profile. */
  name: string;
  label: Bilingual;
  /** For a role node: the org the role is held at. Undefined for org nodes. */
  orgName?: string;
  /** For a role node ONLY: the disclosed office-holder's name (a single public
   * corporate-disclosure fact, cited via sources). This is the ONLY personal
   * datum in the graph - there is deliberately no field for bio, photo, age,
   * contact, family, or any other personal data, and there are no
   * person-to-person edges. */
  officeholder?: string;
  confidence: number; // 0-1
  confidenceReason: Bilingual;
  sources: RelSource[]; // min 1 - provenance mandatory
}

export interface RelEdge {
  id: string;
  source: string; // RelNode.id
  target: string; // RelNode.id
  type: RelEdgeType;
  label: Bilingual;
  confidence: number;
}

export interface RelGraph {
  company: string;
  centralNodeId: string;
  nodes: RelNode[];
  edges: RelEdge[];
  generatedAt: string;
}

// Fields that must NEVER appear on a node - personal/dossier data. If a model
// emits them we drop them silently (defense in depth; the type has no slot for
// them, and validation only copies known fields).
export const FORBIDDEN_NODE_FIELDS = [
  "bio", "photo", "photourl", "image", "avatar", "highlights", "notableactivity",
  "activity", "address", "home", "phone", "email", "family", "spouse", "children",
  "health", "religion", "ethnicity", "dob", "birth", "age", "personal", "contact",
];

function isBilingual(v: any): v is Bilingual {
  return v && typeof v.he === "string" && typeof v.en === "string";
}
function isHttpUrl(v: any): boolean {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}
function num01(v: any): number | null {
  const n = Number(v);
  return isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

function cleanSource(s: any): RelSource | null {
  if (!s || !isHttpUrl(s.url)) return null;
  return {
    title: String(s.title || "").slice(0, 300) || "(untitled)",
    url: String(s.url),
    publisher: String(s.publisher || "").slice(0, 120) || "(unknown)",
    retrievedAt: String(s.retrievedAt || new Date().toISOString().slice(0, 10)),
  };
}

/** Copy ONLY the known, allowed node fields - structurally strips any personal
 * dossier field the model may have emitted. Returns null if the node is invalid
 * (no name, no valid source, bad confidence). */
function cleanNode(n: any): RelNode | null {
  if (!n || typeof n.id !== "string" || !n.id.trim()) return null;
  const type: RelNodeType = n.type === "role" ? "role" : "organization";
  const name = String(n.name || "").trim();
  if (!name) return null;
  if (!isBilingual(n.label)) return null;
  const confidence = num01(n.confidence);
  if (confidence === null) return null;
  if (!isBilingual(n.confidenceReason)) return null;
  const sources = (Array.isArray(n.sources) ? n.sources : []).map(cleanSource).filter(Boolean) as RelSource[];
  if (sources.length === 0) return null; // provenance mandatory
  const node: RelNode = {
    id: n.id.trim(),
    type,
    name: name.slice(0, 200),
    label: { he: String(n.label.he).slice(0, 200), en: String(n.label.en).slice(0, 200) },
    confidence,
    confidenceReason: { he: String(n.confidenceReason.he).slice(0, 300), en: String(n.confidenceReason.en).slice(0, 300) },
    sources: sources.slice(0, 8),
  };
  if (type === "role" && n.orgName) node.orgName = String(n.orgName).slice(0, 200);
  // Disclosed office-holder name (role nodes only) - the single cited personal
  // fact; everything else personal stays out (fields not copied = stripped).
  if (type === "role" && n.officeholder) node.officeholder = String(n.officeholder).slice(0, 120);
  return node;
}

function cleanEdge(e: any, ids: Set<string>): RelEdge | null {
  if (!e || typeof e.source !== "string" || typeof e.target !== "string") return null;
  if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) return null;
  const type: RelEdgeType = REL_EDGE_TYPES.includes(e.type) ? e.type : "related_org";
  if (!isBilingual(e.label)) return null;
  const confidence = num01(e.confidence);
  if (confidence === null) return null;
  return {
    id: String(e.id || `${e.source}-${e.target}-${type}`),
    source: e.source, target: e.target, type,
    label: { he: String(e.label.he).slice(0, 120), en: String(e.label.en).slice(0, 120) },
    confidence,
  };
}

export interface ValidateResult {
  ok: boolean;
  graph?: RelGraph;
  errors: string[];
}

/** Validate + sanitize raw engine output into a RelGraph. Drops invalid
 * nodes/edges and any personal field; enforces provenance + referential
 * integrity. Never throws. */
export function validateRelGraph(raw: any, company: string): ValidateResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["output is not an object"] };

  const nodes = (Array.isArray(raw.nodes) ? raw.nodes : []).map(cleanNode).filter(Boolean) as RelNode[];
  if (nodes.length === 0) errors.push("no valid nodes (each needs id, name, bilingual label, confidence, >=1 source)");

  // De-duplicate by id (same org/role must be one node).
  const byId = new Map<string, RelNode>();
  for (const n of nodes) if (!byId.has(n.id)) byId.set(n.id, n);
  const uniqueNodes = [...byId.values()];
  const ids = new Set(uniqueNodes.map((n) => n.id));

  const edges = (Array.isArray(raw.edges) ? raw.edges : []).map((e: any) => cleanEdge(e, ids)).filter(Boolean) as RelEdge[];

  let centralNodeId = typeof raw.centralNodeId === "string" && ids.has(raw.centralNodeId)
    ? raw.centralNodeId
    : uniqueNodes.find((n) => n.type === "organization")?.id || uniqueNodes[0]?.id;
  if (!centralNodeId) errors.push("no central node");

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    graph: {
      company: String(raw.company || company),
      centralNodeId: centralNodeId!,
      nodes: uniqueNodes,
      edges,
      generatedAt: new Date().toISOString(),
    },
  };
}
