// Reverse-lookup PREVALENCE for an individual-characteristic artifact (a tracker
// id, a verification token). This is the single most important calibrator for a
// shared-artifact "link" claim, and the one the base rubric can only *reason*
// about, not *measure*: how many sites in the WORLD carry this exact id?
//
//   - only the compared pair   -> strong corroboration
//   - a handful                -> corroborated
//   - dozens                   -> weak (likely an agency/template deployment)
//   - hundreds+                -> near-meaningless; the "link" collapses
//
// Data comes ONLY from official provider APIs (BuiltWith / DNSlytics / PublicWWW /
// SpyOnWeb), each gated by its own key. With no provider connected the count is
// UNKNOWN and rendered as "not connected" - never assumed rare (frozen rule 7:
// never fake capability; an unmeasured population is Unknown, not "unique").

import { getJson, getText } from "@/lib/http";

export type PrevalenceBand = "unique-pair" | "few" | "many" | "ubiquitous" | "unknown";

export interface PrevalenceResult {
  connected: boolean; // was a provider actually queried and did it answer?
  count: number | null; // sites worldwide carrying this exact id (null = unmeasured)
  band: PrevalenceBand;
  provider?: string; // which provider answered
  url?: string; // citation to the public reverse-lookup
  note: string;
}

// How many *total* sites carrying an id collapse the claim. A shared id found on
// only the two compared sites is the strongest possible corroboration; found on
// dozens it is an agency/template deployment and worthless as a link.
export const PREVALENCE_FEW_MAX = 8;
export const PREVALENCE_MANY_MAX = 50;

export function prevalenceBand(count: number | null): PrevalenceBand {
  if (count == null) return "unknown";
  if (count <= 2) return "unique-pair";
  if (count <= PREVALENCE_FEW_MAX) return "few";
  if (count <= PREVALENCE_MANY_MAX) return "many";
  return "ubiquitous";
}

/** Which reverse-lookup providers have a key configured (else "not connected").
 * Lists ONLY providers that measurePrevalence() actually queries, so a configured
 * key always means a real query — never a "connected" label with no fetch behind it. */
export function prevalenceProvidersConnected(): string[] {
  const out: string[] = [];
  if (process.env.SPYONWEB_API_KEY) out.push("SpyOnWeb");
  if (process.env.PUBLICWWW_API_KEY) out.push("PublicWWW");
  if (process.env.DNSLYTICS_API_KEY) out.push("DNSlytics");
  return out;
}

// Only account-scoped tracker-style ids have a meaningful worldwide reverse
// lookup. Infrastructure (IP/ASN/registrar) is a class characteristic; its
// prevalence is captured by the base rubric's reverse-IP neighbour count instead.
const REVERSE_LOOKUPABLE = new Set<string>([
  "ga_id",
  "adsense_id",
  "gtm_id",
  "fb_pixel_id",
  "yandex_id",
  "hotjar_id",
  "clarity_id",
  "verification_token",
]);

export function isReverseLookupable(kind: string): boolean {
  return REVERSE_LOOKUPABLE.has(kind);
}

function notConnected(): PrevalenceResult {
  return {
    connected: false,
    count: null,
    band: "unknown",
    note:
      "Reverse-lookup not connected - the worldwide prevalence of this id is unmeasured. " +
      "Connect BuiltWith / DNSlytics / PublicWWW / SpyOnWeb to corroborate; until then a " +
      "shared id is treated as uncorroborated, not as unique.",
  };
}

async function fromSpyOnWeb(id: string): Promise<PrevalenceResult | null> {
  const key = process.env.SPYONWEB_API_KEY;
  if (!key) return null;
  const url = `https://api.spyonweb.com/v1/analytics/${encodeURIComponent(id)}?access_token=${key}`;
  const j = await getJson<any>(url, { timeoutMs: 8000 });
  if (!j || j.status !== "found") return null;
  const items = j?.result?.analytics?.[id]?.items || {};
  const count = Object.keys(items).length;
  return {
    connected: true,
    count,
    band: prevalenceBand(count),
    provider: "SpyOnWeb",
    url: `https://spyonweb.com/${encodeURIComponent(id)}`,
    note: `SpyOnWeb reports ${count} site(s) carrying this id.`,
  };
}

async function fromPublicWWW(value: string): Promise<PrevalenceResult | null> {
  const key = process.env.PUBLICWWW_API_KEY;
  if (!key) return null;
  // PublicWWW source-code search; export=csv returns matching hosts, one per line.
  const url = `https://publicwww.com/websites/%22${encodeURIComponent(value)}%22/?export=csv&key=${key}`;
  const csv = await getText(url, { timeoutMs: 9000 });
  if (csv == null) return null;
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() && !/^"?total/i.test(l));
  const count = lines.length;
  return {
    connected: true,
    count,
    band: prevalenceBand(count),
    provider: "PublicWWW",
    url: `https://publicwww.com/websites/%22${encodeURIComponent(value)}%22/`,
    note: `PublicWWW source-code search matched ${count} site(s).`,
  };
}

async function fromDnslytics(id: string): Promise<PrevalenceResult | null> {
  const key = process.env.DNSLYTICS_API_KEY;
  if (!key) return null;
  // Reverse Analytics/AdSense: domains sharing a Google id. Response shapes vary by
  // plan; read the common ones defensively and fall back to null on anything else.
  const url = `https://api.dnslytics.net/v1/reverseanalytics/${encodeURIComponent(id)}?apikey=${key}`;
  const j = await getJson<any>(url, { timeoutMs: 9000 });
  const count: number | null =
    typeof j?.total === "number" ? j.total
    : Array.isArray(j?.data) ? j.data.length
    : Array.isArray(j?.domains) ? j.domains.length
    : null;
  if (count == null) return null;
  return {
    connected: true,
    count,
    band: prevalenceBand(count),
    provider: "DNSlytics",
    url: `https://dnslytics.com/reverse-analytics/${encodeURIComponent(id)}`,
    note: `DNSlytics reverse-analytics matched ${count} domain(s).`,
  };
}

/**
 * Measure worldwide prevalence for one artifact. Tries each connected provider in
 * turn; returns the first real answer, else an honest "not connected" result.
 * Never throws — callers degrade gracefully.
 */
export async function measurePrevalence(kind: string, value: string): Promise<PrevalenceResult> {
  if (!isReverseLookupable(kind)) return notConnected();
  if (prevalenceProvidersConnected().length === 0) return notConnected();
  try {
    const r = (await fromSpyOnWeb(value)) || (await fromPublicWWW(value)) || (await fromDnslytics(value));
    return r || notConnected();
  } catch {
    return notConnected();
  }
}
