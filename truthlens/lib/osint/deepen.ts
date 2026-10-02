// Deep research layer for the OSINT orchestrator (osint-research-v2).
//
// v1 stopped at the seed: its own infra, CT logs, trackers and one reverse-lookup
// hop. v2 follows the evidence one step further, using modules that already exist
// elsewhere in TruthLens (one source of truth - nothing is reimplemented here):
//
//   1. Documented-reference match  (lib/io-reference)  - the seed AND every
//      discovered domain against cited state-media / documented-campaign /
//      foreign-agent-registry datasets. A hit is lawful, cited disclosure.
//   2. Second-hop infrastructure   (lib/osint/collect) - resolve the discovered
//      member domains and test whether they sit on the SEED's own IP/network.
//      CDN / mega-cloud space is excluded (lib/ip detectCdn): a shared Cloudflare
//      edge is a class characteristic and never individualizes.
//   3. Co-hosting                  (lib/reverseip)     - neighbours on the seed's
//      IP, only when that IP is not CDN space, then matched against (1).
//   4. Site age                    (lib/archive)       - Wayback first-seen + RDAP
//      registration → "recently stood up" is a lead, never a verdict.
//   5. Narrative coordination      (lib/cib/analyze)   - public mentions of a
//      free-text narrative across every connected source, graded by the SAME
//      CIB analyzer the rest of the app uses (near-duplicate clusters, Poisson-
//      tested bursts, posting-hour bands, account-creation clustering). Ceiling:
//      "Strong - actor UNDETERMINED".
//
// Frozen rules: organizations/domains/infra only (rule 1); an unavailable
// source is "not collected", never inferred around (rules 4, 7); every threshold
// is a named export; pure functions are deterministic and tested.

import { stateMediaMatch, campaignMatch, foreignAgentMatch, ioReferenceCounts, normalizeDomain } from "@/lib/io-reference";
import { detectCdn } from "@/lib/ip";
import { reverseIp } from "@/lib/reverseip";
import { lookupArchive } from "@/lib/archive";
import { collectMentions, enrichCreationDates } from "@/lib/narrative/sources";
import { analyzeCib, type CibReport } from "@/lib/cib/analyze";
import { resolveDomainInfra, type DomainInfra, type DomainRdap } from "./collect";

export const DEEP_RESEARCH_VERSION = "osint-deep-v1";

/** Max discovered domains resolved in the second hop (bounds wall-clock + load). */
export const SECOND_HOP_CAP = 8;
/** Non-CDN same-IP members needed before shared hosting counts as corroboration. */
export const SHARED_IP_MIN = 2;
/** A domain first archived / registered within this many days is "recently stood up". */
export const RECENT_SITE_DAYS = 120;
/** Hard ceiling for the narrative-coordination collection (all sources in parallel). */
export const COORDINATION_TIMEOUT_MS = 45_000;

// ---- 1. documented-reference match (pure) ------------------------------------

export interface DocumentedHit {
  domain: string;
  kind: "state-media" | "documented-campaign" | "foreign-agent-registry" | "curated-watchlist";
  label: string;
  citation?: string;
}

export interface DocumentedMatches {
  /** false → the reference datasets are empty on this deployment ("not populated"), not "no match". */
  referencePopulated: boolean;
  seed: DocumentedHit[];
  related: DocumentedHit[];
}

function hitsFor(domain: string): DocumentedHit[] {
  const out: DocumentedHit[] = [];
  const c = campaignMatch(domain);
  if (c) out.push({ domain, kind: "documented-campaign", label: c.campaign || "documented campaign", citation: [c.disclosedBy, c.report].filter(Boolean).join(" - ") || undefined });
  const s = stateMediaMatch(domain);
  if (s) out.push({ domain, kind: "state-media", label: s.label || "state-affiliated media", citation: s.source });
  const fa = foreignAgentMatch(domain);
  if (fa) out.push({ domain, kind: "foreign-agent-registry", label: `${fa.org} (${fa.registry || "registry"}${fa.registrationNo ? ` #${fa.registrationNo}` : ""})`, citation: fa.filingUrl });
  return out;
}

/** Match the seed and every discovered domain against the cited reference sets. */
export function documentedMatches(seed: string | undefined, related: string[]): DocumentedMatches {
  const counts = ioReferenceCounts();
  const referencePopulated = counts.stateMedia + counts.campaigns + counts.foreignAgents > 0;
  const seedNorm = normalizeDomain(seed);
  const seen = new Set<string>(seedNorm ? [seedNorm] : []);
  const relatedHits: DocumentedHit[] = [];
  for (const d of related) {
    const n = normalizeDomain(d);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    relatedHits.push(...hitsFor(n));
  }
  return { referencePopulated, seed: seedNorm ? hitsFor(seedNorm) : [], related: relatedHits };
}

// ---- 2. second-hop infrastructure (pure scoring + bounded async collect) -----

export interface HopRow { domain: string; ip?: string; asn?: string; org?: string; cdn?: string }

export interface SharedInfra {
  collected: boolean;
  /** Seed sits on CDN / mega-cloud space → shared IP/ASN is not evidence of a common operator. */
  seedOnCdn?: string;
  resolved: HopRow[];
  sameIp: string[];
  sameAsn: string[];
  /** true only when ≥ SHARED_IP_MIN members share the seed's own non-CDN IP. */
  corroborates: boolean;
}

/** Pure: which discovered domains share the seed's non-CDN IP / network. */
export function scoreSharedInfra(seed: DomainInfra | undefined, rows: HopRow[]): SharedInfra {
  const seedOnCdn = detectCdn(seed?.org || "") || undefined;
  const resolved = rows.filter((r) => r.ip);
  if (!seed?.ip || seedOnCdn) {
    return { collected: resolved.length > 0, seedOnCdn, resolved, sameIp: [], sameAsn: [], corroborates: false };
  }
  const sameIp = resolved.filter((r) => r.ip === seed.ip && !r.cdn).map((r) => r.domain);
  const sameAsn = resolved.filter((r) => r.asn && r.asn === seed.asn && r.ip !== seed.ip && !r.cdn).map((r) => r.domain);
  return { collected: resolved.length > 0, resolved, sameIp, sameAsn, corroborates: sameIp.length >= SHARED_IP_MIN };
}

async function resolveHop(domains: string[]): Promise<HopRow[]> {
  const uniq = [...new Set(domains.map((d) => normalizeDomain(d)).filter(Boolean))].slice(0, SECOND_HOP_CAP);
  return Promise.all(uniq.map(async (domain): Promise<HopRow> => {
    try {
      const i = await resolveDomainInfra(domain);
      return { domain, ip: i.ip, asn: i.asn, org: i.org, cdn: detectCdn(i.org || "") || undefined };
    } catch { return { domain }; }
  }));
}

// ---- 4. site age (pure) -------------------------------------------------------

export interface SiteAge {
  firstSeen?: string;     // Wayback first capture (YYYY-MM-DD)
  snapshots: number;
  registered?: string;    // RDAP registration (YYYY-MM-DD)
  /** age in days of the EARLIEST observable signal; undefined → not collected */
  ageDays?: number;
  recent: boolean;
}

/** Pure: earliest observable footprint of a site. Earliest observed ≠ creation. */
export function siteAge(firstSeen: string | undefined, snapshots: number, rdap: DomainRdap | undefined, nowMs: number): SiteAge {
  const fs = firstSeen ? firstSeen.slice(0, 10) : undefined;
  const reg = rdap?.registrationDate ? rdap.registrationDate.slice(0, 10) : undefined;
  const stamps = [fs, reg].map((d) => (d ? Date.parse(d) : NaN)).filter(Number.isFinite);
  if (!stamps.length) return { firstSeen: fs, snapshots, registered: reg, recent: false };
  const ageDays = Math.floor((nowMs - Math.min(...stamps)) / 86_400_000);
  return { firstSeen: fs, snapshots, registered: reg, ageDays, recent: ageDays >= 0 && ageDays <= RECENT_SITE_DAYS };
}

function waybackDate(ts?: string): string | undefined {
  // CDX timestamps are YYYYMMDDhhmmss; ArchiveInfo may already hold ISO.
  if (!ts) return undefined;
  if (/^\d{8}/.test(ts)) return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
  return ts.slice(0, 10);
}

// ---- 5. narrative coordination (bounded async → shared CIB analyzer) ---------

export interface NarrativeCoordination {
  collected: boolean;
  mentions: number;
  sourcesLive: string[];
  sourcesOff: string[];
  sourcesFailed: string[];
  cib?: CibReport;
  note?: string;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

export async function collectNarrativeCoordination(query: string): Promise<NarrativeCoordination> {
  const results = await withTimeout(collectMentions(query), COORDINATION_TIMEOUT_MS);
  if (!results) return { collected: false, mentions: 0, sourcesLive: [], sourcesOff: [], sourcesFailed: [], note: "mention collection timed out" };
  const mentions = results.flatMap((r) => r.mentions);
  const sourcesLive = results.filter((r) => r.status.connected && !r.status.error).map((r) => `${r.status.source} (${r.status.count})`);
  const sourcesOff = results.filter((r) => !r.status.connected).map((r) => r.status.source);
  const sourcesFailed = results.filter((r) => r.status.connected && r.status.error).map((r) => r.status.source);
  if (!mentions.length) return { collected: false, mentions: 0, sourcesLive, sourcesOff, sourcesFailed, note: "no public mentions collected" };
  await withTimeout(enrichCreationDates(mentions), 8_000);
  return { collected: true, mentions: mentions.length, sourcesLive, sourcesOff, sourcesFailed, cib: analyzeCib(query, mentions) };
}

// ---- domain deep pass (async orchestration) -----------------------------------

export interface DomainDeep {
  documented: DocumentedMatches;
  sharedInfra: SharedInfra;
  coHosted: { collected: boolean; skippedReason?: string; domains: string[] };
  age: SiteAge;
}

/** Follow a domain seed one hop further. Every branch is failure-isolated. */
export async function deepenDomain(
  seed: string, infra: DomainInfra | undefined, rdap: DomainRdap | undefined, discovered: string[], log: string[],
): Promise<DomainDeep> {
  const seedCdn = detectCdn(infra?.org || "") || undefined;
  const [hop, coHostRaw, archive] = await Promise.all([
    resolveHop(discovered.filter((d) => normalizeDomain(d) !== normalizeDomain(seed))).catch(() => [] as HopRow[]),
    infra?.ip && !seedCdn ? reverseIp(infra.ip).catch(() => [] as string[]) : Promise.resolve(null),
    lookupArchive(seed).catch(() => ({ snapshotCount: 0 } as { firstSeen?: string; snapshotCount: number })),
  ]);

  const sharedInfra = scoreSharedInfra(infra, hop);
  const coHosted = coHostRaw === null
    ? { collected: false, skippedReason: seedCdn ? `seed is on ${seedCdn} - shared edge IPs say nothing about the operator` : "seed IP not resolved", domains: [] }
    : { collected: coHostRaw.length > 0, skippedReason: coHostRaw.length ? undefined : "reverse-IP returned nothing (free tier is rate-limited)", domains: coHostRaw.filter((d) => normalizeDomain(d) !== normalizeDomain(seed)).slice(0, 40) };
  const documented = documentedMatches(seed, [...discovered, ...coHosted.domains]);
  const age = siteAge(waybackDate(archive.firstSeen), archive.snapshotCount || 0, rdap, Date.now());

  if (sharedInfra.seedOnCdn) log.push(`second hop: seed on ${sharedInfra.seedOnCdn} - shared-IP test not meaningful.`);
  else if (sharedInfra.collected) log.push(`second hop: ${sharedInfra.resolved.length} member(s) resolved · ${sharedInfra.sameIp.length} on the seed's IP · ${sharedInfra.sameAsn.length} on its network.`);
  else log.push("second hop: no discovered domains to resolve.");
  log.push(coHosted.collected ? `co-hosting: ${coHosted.domains.length} neighbour domain(s) on the seed IP.` : `co-hosting: not collected (${coHosted.skippedReason}).`);
  log.push(age.ageDays !== undefined ? `site age: earliest observed ${age.ageDays}d ago${age.recent ? " (recently stood up)" : ""}.` : "site age: not collected.");
  if (!documented.referencePopulated) log.push("documented reference: datasets not populated on this deployment.");
  else log.push(`documented reference: ${documented.seed.length} seed hit(s), ${documented.related.length} related hit(s).`);

  return { documented, sharedInfra, coHosted, age };
}
