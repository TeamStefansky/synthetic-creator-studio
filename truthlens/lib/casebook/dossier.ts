// Casebook dossier builder — assembles the structured OSINT report (the
// "1984 Hosting"-style dossier) from ONLY the searches linked to a case.
//
// Pure + deterministic (no Date.now, no I/O — the caller passes generatedAt), so
// a given case + search set always produces the same dossier (rule 8). It never
// fabricates: every subject, evidence row and infrastructure fact is derived
// from a collected CheckRecord. Frozen rules honored:
//   - every cross-search link carries confidence + evidence + an alternative
//     ("could also be explained by …") (rule 3);
//   - the conclusion is CAPPED at "Association" — infrastructure links are never
//     shared ownership, never a person, never an actor (Investigator invariants);
//   - a shared entity that is a generic CDN/mega-provider is Background, not
//     evidence; nothing distinctive → "No link established" (rule 4);
//   - gaps (what was NOT scanned) are stated, never silently dropped.

import { extractEntities, type Entity, type EntityKind } from "@/lib/clues/extract";
import { buildHostConduct, type HostConductProfile } from "@/lib/host-conduct";
import { CASEBOOK_VERSION } from "./types";

export type Band = "High" | "Medium" | "Low" | "Background";

/** A search linked to the case, in the shape the dossier needs. */
export interface DossierCheck {
  id: string;
  type: string;
  input: string;
  headline: string;
  level?: string;
  result?: any;
  createdAt: string;
}

export interface DossierSubject {
  checkId: string;
  domain: string;
  headline: string;
  /** Site-Report risk score if this search produced one (0–100). */
  risk?: number;
  confidence?: string;
  facts: string[];
}

export interface EvidenceRow {
  key: string; // "<kind>:<value>"
  kind: EntityKind;
  value: string;
  label: string;
  evidence: string;
  confidence: Band;
  alternative: string;
  /** Check ids that share this entity (≥2 for a cross-search link). */
  searches: string[];
}

export interface InfraFact {
  label: string;
  value: string;
  source: string; // which linked search surfaced it
}

export type ConclusionLevel =
  | "Association"
  | "Weak association"
  | "No link established"
  | "Insufficient data";

export interface CaseDossier {
  version: string;
  caseId: string;
  title: string;
  subject: string;
  generatedAt: string;
  toolsUsed: string[];
  searchCount: number;
  subjects: DossierSubject[];
  evidence: EvidenceRow[];
  infrastructure: InfraFact[];
  /** Documented, cited conduct of the hosts behind the infrastructure (court
   * records, watchdog designations). High confidence — public record. Separated
   * from any client claim. Empty when no host in the case is on file. */
  hostConduct: HostConductProfile[];
  conclusionLevel: ConclusionLevel;
  conclusionConfidence: Band | "Unknown";
  bluf: string;
  gaps: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "This document is a decision-support tool, not a verdict. The findings are infrastructural and behavioural indicators about infrastructure and identifiers, never a claim about people. “Unknown” and “no link” are valid results. Verify every detail before relying on it.";

const TYPE_LABEL: Record<string, string> = {
  site: "Site Report", report: "Site Report", post: "Post Check", logs: "Log Analyzer",
  email: "Email Tracer", origin: "Origin Exposure", "origin-map": "Origin Map",
  mentions: "Brand Mentions", signal: "SIGNAL Grid", linkboard: "Link Board",
  relboard: "Relationship Board", sanctions: "Sanctions Screening", ngo: "Nonprofit Registry",
  crypto: "Crypto OSINT", media: "Media Check", geopolitics: "Geopolitics", case: "Case Synthesis",
};

// Distinctiveness of a SHARED entity across two different searches. Mirrors the
// Link Board rung idea (lib/board/calibrate) applied to the generic clue
// EntityKind: a copied analytics/ads account or a shared cert is a strong,
// distinctive link; shared infrastructure (IP/ASN/host) is weaker; a
// mega-provider is expected background, not evidence.
const DISTINCTIVENESS: Record<EntityKind, { band: Band; label: string; alt: string }> = {
  ga_id: { band: "High", label: "Google Analytics ID", alt: "The same tag can be copied onto unrelated sites, or one agency built both." },
  adsense_id: { band: "High", label: "AdSense publisher ID", alt: "An ad account can be reused across unrelated properties by the same publisher or a shared manager." },
  ssl_san: { band: "High", label: "Shared TLS certificate name", alt: "A shared hosting panel or wildcard cert can group unrelated domains onto one certificate." },
  net_org: { band: "Medium", label: "Hosting/network operator", alt: "Many independent clients use the same niche host; using it is not evidence of a shared operator." },
  asn: { band: "Medium", label: "Autonomous System (ASN)", alt: "An ASN hosts many unrelated networks; co-location is not ownership." },
  ip: { band: "Medium", label: "Shared IP address", alt: "Shared or virtual hosting can place unrelated sites on the same IP." },
  email_domain: { band: "Medium", label: "Mail domain", alt: "A shared mail provider is common and not distinctive." },
  account: { band: "Medium", label: "Account/handle", alt: "Handles can be reused, coincidental, or impersonated." },
  domain: { band: "Background", label: "Domain", alt: "The same domain across searches is the same asset, not a link between two." },
};

function bandRank(b: Band | "Unknown"): number {
  return b === "High" ? 3 : b === "Medium" ? 2 : b === "Low" ? 1 : 0;
}

function niceEntity(kind: EntityKind, value: string): string {
  if (kind === "asn") return value.toUpperCase();
  return value;
}

/** Read a Site-Report-style risk score from a check result, defensively. */
function riskOf(result: any): { risk?: number; confidence?: string } {
  const r = result?.risk || result?.report?.risk || result?.report?.report?.risk;
  const score = Number(r?.score);
  const confidence = r?.confidence || result?.report?.confidence;
  return { risk: isFinite(score) ? Math.round(score) : undefined, confidence };
}

/** Best-effort primary domain/subject label for a search. */
function subjectLabel(c: DossierCheck): string {
  const ents = extractEntities(c.type, c.input, c.result);
  const dom = ents.find((e) => e.kind === "domain");
  if (dom) return dom.value;
  return (c.input || c.headline || "").split(/\s+/)[0] || c.headline || "subject";
}

/**
 * Build the case dossier from the linked searches. `generatedAt` is supplied by
 * the caller so the function stays pure/deterministic.
 */
export function buildDossier(
  opts: { caseId: string; name: string; subject?: string; checks: DossierCheck[]; generatedAt: string },
): CaseDossier {
  const { caseId, name, subject = "", checks, generatedAt } = opts;

  const toolsUsed = [...new Set(checks.map((c) => TYPE_LABEL[c.type] || c.type))].sort();

  // ---- Subjects: the site/asset profiles collected in this case ----------
  const subjects: DossierSubject[] = checks
    .filter((c) => c.type === "site" || c.type === "report")
    .map((c) => {
      const { risk, confidence } = riskOf(c.result);
      const facts: string[] = [];
      if (c.level) facts.push(`Assessed level: ${c.level}`);
      return { checkId: c.id, domain: subjectLabel(c), headline: c.headline, risk, confidence, facts };
    });

  // ---- Cross-search entity links (the evidence chain) --------------------
  // Map each distinctive entity → the set of DIFFERENT searches carrying it.
  const byEntity = new Map<string, { kind: EntityKind; value: string; searches: Set<string> }>();
  for (const c of checks) {
    const ents: Entity[] = extractEntities(c.type, c.input, c.result);
    const seenHere = new Set<string>();
    for (const e of ents) {
      const key = `${e.kind}:${e.value.toLowerCase()}`;
      if (seenHere.has(key)) continue; // one vote per search
      seenHere.add(key);
      const rec = byEntity.get(key) || { kind: e.kind, value: e.value, searches: new Set<string>() };
      rec.searches.add(c.id);
      byEntity.set(key, rec);
    }
  }

  const evidence: EvidenceRow[] = [];
  for (const [key, rec] of byEntity) {
    if (rec.searches.size < 2) continue; // a link needs ≥2 different searches
    if (rec.kind === "domain") continue; // same asset, not a link
    const d = DISTINCTIVENESS[rec.kind];
    evidence.push({
      key,
      kind: rec.kind,
      value: niceEntity(rec.kind, rec.value),
      label: d.label,
      evidence: `Appears in ${rec.searches.size} of ${checks.length} searches in this case.`,
      confidence: d.band,
      alternative: d.alt,
      searches: [...rec.searches],
    });
  }
  // Strongest first: distinctiveness, then how many searches share it.
  evidence.sort((a, b) => bandRank(b.confidence) - bandRank(a.confidence) || b.searches.length - a.searches.length || (a.key < b.key ? -1 : 1));

  // ---- Infrastructure profile (from origin/linkboard/map searches) -------
  const infra: InfraFact[] = [];
  const infraSeen = new Set<string>();
  for (const c of checks) {
    if (!["origin", "origin-map", "linkboard", "relboard", "site", "report"].includes(c.type)) continue;
    const ents = extractEntities(c.type, c.input, c.result);
    for (const e of ents) {
      if (e.kind !== "asn" && e.kind !== "net_org") continue;
      const k = `${e.kind}:${e.value.toLowerCase()}`;
      if (infraSeen.has(k)) continue;
      infraSeen.add(k);
      infra.push({
        label: e.kind === "asn" ? "Autonomous System" : "Hosting/network operator",
        value: niceEntity(e.kind, e.value),
        source: TYPE_LABEL[c.type] || c.type,
      });
    }
  }

  // ---- Host conduct: documented, cited conduct of the hosts on file ------
  // For each distinct host operator/ASN in the infrastructure, pull its
  // public-record conduct. This is the "simple research following the
  // connections" done automatically — High confidence, cited, and kept SEPARATE
  // from any claim about a client that merely shares the infrastructure.
  const hostConduct: HostConductProfile[] = [];
  const hcSeen = new Set<string>();
  for (const f of infra) {
    const p = f.label === "Autonomous System"
      ? buildHostConduct({ asn: f.value })
      : buildHostConduct({ org: f.value, hostName: f.value });
    if (p.matched && p.org && !hcSeen.has(p.org)) {
      hcSeen.add(p.org);
      hostConduct.push(p);
    }
  }

  // ---- Conclusion (capped at Association) --------------------------------
  const top = evidence[0];
  let conclusionLevel: ConclusionLevel;
  let conclusionConfidence: Band | "Unknown";
  if (checks.length < 2) {
    conclusionLevel = "Insufficient data";
    conclusionConfidence = "Unknown";
  } else if (top && top.confidence === "High") {
    conclusionLevel = "Association";
    conclusionConfidence = "High";
  } else if (top && top.confidence === "Medium") {
    conclusionLevel = "Weak association";
    conclusionConfidence = "Medium";
  } else {
    conclusionLevel = "No link established";
    conclusionConfidence = evidence.length ? "Low" : "Unknown";
  }

  // ---- Gaps: what was NOT scanned ---------------------------------------
  const gaps: string[] = [];
  const haveTypes = new Set(checks.map((c) => c.type));
  if (!haveTypes.has("origin") && !haveTypes.has("origin-map")) gaps.push("Origin/hosting exposure was not run — hosting and IP associations are unverified.");
  if (!haveTypes.has("linkboard") && !haveTypes.has("relboard")) gaps.push("Link Board cross-referencing was not run — shared-infrastructure links may be incomplete.");
  if (!haveTypes.has("signal") && !haveTypes.has("mentions")) gaps.push("Platforms such as Telegram / X / Meta were not scanned — narrative spread is out of scope for this dossier.");
  gaps.push("Registration dates (RDAP) and archive coverage are only present where a search collected them.");
  gaps.push("Infrastructure association is not shared ownership; treat every link as a lead to verify, not a conclusion.");

  // ---- Deterministic BLUF (LLM may replace the wording later) ------------
  const bluf = buildBluf({ name, subject, checks, subjects, evidence, top, conclusionLevel, hostConduct });

  return {
    version: CASEBOOK_VERSION,
    caseId,
    title: name,
    subject,
    generatedAt,
    toolsUsed,
    searchCount: checks.length,
    subjects,
    evidence,
    infrastructure: infra,
    hostConduct,
    conclusionLevel,
    conclusionConfidence,
    bluf,
    gaps,
    disclaimer: DISCLAIMER,
  };
}

function buildBluf(a: {
  name: string; subject: string; checks: DossierCheck[]; subjects: DossierSubject[];
  evidence: EvidenceRow[]; top?: EvidenceRow; conclusionLevel: ConclusionLevel;
  hostConduct: HostConductProfile[];
}): string {
  if (a.checks.length < 2) {
    return `This case contains ${a.checks.length} search${a.checks.length === 1 ? "" : "es"}. Add at least two searches to establish links between assets. Unknown is a valid result.`;
  }
  const parts: string[] = [];
  // A documented, high-severity host on file is a load-bearing, citable finding —
  // lead with it (it is public record about the host, not a claim about a client).
  const severeHost = a.hostConduct.find((h) => h.topSeverity === "high");
  if (severeHost) {
    const f = severeHost.findings.find((x) => x.severity === "high");
    parts.push(`The infrastructure in this case runs through ${severeHost.org}, a host with documented public-record conduct: ${f?.label.toLowerCase()} (${(f?.sources || []).slice(0, 2).join("; ")}). ${severeHost.clientCaveat}`);
  }
  if (a.top) {
    const strength = a.top.confidence === "High" ? "one high-confidence link" : "the strongest observed link";
    parts.push(`TruthLens identified ${strength} across the ${a.checks.length} searches in this case: a shared ${a.top.label.toLowerCase()} (${a.top.value}), present in ${a.top.searches.length} of them.`);
  } else {
    parts.push(`Across the ${a.checks.length} searches in this case, no distinctive shared identifier was found linking the assets.`);
  }
  if (a.subjects.length) {
    const scored = a.subjects.filter((s) => s.risk != null);
    if (scored.length) {
      parts.push("For balance: " + scored.map((s) => `${s.domain} scored ${s.risk}/100`).join("; ") + ".");
    }
  }
  parts.push(`The link between the assets remains at the level of ${a.conclusionLevel.toLowerCase()}.` +
    (a.top ? ` ${a.top.alternative}` : " A shared infrastructure footprint can equally result from common providers."));
  return parts.join(" ");
}
