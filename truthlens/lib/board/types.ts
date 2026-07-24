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

export interface BoardResult {
  entities: string[];
  edges: PairEdge[];                       // only pairs with >=1 overlap, strongest first
  matrix: (ConfidenceLevel | null)[][];    // entity x entity aggregate strength
  rubricVersion: string;
  generatedAt: string;
  sources: SourceStatus[];
  fingerprints: { entity: string; artifactCount: number; errors: string[] }[];
}
