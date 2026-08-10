// Link Board - domain/infrastructure overlap comparison (types).
//
// Nodes are DOMAINS/INFRASTRUCTURE, never people (CLAUDE.md rule 1). Every pair
// of board entities is compared across a server/infrastructure fingerprint plus
// any other structured fact either site exposes; each overlap is scored by
// calibrated discriminating power, carries evidence + a type-specific
// alternative, and common-by-default facts (nginx, WordPress, Cloudflare, shared
// CDN cert, generic headers) can never produce a standalone Moderate+ edge.
//
// This module holds ONLY types. Strength/tier/alternative live in calibrate.ts
// (the one source of truth); collection lives in links.ts.

import type { ConfidenceLevel } from "@/components/ConfidenceBadge";

// Every comparable artifact kind. Each MUST have an entry in calibrate.ts
// (enforced by the rubric-completeness test) - breadth cannot outrun calibration.
export type BoardArtifactKind =
  // --- Strong-by-default (deliberate or near-unique) ---
  | "ssl_san"            // shared TLS SAN host (non-wildcard, non-CDN issuer)
  | "ga_id"              // Google Analytics / UA property id
  | "adsense_id"         // AdSense ca-pub- publisher id
  | "gtm_id"             // Google Tag Manager container id
  | "fb_pixel_id"        // Facebook Pixel id
  | "matomo_id"          // Matomo/Piwik site id (+host)
  | "yandex_id"          // Yandex Metrica id
  | "hotjar_id"          // Hotjar site id
  | "clarity_id"         // Microsoft Clarity id
  | "verification_token" // google-site-verification & similar meta tokens
  | "csp_report_uri"     // distinctive CSP report-uri / report-to endpoint
  // --- Calibrated-by-commonness (measure before trusting) ---
  | "ip"                 // exact shared IP
  | "ip_24"              // same /24
  | "ip_16"              // same /16
  | "asn"                // shared ASN
  | "as_org"             // shared AS-org / hosting org
  | "ptr_pattern"        // shared reverse-DNS PTR pattern
  | "ns_set"             // shared nameserver
  | "mx_host"            // shared MX host
  | "registrar"          // shared registrar
  | "social_handle"      // shared org social handle
  | "org_email"          // org-PUBLISHED contact email (never personal)
  | "org_phone"          // org-PUBLISHED contact phone (never personal)
  | "outbound_domain"    // shared outbound-link domain
  | "third_party_origin" // shared embedded third-party origin (script/img/iframe)
  | "boilerplate"        // shared copyright/tagline/boilerplate (similarity)
  // --- Weak / contextual (only in combination) ---
  | "server_header"      // nginx / Apache / ...
  | "cms"                // WordPress / ...
  | "framework"          // Next.js / ...
  | "hosting_country"    // same hosting country
  | "reg_date_proximity";// registration dates close together

// Runtime list of every artifact kind - the rubric-completeness test asserts
// this equals the keys of CALIBRATION, so breadth can never outrun calibration.
export const ALL_BOARD_ARTIFACT_KINDS: BoardArtifactKind[] = [
  "ssl_san", "ga_id", "adsense_id", "gtm_id", "fb_pixel_id", "matomo_id", "yandex_id",
  "hotjar_id", "clarity_id", "verification_token", "csp_report_uri",
  "ip", "ip_24", "ip_16", "asn", "as_org", "ptr_pattern", "ns_set", "mx_host", "registrar",
  "social_handle", "org_email", "org_phone", "outbound_domain", "third_party_origin", "boilerplate",
  "server_header", "cms", "framework", "hosting_country", "reg_date_proximity",
];

// Base discriminating tier declared in the rubric.
export type Tier = "strong" | "calibrated" | "weak";

// One collected artifact value for a single entity (pre-comparison).
export interface Artifact {
  kind: BoardArtifactKind;
  value: string;   // normalized comparison key (lowercased, trimmed)
  display?: string; // optional human label if different from value
}

// The full per-entity fingerprint: its artifacts plus the raw context needed to
// calibrate them (neighbour counts, CDN flags, wildcard-cert flag, ...).
export interface Fingerprint {
  entity: string;              // the domain
  artifacts: Artifact[];
  neighborCount: number | null; // reverse-IP neighbours on the primary IP
  cdn: boolean;                 // primary IP is a known CDN / mass-host
  wildcardCertOrCdnIssuer: boolean; // cert is wildcard or CDN-issued
  createdAt?: string;          // domain registration date (pair-derived proximity)
  boilerplate?: string;        // normalized footer/copyright text (similarity)
  ip?: string;                 // primary A-record IP (for the network graph)
  neighbors?: string[];        // reverse-IP neighbour domains (dedicated hosts only)
  gaIds?: string[];            // Google Analytics IDs (network hubs)
  adsenseIds?: string[];       // AdSense IDs (network hubs)
  sans?: string[];             // TLS SAN domains (operator signal)
  errors: string[];            // per-source failures (failure isolation)
}

// A single overlapping artifact between two entities, after calibration.
export interface OverlapItem {
  kind: BoardArtifactKind;
  value: string;
  display: string;
  tier: Tier;                 // effective tier (may be down-tiered by calibration)
  strength: ConfidenceLevel;  // Low | Medium | High
  countsToward: boolean;      // does it contribute to the aggregate combination?
  commonness: number | null;  // measured commonness (e.g. neighbours), null = not measured
  alternative: string;        // type-specific "could also be explained by..."
  source: string;             // where the fact came from
}

// The aggregated edge between a pair of entities.
export interface PairEdge {
  a: string;
  b: string;
  strength: ConfidenceLevel;  // aggregate combined strength (Unknown = no overlap)
  overlapCount: number;
  top: OverlapItem | null;    // strongest single overlap
  items: OverlapItem[];       // all overlaps, strongest first
}

export interface SourceStatus { source: string; ok: boolean; note?: string }

// --- Evidence corroboration overlay (layer 07) -------------------------------
// An ADDITIVE overlay on the calibrated edges: it never rewrites a base tier, it
// only adds measured context (worldwide prevalence, id recency, an analytic null
// baseline) and, where warranted, a DOWN-ONLY effective strength. Its own version
// stamp keeps historical overlays interpretable independently of the base rubric.
export interface ArtifactCorroboration {
  kind: BoardArtifactKind;
  value: string;
  display: string;
  baseStrength: ConfidenceLevel;      // strength the base rubric assigned this overlap
  effectiveStrength: ConfidenceLevel; // after corroboration (never raised, only capped)
  prevalence: import("./prevalence").PrevalenceResult;
  deprecated?: string;                // e.g. UA- recency note (present if applicable)
  baseRateByChance: number;           // P(two unrelated sites share this) from the rubric
  notes: string[];                    // human-readable reasons for any adjustment
}

export interface Corroboration {
  version: string;
  prevalenceConnected: boolean;
  providers: string[];                // connected reverse-lookup providers (may be empty)
  artifacts: ArtifactCorroboration[]; // one per distinctive shared id across the board
  // The explicit null model, stated up front (frozen: confidence needs an alternative).
  nullHypothesis: { ifLinked: string; ifUnrelated: string };
  // Analytic control: the probability the observed distinctive overlaps co-occur by
  // chance, from the rubric's per-artifact base rates (a reproducible stand-in for a
  // live known-unrelated control group, which can be added when providers connect).
  control: {
    distinctiveOverlapCount: number;
    probabilityByChance: number | null;
    significance: string;
    note: string;
  };
  // What this scan did NOT look at - where the strongest "link" evidence usually
  // lives - surfaced honestly rather than left implied (frozen rule 7).
  notScanned: { area: string; why: string; where: string }[];
  summary: string;
}

// Reuse the proven operator-network graph shape (lib/network.ts / NetworkGraph).
export interface BoardNetwork {
  nodes: { id: string; label: string; kind: "target" | "domain" | "ip" | "ga" | "adsense" | "account"; flaggedFake?: boolean }[];
  edges: { source: string; target: string; reason: string }[];
  note?: string;
}

export interface BoardResult {
  entities: string[];
  edges: PairEdge[];                       // only pairs with >=1 overlap, strongest first
  network: BoardNetwork;                   // merged operator-network across all domains
  matrix: (ConfidenceLevel | null)[][];    // entity x entity aggregate strength
  rubricVersion: string;
  generatedAt: string;
  sources: SourceStatus[];
  fingerprints: { entity: string; artifactCount: number; errors: string[]; authority?: number; asnOrg?: string; nsDomains?: string[]; neighbors?: string[] }[];
  /** Documented, cited, org-level reputation of the shared hosting operator(s). */
  operatorReputation?: import("@/lib/operator-reputation").OperatorReputation;
  /** infra -> narrative bridge: compared domains that match a documented list or
   * amplify a monitored narrative (leads with an innocent alternative). */
  crossLinks?: import("@/lib/bridge").CrossLookupResult;
  /** Evidence corroboration overlay: measured worldwide prevalence, id recency,
   * an analytic null baseline, and an honest "what wasn't scanned" list. */
  corroboration?: Corroboration;
}
