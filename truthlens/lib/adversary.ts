// Operator-configurable adversary-country policy + CDN / datacenter detection.
//
// TruthLens ships NO political judgments: data/adversary-countries.json is an
// empty, operator-editable list. This module also centralizes detection of CDN
// providers (whose edge IPs mask the true origin) and datacenter/hosting ASNs
// (a bot signal in log analysis).

import adversaryData from "../data/adversary-countries.json";

const ADVERSARY_CODES = new Set(
  (adversaryData.codes as string[]).map((c) => c.trim().toUpperCase())
);

export function adversaryConfigured(): boolean {
  return ADVERSARY_CODES.size > 0;
}

export function isAdversaryCountry(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return ADVERSARY_CODES.has(iso.trim().toUpperCase());
}

// ---- CDN detection ---------------------------------------------------------
// Matched against the ASN org string and, optionally, response headers.

interface CdnRule {
  name: string;
  org: RegExp;
}

const CDN_RULES: CdnRule[] = [
  { name: "Cloudflare", org: /cloudflare/i },
  { name: "Akamai", org: /akamai/i },
  { name: "Fastly", org: /fastly/i },
  { name: "Amazon CloudFront", org: /cloudfront|amazon/i },
  { name: "Google Cloud CDN", org: /google/i },
  { name: "Microsoft Azure CDN", org: /microsoft|azure/i },
  { name: "Sucuri", org: /sucuri/i },
  { name: "StackPath", org: /stackpath|highwinds/i },
  { name: "Incapsula / Imperva", org: /incapsula|imperva/i },
  { name: "BunnyCDN", org: /bunny/i },
  { name: "CDN77", org: /cdn77/i },
];

/** Detect a CDN from the ASN org and/or response headers. */
export function detectCdn(
  org: string | null | undefined,
  headers?: Record<string, string>
): { isCdn: boolean; provider: string | null } {
  const o = org ?? "";
  for (const rule of CDN_RULES) {
    if (rule.org.test(o)) return { isCdn: true, provider: rule.name };
  }
  // Header fingerprints (used by the site report where headers are available).
  if (headers) {
    if (headers["cf-ray"] || /cloudflare/i.test(headers["server"] ?? ""))
      return { isCdn: true, provider: "Cloudflare" };
    if (headers["x-akamai-transformed"] || /akamai/i.test(headers["server"] ?? ""))
      return { isCdn: true, provider: "Akamai" };
    if (/fastly/i.test(headers["x-served-by"] ?? headers["via"] ?? ""))
      return { isCdn: true, provider: "Fastly" };
    if (/cloudfront/i.test(headers["via"] ?? headers["x-amz-cf-id"] ?? ""))
      return { isCdn: true, provider: "Amazon CloudFront" };
  }
  return { isCdn: false, provider: null };
}

// ---- Datacenter / hosting ASN heuristic ------------------------------------
// Real human readers come from residential/mobile ISPs. Requests from hosting
// / cloud ASNs are a strong automation (bot) signal.

const DATACENTER_ORG =
  /amazon|aws|google|microsoft|azure|digitalocean|linode|akamai|cloudflare|fastly|ovh|hetzner|vultr|leaseweb|choopa|contabo|scaleway|oracle|alibaba|tencent|hosting|datacenter|data center|server|colo|vps|dedicated|m247|host|gcore|cdn|quadranet|psychz|hostwinds| colocrossing/i;

const RESIDENTIAL_HINT =
  /comcast|verizon|at&t|at t|spectrum|charter|cox|telecom|broadband|cable|dsl|fiber|mobile|cellular|wireless|orange|vodafone|deutsche telekom|bezeq|hot |partner|cellcom|bt group|sky |virgin media/i;

/** Best-effort classification of an ASN org as datacenter/hosting. */
export function isDatacenterOrg(org: string | null | undefined): boolean {
  const o = org ?? "";
  if (!o) return false;
  if (RESIDENTIAL_HINT.test(o)) return false;
  return DATACENTER_ORG.test(o);
}
