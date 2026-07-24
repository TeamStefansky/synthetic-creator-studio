// Link Board calibration - THE single source of truth for how strongly each
// overlapping artifact discriminates. No strength value or alternative string
// lives anywhere else. The governing principle: breadth without calibration is a
// conspiracy wall. Adding more comparable artifacts multiplies MEANINGLESS
// overlaps (every site uses nginx / WordPress / Cloudflare / text-html) as fast
// as meaningful ones, so no artifact contributes to an edge without its
// discriminating power defined here, up front.
//
// Rules enforced:
//  - Only a Strong-tier artifact can yield a Strong (High) edge.
//  - Common-by-default facts never contribute to the aggregate (countsToward=false).
//  - Independent distinctive-but-weak overlaps raise confidence by AT MOST one band.
//  - Unknown commonness => Weak + "commonness not measured", never assumed rare.

import type { ConfidenceLevel } from "@/components/ConfidenceBadge";
import { detectCdn } from "@/lib/ip";
import type { BoardArtifactKind, Tier, OverlapItem, PairEdge } from "./types";

// Bump on any change to tiers / calibration / combination so historical results
// stay interpretable (CLAUDE.md: scoring rubrics are versioned).
export const BOARD_RUBRIC_VERSION = "board-overlap-v1";

// Reverse-IP neighbour count above which a shared IP is treated as a busy /
// multi-tenant host (mirrors lib/network.ts SHARED_IP_THRESHOLD).
export const SHARED_IP_THRESHOLD = 12;

// Whole-board saturation: a calibrated (non-strong) fact shared by ~all entities
// in a board of this size is common WITHIN the set and stops contributing.
const SATURATION_RATIO = 0.8;
const SATURATION_MIN_ENTITIES = 4;

export interface CalEntry {
  tier: Tier;
  label: string;
  /** How this artifact's commonness is measured (or that it isn't). */
  calibration: string;
  /** Type-specific "could also be explained by..." shown on every overlap. */
  alternative: string;
}

// EVERY BoardArtifactKind MUST appear here (rubric-completeness test).
export const CALIBRATION: Record<BoardArtifactKind, CalEntry> = {
  // --- Strong-by-default -----------------------------------------------------
  ssl_san: {
    tier: "strong",
    label: "TLS certificate SAN",
    calibration: "Down-tiered to Weak when the certificate is a wildcard or issued by a shared-CDN CA (those place unrelated hosts on one cert).",
    alternative: "A shared non-wildcard SAN usually means one operator provisioned both hosts on one certificate; but shared hosting panels and CDN certificates can also group unrelated hosts.",
  },
  ga_id: {
    tier: "strong", label: "Google Analytics ID",
    calibration: "Account-specific property id; commonness not population-measured but reuse across unrelated sites is rare.",
    alternative: "A shared analytics ID normally means one operator's account, but agencies and tag templates occasionally reuse an ID across unrelated clients.",
  },
  adsense_id: {
    tier: "strong", label: "AdSense publisher ID",
    calibration: "Account-specific ca-pub- id.",
    alternative: "A shared AdSense publisher ID usually means shared monetization ownership, but a network/agency can place one publisher ID on many sites.",
  },
  gtm_id: {
    tier: "strong", label: "Tag Manager container",
    calibration: "Account-specific GTM container id.",
    alternative: "A shared GTM container usually means one operator's tag setup; agencies can reuse a container across clients.",
  },
  fb_pixel_id: {
    tier: "strong", label: "Facebook Pixel ID",
    calibration: "Ad-account-specific pixel id.",
    alternative: "A shared Pixel ID usually means shared ad-account ownership; a marketing partner can also place it on multiple sites.",
  },
  matomo_id: {
    tier: "strong", label: "Matomo site ID",
    calibration: "Self-hosted analytics instance + site id; distinctive.",
    alternative: "A shared Matomo host+site-id strongly suggests one analytics instance; a shared hosting provider offering Matomo could coincide.",
  },
  yandex_id: {
    tier: "strong", label: "Yandex Metrica ID",
    calibration: "Account-specific metrica id.",
    alternative: "A shared Metrica ID usually means one operator's account.",
  },
  hotjar_id: {
    tier: "strong", label: "Hotjar site ID",
    calibration: "Account-specific site id.",
    alternative: "A shared Hotjar ID usually means one operator's account.",
  },
  clarity_id: {
    tier: "strong", label: "Microsoft Clarity ID",
    calibration: "Account-specific project id.",
    alternative: "A shared Clarity project ID usually means one operator's account.",
  },
  verification_token: {
    tier: "strong", label: "Site-verification token",
    calibration: "Account-specific verification token (e.g. google-site-verification).",
    alternative: "A shared verification token ties both sites to one search/console account; leftover copied templates are a rare alternative.",
  },
  csp_report_uri: {
    tier: "strong", label: "CSP report endpoint",
    calibration: "Distinctive reporting endpoint host.",
    alternative: "A shared CSP report endpoint usually means shared security tooling/ownership; a common SaaS reporting host would be less distinctive.",
  },
  // --- Calibrated-by-commonness ---------------------------------------------
  ip: {
    tier: "calibrated", label: "Shared IP address",
    calibration: "Neighbour count via reverse-IP + CDN/mass-host detection: a busy or CDN IP is informational only; a dedicated shared IP is Moderate.",
    alternative: "A shared IP can mean common hosting/control, but shared, CDN and reseller hosting put unrelated sites on one address.",
  },
  ip_24: {
    tier: "calibrated", label: "Same /24 subnet",
    calibration: "Weak proximity; informational on CDN/mass-host ranges.",
    alternative: "Sites in one /24 often just share a hosting provider's block; proximity implies little on its own.",
  },
  ip_16: {
    tier: "calibrated", label: "Same /16 range",
    calibration: "Very broad; informational only.",
    alternative: "A /16 spans thousands of unrelated customers of one host - essentially no signal alone.",
  },
  asn: {
    tier: "calibrated", label: "Shared ASN",
    calibration: "Informational when the ASN is a CDN/mass-host; otherwise weak.",
    alternative: "Most sites sit on a handful of large hosting ASNs; a shared ASN is expected, not distinctive.",
  },
  as_org: {
    tier: "calibrated", label: "Shared hosting org",
    calibration: "Informational when the org is a known CDN/mass-host.",
    alternative: "A shared hosting organization is extremely common and implies nothing on its own.",
  },
  ptr_pattern: {
    tier: "calibrated", label: "Shared reverse-DNS pattern",
    calibration: "Weak; informational on mass-host PTR templates.",
    alternative: "Reverse-DNS naming often reflects the host, not the site owner.",
  },
  ns_set: {
    tier: "calibrated", label: "Shared nameserver",
    calibration: "Informational on huge managed-DNS providers (Cloudflare, AWS, GoDaddy); otherwise weak.",
    alternative: "Popular managed DNS is shared by millions of unrelated domains; a boutique nameserver is slightly more telling.",
  },
  mx_host: {
    tier: "calibrated", label: "Shared mail host",
    calibration: "Informational on big mail providers (Google, Microsoft, Zoho); otherwise weak.",
    alternative: "Most organizations use a handful of mail providers; a shared MX rarely indicates common control.",
  },
  registrar: {
    tier: "calibrated", label: "Shared registrar",
    calibration: "Commonness not population-measured => treated as common (Weak).",
    alternative: "Registrars serve millions of unrelated domains; a shared registrar is not a link.",
  },
  social_handle: {
    tier: "calibrated", label: "Shared social handle",
    calibration: "An exact shared handle (not a bare platform link) is distinctive => Moderate.",
    alternative: "A shared social handle usually means one operator's account; cross-posting or a shared campaign account is possible.",
  },
  org_email: {
    tier: "calibrated", label: "Shared org contact email",
    calibration: "Org-PUBLISHED contact only (never personal); an exact shared address is distinctive => Moderate.",
    alternative: "A shared published contact email suggests shared administration; an outsourced support address could be reused.",
  },
  org_phone: {
    tier: "calibrated", label: "Shared org contact phone",
    calibration: "Org-PUBLISHED contact only (never personal); an exact shared number is distinctive => Moderate.",
    alternative: "A shared published phone suggests shared administration; a shared call-centre or agency could reuse a number.",
  },
  outbound_domain: {
    tier: "calibrated", label: "Shared outbound link",
    calibration: "Informational on ubiquitous destinations (major social/platforms); otherwise weak.",
    alternative: "Linking to the same popular site is expected; a shared link to an obscure domain is slightly more telling.",
  },
  third_party_origin: {
    tier: "calibrated", label: "Shared embedded origin",
    calibration: "Informational on ubiquitous CDNs/tag hosts; otherwise weak.",
    alternative: "Nearly every site embeds the same major CDNs and tag hosts; a shared obscure origin is slightly more telling.",
  },
  boilerplate: {
    tier: "calibrated", label: "Shared boilerplate text",
    calibration: "Near-duplicate copyright/tagline/boilerplate via similarity => distinctive Moderate.",
    alternative: "Shared boilerplate can mean one author; it can also be a copied theme/template used by many.",
  },
  // --- Weak / contextual (only in combination, never Moderate alone) --------
  server_header: {
    tier: "weak", label: "Server software",
    calibration: "Common-by-default; never contributes to the aggregate.",
    alternative: "nginx/Apache run a huge share of the web; a shared server header means nothing on its own.",
  },
  cms: {
    tier: "weak", label: "Same CMS",
    calibration: "Common-by-default; never contributes.",
    alternative: "WordPress alone powers a large share of the web; a shared CMS implies nothing on its own.",
  },
  framework: {
    tier: "weak", label: "Same framework",
    calibration: "Common-by-default; never contributes.",
    alternative: "Popular frameworks are used by millions of unrelated sites.",
  },
  hosting_country: {
    tier: "weak", label: "Same hosting country",
    calibration: "Common-by-default; never contributes.",
    alternative: "A shared hosting country covers a huge population of unrelated sites.",
  },
  reg_date_proximity: {
    tier: "weak", label: "Close registration dates",
    calibration: "Common-by-default; never contributes alone.",
    alternative: "Many unrelated domains are registered around the same time; proximity is coincidental unless paired with a strong signal.",
  },
};

// ---- known common-by-default value lists (make the calibration measurable) ---
const COMMON_NS = /(cloudflare|awsdns|azure-dns|googledomains|google\.com|domaincontrol|registrar-servers|dnsmadeeasy|nsone|ns\.godaddy|wixdns|squarespacedns|namecheap)/i;
const COMMON_MAIL = /(google\.com|googlemail|aspmx|outlook\.com|protection\.outlook|microsoft|zoho|mimecast|proofpoint|secureserver|pphosted|messagelabs)/i;
const COMMON_THIRD_PARTY = /(googletagmanager|google-analytics|gstatic|googleapis|doubleclick|facebook\.net|fbcdn|connect\.facebook|cloudflare|jsdelivr|unpkg|cdnjs|bootstrapcdn|jquery|youtube|ytimg|gravatar|fontawesome|hotjar|clarity\.ms|cookiebot|onetrust)/i;
const COMMON_OUTBOUND = /^(facebook|twitter|x|instagram|linkedin|youtube|tiktok|pinterest|wa\.me|t\.me|whatsapp|telegram|google|apple|microsoft|amazon|wikipedia)\.[a-z.]+$/i;

function isMassHostOrg(org: string): boolean {
  if (detectCdn(org)) return true;
  return /(amazon|aws|google|azure|microsoft|digitalocean|linode|akamai|fastly|ovh|hetzner|vultr|leaseweb|contabo|godaddy|namecheap|cloudflare|oracle|alibaba|tencent|scaleway|m247|hostinger|bluehost|hostgator|siteground|wix|squarespace|shopify|automattic|wpengine)/i.test(org);
}

// The outcome an artifact reaches when it is NOT down-weighted as common:
//  High = Strong edge alone; Medium = Moderate (counts); Low = weak-but-counts;
//  info = informational only (shown, never contributes).
type Outcome = "High" | "Medium" | "Low" | "info";
const DISTINCTIVE: Record<BoardArtifactKind, Outcome> = {
  ssl_san: "High", ga_id: "High", adsense_id: "High", gtm_id: "High", fb_pixel_id: "High",
  matomo_id: "High", yandex_id: "High", hotjar_id: "High", clarity_id: "High",
  verification_token: "High", csp_report_uri: "High",
  ip: "Medium", social_handle: "Medium", org_email: "Medium", org_phone: "Medium", boilerplate: "Medium",
  ip_24: "Low", asn: "Low", as_org: "Low", ptr_pattern: "Low", ns_set: "Low", mx_host: "Low",
  outbound_domain: "Low", third_party_origin: "Low",
  ip_16: "info", registrar: "info",
  server_header: "info", cms: "info", framework: "info", hosting_country: "info", reg_date_proximity: "info",
};

export interface CalibrationCtx {
  /** how many board entities share this exact value */
  shareCount: number;
  /** total entities on the board */
  totalEntities: number;
  /** reverse-IP neighbour count for ip overlaps (min of the pair), if known */
  neighborCount?: number | null;
  /** either side's primary IP is a CDN/mass-host */
  cdn?: boolean;
  /** the shared cert is wildcard or CDN-issued (ssl_san only) */
  wildcardOrCdnCert?: boolean;
  /** source label for the evidence panel */
  source: string;
}

// Calibrate ONE overlapping artifact into an OverlapItem (effective tier +
// strength + whether it contributes + measured commonness + alternative).
export function calibrateOverlap(kind: BoardArtifactKind, value: string, display: string, ctx: CalibrationCtx): OverlapItem {
  const entry = CALIBRATION[kind];
  let outcome: Outcome = DISTINCTIVE[kind];
  let commonness: number | null = null;

  const informational = () => { outcome = "info"; };

  switch (kind) {
    case "ssl_san":
      if (ctx.wildcardOrCdnCert) informational();
      break;
    case "ip":
      commonness = ctx.neighborCount ?? null;
      if (ctx.cdn) informational();
      else if (commonness != null && commonness > SHARED_IP_THRESHOLD) informational();
      break;
    case "ip_24":
      if (ctx.cdn) informational();
      break;
    case "asn":
    case "as_org":
    case "ptr_pattern":
      if (ctx.cdn || isMassHostOrg(value)) informational();
      break;
    case "ns_set":
      if (COMMON_NS.test(value)) informational();
      break;
    case "mx_host":
      if (COMMON_MAIL.test(value)) informational();
      break;
    case "outbound_domain":
      if (COMMON_OUTBOUND.test(value) || COMMON_THIRD_PARTY.test(value)) informational();
      break;
    case "third_party_origin":
      if (COMMON_THIRD_PARTY.test(value)) informational();
      break;
    // strong ids, social_handle, org_email, org_phone, boilerplate, ip_16,
    // registrar, and weak-tier kinds keep their DISTINCTIVE default.
  }

  // Whole-board saturation: a non-strong fact shared by ~all entities is common
  // within this set and should stop inflating every pair.
  if (entry.tier !== "strong" && ctx.totalEntities >= SATURATION_MIN_ENTITIES &&
      ctx.shareCount / ctx.totalEntities >= SATURATION_RATIO) {
    informational();
  }

  const countsToward = outcome !== "info";
  const strength: ConfidenceLevel = outcome === "info" ? "Low" : outcome;
  // Display tier reflects the effective outcome: a down-weighted or weak fact
  // reads as Weak; a distinctive Strong id keeps Strong.
  const tier: Tier = outcome === "High" ? "strong" : outcome === "Medium" ? "calibrated" : "weak";

  return {
    kind, value, display, tier, strength, countsToward, commonness,
    alternative: entry.alternative, source: ctx.source,
  };
}

// Combine a pair's calibrated overlaps into one aggregate strength.
//  - only a Strong-tier artifact yields a High edge;
//  - any contributing Moderate yields Medium;
//  - two+ independent contributing Weak signals raise Low -> Medium (one band);
//  - one contributing Weak -> Low; nothing contributing -> Unknown (no edge).
export function combineStrength(items: OverlapItem[]): ConfidenceLevel {
  if (items.some((i) => i.tier === "strong")) return "High";
  const counting = items.filter((i) => i.countsToward);
  if (counting.some((i) => i.strength === "Medium")) return "Medium";
  const weak = counting.filter((i) => i.strength === "Low");
  if (weak.length >= 2) return "Medium";
  if (weak.length >= 1) return "Low";
  return "Unknown";
}

// Rank a pair's overlaps strongest-first and build the aggregate edge.
export function buildPairEdge(a: string, b: string, items: OverlapItem[]): PairEdge {
  const order: Record<ConfidenceLevel, number> = { High: 3, Medium: 2, Low: 1, Unknown: 0 };
  const sorted = [...items].sort((x, y) => order[y.strength] - order[x.strength]);
  return {
    a, b,
    strength: combineStrength(items),
    overlapCount: items.length,
    top: sorted[0] || null,
    items: sorted,
  };
}
