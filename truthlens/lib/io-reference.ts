// IO reference data — publicly-documented, ORGANIZATION-ONLY reference sets used
// to surface CORROBORATION leads, never verdicts:
//   • state-affiliated media domains (publicly documented)
//   • domains named in published influence-op takedown reports
//   • orgs with a lawful foreign-agent public disclosure (e.g. FARA)
//
// HARD RULES (CLAUDE.md): these lists ship EMPTY and neutral — TruthLens bakes in
// no political judgments; an operator/curator populates them from auditable public
// sources. A match is a LEAD for a human analyst, never proof that a specific post
// is state-directed or part of a campaign. No persons — organizations only.
// An EMPTY reference means "cannot assess" → Unknown, NEVER "clean".

import stateMediaData from "@/data/io-reference/state-media-domains.json";
import documentedCampaignData from "@/data/io-reference/documented-campaign-domains.json";
import foreignAgentData from "@/data/io-reference/foreign-agent-registries.json";

export const IO_REFERENCE_VERSION = "io-ref-v1";

export interface StateMediaEntry { domain: string; label?: string; source?: string }
export interface CampaignEntry { domain: string; campaign?: string; disclosedBy?: string; report?: string; date?: string }
export interface ForeignAgentEntry { org: string; domains?: string[]; registry?: string; registrationNo?: string; filingUrl?: string; date?: string }

/** Lowercase, strip scheme/path/port and a leading www. Returns "" when not a host. */
export function normalizeDomain(input?: string): string {
  if (!input) return "";
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  s = s.split("/")[0].split("?")[0].split("#")[0]; // path/query/fragment
  s = s.split("@").pop() || s; // userinfo
  s = s.split(":")[0]; // port
  s = s.replace(/^www\./, "");
  // must look like a domain (has a dot, valid chars) — otherwise not a host
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : "";
}

/** True when `host` equals `ref` or is a subdomain of it. */
function domainMatches(host: string, ref: string): boolean {
  return host === ref || host.endsWith(`.${ref}`);
}

function buildMap<T extends { domain: string }>(entries: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const e of entries) {
    const d = normalizeDomain(e.domain);
    if (d) m.set(d, e);
  }
  return m;
}

const stateMedia = buildMap((stateMediaData as { entries?: StateMediaEntry[] }).entries || []);
const campaigns = buildMap((documentedCampaignData as { entries?: CampaignEntry[] }).entries || []);

// foreign-agent entries key on their (possibly multiple) domains
const foreignAgents = new Map<string, ForeignAgentEntry>();
for (const e of ((foreignAgentData as { entries?: ForeignAgentEntry[] }).entries || [])) {
  for (const d of e.domains || []) {
    const nd = normalizeDomain(d);
    if (nd) foreignAgents.set(nd, e);
  }
}

/** Sizes let callers distinguish "no match" from "reference not populated". */
export function ioReferenceCounts(): { stateMedia: number; campaigns: number; foreignAgents: number } {
  return { stateMedia: stateMedia.size, campaigns: campaigns.size, foreignAgents: foreignAgents.size };
}

function lookup<T>(map: Map<string, T>, host: string): T | null {
  if (!host) return null;
  const hit = map.get(host);
  if (hit) return hit;
  for (const [ref, entry] of map) if (domainMatches(host, ref)) return entry;
  return null;
}

export function stateMediaMatch(domain?: string): StateMediaEntry | null {
  return lookup(stateMedia, normalizeDomain(domain));
}
export function campaignMatch(domain?: string): CampaignEntry | null {
  return lookup(campaigns, normalizeDomain(domain));
}
export function foreignAgentMatch(domain?: string): ForeignAgentEntry | null {
  return lookup(foreignAgents, normalizeDomain(domain));
}

/** Candidate registrable domains observed for a mention: from its URL host and,
 * for news adapters, from an account/accountId that is itself a domain. */
export function mentionDomains(m: { url?: string; account?: string; accountId?: string }): string[] {
  const out = new Set<string>();
  for (const cand of [m.url, m.account, m.accountId]) {
    const d = normalizeDomain(cand);
    if (d) out.add(d);
  }
  return [...out];
}
