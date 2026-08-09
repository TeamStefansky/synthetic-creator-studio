// Host-conduct layer — turns the "simple research following the connections"
// into something the system does itself: given a host/ASN/operator, surface its
// DOCUMENTED, CITED conduct (court records, watchdog designations, a host's own
// stated policy) at High confidence, plus a SEPARATED severe-context flag for
// extremist domains co-hosted on the same infrastructure.
//
// Frozen-rule framing (this is the whole point):
//   - A finding about the HOST's own conduct is public record → High confidence,
//     named, cited. This is lawful disclosure about an ORGANIZATION, never a person.
//   - Co-hosted extremist domains are a SEVERE CONTEXT FLAG about the shared
//     infrastructure — rendered SEPARATELY, never merged into a claim that a
//     specific client authored that content (sharing a host ≠ shared operation).
//   - An empty reference / no match → "cannot assess" (Unknown), never "clean"
//     (rule 4/7). A domain name is an indicator, not proof of content.

import hostsData from "@/data/host-conduct/documented-hosts.json";
import { groupByCharacter } from "./classify";

export const HOST_CONDUCT_VERSION = "host-conduct-v1";

export type Severity = "high" | "medium" | "context";

export interface ConductFinding {
  label: string;
  detail: string;
  severity: Severity;
  sources: string[];
}

export interface DocumentedHost {
  org: string;
  asns: string[];
  aliases: string[];
  country?: string;
  summary: string;
  findings: ConductFinding[];
  flaggedCoHostedDomains?: { domain: string; note: string }[];
}

export interface HostConductProfile {
  /** false = the reference has no documented record for this host (cannot assess). */
  matched: boolean;
  /** true only when the reference file itself is empty (distinguish from "no match"). */
  referenceEmpty: boolean;
  org?: string;
  country?: string;
  summary?: string;
  findings: ConductFinding[];
  /** Highest severity among the documented findings. */
  topSeverity?: Severity;
  /** SEPARATED severe-context flag: extremist-character domains observed on the
   * same infrastructure (from the reference and/or a reverse-DNS sample). */
  coHostedExtremist: { domain: string; note?: string; signal?: string }[];
  /** Character breakdown of a reverse-DNS sample, when one is supplied. */
  sweep?: {
    extremist: { domain: string; signal?: string }[];
    activismCount: number;
    privacyCount: number;
    neutralCount: number;
    total: number;
  };
  /** Confidence in the DOCUMENTED findings (High — they are public record). */
  confidence: "High" | "Unknown";
  /** The mandatory framing that keeps the strong part unassailable. */
  clientCaveat: string;
  note: string;
  version: string;
}

const CLIENT_CAVEAT =
  "This describes the HOST's documented conduct and the character of domains on its shared infrastructure. Sharing a host is a serious context flag, not proof that any particular client authored that content or shares an operator.";

const ENTRIES: DocumentedHost[] = ((hostsData as { entries?: DocumentedHost[] }).entries || []).map((e) => ({
  org: e.org,
  asns: (e.asns || []).map((a) => a.toUpperCase()),
  aliases: (e.aliases || []).map((a) => a.toLowerCase()),
  country: e.country,
  summary: e.summary,
  findings: e.findings || [],
  flaggedCoHostedDomains: e.flaggedCoHostedDomains || [],
}));

function referenceEmpty(): boolean {
  return ENTRIES.length === 0;
}

const SEV_RANK: Record<Severity, number> = { high: 3, medium: 2, context: 1 };

/** Match a documented host by ASN and/or operator/org name (alias-aware). */
export function matchHost(opts: { asn?: string; org?: string; hostName?: string }): DocumentedHost | null {
  const asn = (opts.asn || "").toUpperCase().trim();
  const needles = [opts.org, opts.hostName]
    .map((s) => (s || "").toLowerCase().trim())
    .filter(Boolean);
  for (const e of ENTRIES) {
    if (asn && e.asns.includes(asn)) return e;
    for (const n of needles) {
      if (!n) continue;
      if (e.org.toLowerCase() === n) return e;
      if (e.aliases.some((a) => n === a || n.includes(a) || a.includes(n))) return e;
    }
  }
  return null;
}

/**
 * Build a host-conduct profile. `coHostedSample` is an optional list of domains
 * observed on the host's IP ranges (e.g. from origin-exposure / a reverse-DNS
 * sweep) — it is classified and the extremist-character ones are surfaced as the
 * separated context flag, alongside any documented flagged domains.
 */
export function buildHostConduct(opts: {
  asn?: string;
  org?: string;
  hostName?: string;
  coHostedSample?: string[];
}): HostConductProfile {
  const empty = referenceEmpty();
  const host = matchHost(opts);

  // Classify any supplied reverse-DNS sample regardless of a documented match.
  const grouped = opts.coHostedSample && opts.coHostedSample.length ? groupByCharacter(opts.coHostedSample) : null;

  const coHostedExtremist: { domain: string; note?: string; signal?: string }[] = [];
  const seen = new Set<string>();
  for (const f of host?.flaggedCoHostedDomains || []) {
    const d = f.domain.toLowerCase();
    if (seen.has(d)) continue;
    seen.add(d);
    coHostedExtremist.push({ domain: f.domain, note: f.note });
  }
  for (const f of grouped?.extremist || []) {
    if (seen.has(f.domain)) continue;
    seen.add(f.domain);
    coHostedExtremist.push({ domain: f.domain, signal: f.signal });
  }

  const findings = host?.findings || [];
  const topSeverity = findings.length
    ? findings.reduce<Severity>((acc, f) => (SEV_RANK[f.severity] > SEV_RANK[acc] ? f.severity : acc), "context")
    : undefined;

  const matched = !!host;
  let note: string;
  if (empty) note = "Host-conduct reference is not populated — cannot assess this host's documented conduct (Unknown, not 'clean').";
  else if (matched) note = `Documented public-record conduct on file for ${host!.org}.`;
  else note = "No documented conduct on file for this host — this is 'not assessed', not a clean record.";

  return {
    matched,
    referenceEmpty: empty,
    org: host?.org,
    country: host?.country,
    summary: host?.summary,
    findings,
    topSeverity,
    coHostedExtremist,
    sweep: grouped
      ? {
          extremist: grouped.extremist,
          activismCount: grouped.activism.length,
          privacyCount: grouped.privacy.length,
          neutralCount: grouped.neutralCount,
          total: grouped.total,
        }
      : undefined,
    confidence: matched ? "High" : "Unknown",
    clientCaveat: CLIENT_CAVEAT,
    note,
    version: HOST_CONDUCT_VERSION,
  };
}

/** How many documented hosts are on file (distinguishes "no match" from "empty"). */
export function hostConductCount(): number {
  return ENTRIES.length;
}
