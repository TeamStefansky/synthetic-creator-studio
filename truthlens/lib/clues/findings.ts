// Findings / Case-board synthesis. Turns the raw cross-search clue index into
// investigation LEADS and CLUSTERS: "were connections found, how strong, and
// what to look at next" - the conclusions layer of the Link Board.
//
// Strictly within the frozen rules: every lead is a BAND (not a verdict) and
// carries its evidence + an innocent alternative; "no connections" is a valid,
// common result; nodes/entities are infrastructure/accounts, never people.

import { listLocal, type CheckRecord } from "@/lib/check/history";
import { entityLabel, type EntityKind } from "./extract";

const KEY = "tl:clueindex";

export type Band = "High" | "Medium" | "Low";

export interface FindingSearch { id: string; label: string; type: string }
export interface NextStep { label: string; href: string; external?: boolean }

export interface Finding {
  id: string;
  kind: EntityKind;
  value: string;
  entityLabel: string;   // human kind label, e.g. "Google Analytics ID"
  band: Band;
  searches: FindingSearch[];
  evidence: string;
  alternative: string;
  nextSteps: NextStep[];
}

export interface Cluster {
  id: number;
  band: Band;
  searches: FindingSearch[];
  bindings: { label: string; band: Band }[]; // the shared entities holding it together
}

export interface FindingsReport {
  searchCount: number;    // total searches held in memory
  linkedSearches: number; // searches that participate in >=1 lead
  findings: Finding[];
  clusters: Cluster[];
  strongest?: Band;
}

// How discriminating each clue kind is when shared between searches. A shared
// analytics/ad id or a non-wildcard TLS SAN is a near-unique operator tell; an
// ASN spans thousands of unrelated customers, so it is weak on its own.
const KIND_WEIGHT: Record<string, number> = {
  ga_id: 3, adsense_id: 3, ssl_san: 3,
  ip: 2.5, account: 2.5,
  net_org: 2, domain: 2, email_domain: 2,
  asn: 1,
};

const BAND_RANK: Record<Band, number> = { High: 3, Medium: 2, Low: 1 };
const bandFor = (kind: string): Band => {
  const w = KIND_WEIGHT[kind] ?? 1.5;
  return w >= 3 ? "High" : w >= 2 ? "Medium" : "Low";
};

// Innocent explanation per clue kind - required alongside every lead (rule 3).
const ALTERNATIVE: Record<string, string> = {
  ga_id: "the same tag can be copied onto unrelated sites, or one web agency set up both.",
  adsense_id: "an ad/publisher id can be reused across a network of otherwise unrelated sites.",
  ssl_san: "a shared hosting/CDN certificate can list many unrelated domains together.",
  ip: "shared or virtual hosting can place unrelated sites on one IP.",
  account: "a handle can be a common name or a coincidental reuse - confirm it is the same account.",
  net_org: "a common hosting/network provider - many unrelated organisations use the same host.",
  domain: "the domain may be referenced coincidentally rather than operated by the same party.",
  email_domain: "a shared mail provider (e.g. a webmail/host) is common and not distinctive.",
  asn: "an ASN spans thousands of unrelated customers - membership alone means little.",
};

function nextStepsFor(kind: EntityKind, value: string): NextStep[] {
  const q = encodeURIComponent(value);
  const bare = value.replace(/^@/, "");
  switch (kind) {
    case "domain":
    case "ssl_san":
    case "email_domain":
      return [
        { label: "Site Report", href: `/report?url=${q}` },
        { label: "Origin Exposure", href: `/tools/origin?domain=${q}` },
        { label: "Mentions", href: `/tools/mentions?entity=${q}` },
      ];
    case "ip":
      return [{ label: "IP lookup", href: `https://ipinfo.io/${q}`, external: true }];
    case "asn":
      return [{ label: "ASN / BGP", href: `https://bgp.he.net/${q}`, external: true }];
    case "ga_id":
    case "adsense_id":
      return [{ label: "Reverse-lookup the ID", href: `https://www.google.com/search?q=${encodeURIComponent(`"${value}"`)}`, external: true }];
    case "net_org":
      return [
        { label: "Screen operator", href: `/tools/sanctions?q=${q}` },
        { label: "Mentions", href: `/tools/mentions?entity=${q}` },
      ];
    case "account":
      return [{ label: "Mentions", href: `/tools/mentions?entity=${encodeURIComponent(bare)}` }];
    default:
      return [];
  }
}

function splitKey(ek: string): { kind: string; value: string } {
  const i = ek.indexOf(":");
  return i >= 0 ? { kind: ek.slice(0, i), value: ek.slice(i + 1) } : { kind: ek, value: "" };
}

/** Build the case-board report from the browser-local clue index + history. */
export function buildFindings(): FindingsReport {
  const empty: FindingsReport = { searchCount: 0, linkedSearches: 0, findings: [], clusters: [] };
  if (typeof window === "undefined") return empty;

  let idx: Record<string, string[]> = {};
  try { idx = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return empty; }
  const history: CheckRecord[] = listLocal();
  const byId = new Map(history.map((c) => [c.id, c]));
  const asSearch = (id: string): FindingSearch => {
    const c = byId.get(id);
    return { id, label: c?.headline || c?.input || id, type: c?.type || "search" };
  };

  // ---- Leads: every entity shared by 2+ real searches -----------------------
  const findings: Finding[] = [];
  for (const [ek, rawIds] of Object.entries(idx)) {
    const ids = [...new Set(rawIds)].filter((id) => byId.has(id));
    if (ids.length < 2) continue;
    const { kind, value } = splitKey(ek);
    const searches = ids.map(asSearch);
    const label = entityLabel[kind as EntityKind] || kind;
    findings.push({
      id: ek,
      kind: kind as EntityKind,
      value,
      entityLabel: label,
      band: bandFor(kind),
      searches,
      evidence: `Shared ${label} "${value}" appears in ${searches.length} searches: ${searches.map((s) => s.label).join(", ")}.`,
      alternative: ALTERNATIVE[kind] || "this overlap may be coincidental - confirm before drawing a conclusion.",
      nextSteps: nextStepsFor(kind as EntityKind, value),
    });
  }
  findings.sort((a, b) => BAND_RANK[b.band] - BAND_RANK[a.band] || b.searches.length - a.searches.length || a.entityLabel.localeCompare(b.entityLabel));

  // ---- Clusters: searches transitively linked by shared entities ------------
  const parent = new Map<string, string>();
  const find = (x: string): string => { while (parent.get(x) !== x) { const p = parent.get(x)!; parent.set(x, parent.get(p)!); x = p; } return x; };
  const union = (a: string, b: string) => { parent.set(find(a), find(b)); };
  for (const f of findings) {
    for (const s of f.searches) if (!parent.has(s.id)) parent.set(s.id, s.id);
    for (let i = 1; i < f.searches.length; i++) union(f.searches[0].id, f.searches[i].id);
  }
  const groups = new Map<string, { searches: Set<string>; bindings: Map<string, Band> }>();
  for (const f of findings) {
    const root = find(f.searches[0].id);
    const g = groups.get(root) || { searches: new Set<string>(), bindings: new Map<string, Band>() };
    f.searches.forEach((s) => g.searches.add(s.id));
    const bl = `${f.entityLabel}: ${f.value}`;
    if (!g.bindings.has(bl) || BAND_RANK[f.band] > BAND_RANK[g.bindings.get(bl)!]) g.bindings.set(bl, f.band);
    groups.set(root, g);
  }
  const clusters: Cluster[] = [...groups.values()]
    .filter((g) => g.searches.size >= 2)
    .map((g, i) => {
      const bindings = [...g.bindings.entries()].map(([label, band]) => ({ label, band })).sort((a, b) => BAND_RANK[b.band] - BAND_RANK[a.band]);
      const band = bindings.reduce<Band>((m, x) => (BAND_RANK[x.band] > BAND_RANK[m] ? x.band : m), "Low");
      return { id: i, band, searches: [...g.searches].map(asSearch), bindings };
    })
    .sort((a, b) => BAND_RANK[b.band] - BAND_RANK[a.band] || b.searches.length - a.searches.length);

  const linked = new Set<string>();
  findings.forEach((f) => f.searches.forEach((s) => linked.add(s.id)));

  return {
    searchCount: history.length,
    linkedSearches: linked.size,
    findings,
    clusters,
    strongest: findings[0]?.band,
  };
}

/** A shareable, plain-text case brief (Markdown) of the findings. Pure. */
export function findingsToMarkdown(r: FindingsReport): string {
  const L: string[] = [];
  L.push(`# TruthLens - Link Board case brief`);
  L.push("");
  L.push(`Decision-support, not a verdict. Leads are infrastructure/behaviour indicators, never claims about people. "Unknown" / "no connection" is a valid result.`);
  L.push("");
  if (r.findings.length === 0) {
    L.push(`**No connections found** across ${r.searchCount} saved search(es).`);
    return L.join("\n");
  }
  L.push(`**${r.findings.length} lead(s)** across **${r.linkedSearches}** of ${r.searchCount} searches · strongest: **${r.strongest}** · ${r.clusters.length} cluster(s).`);
  L.push("");
  if (r.clusters.length) {
    L.push(`## Clusters`);
    r.clusters.forEach((c) => {
      L.push(`- **Cluster ${c.id + 1}** (${c.band}) - ${c.searches.length} searches: ${c.searches.map((s) => s.label).join(", ")}`);
      L.push(`  - bound by: ${c.bindings.map((b) => `${b.label} [${b.band}]`).join("; ")}`);
    });
    L.push("");
  }
  L.push(`## Leads`);
  r.findings.forEach((f, i) => {
    L.push(`### ${i + 1}. ${f.entityLabel}: ${f.value} — ${f.band}`);
    L.push(`- Links: ${f.searches.map((s) => s.label).join(" ↔ ")}`);
    L.push(`- Evidence: ${f.evidence}`);
    L.push(`- Could also be: ${f.alternative}`);
    if (f.nextSteps.length) L.push(`- Next: ${f.nextSteps.map((n) => n.label).join(" · ")}`);
  });
  return L.join("\n");
}
