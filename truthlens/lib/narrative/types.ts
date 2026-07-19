// Shared types for the in-app narrative / Brand Watch engine.
// Everything here runs server-side only (see app/api/brandwatch).

export interface Mention {
  source: string;
  id: string;
  text: string;
  url?: string;
  /** An account handle/display name — an account, never a claim about a private individual. */
  account?: string;
  accountId?: string;
  timestamp?: string; // ISO 8601
  lang?: string;
  country?: string; // source country when the source reports it (e.g. GDELT)
  accountCreatedAt?: string; // ISO — when the source/enrichment exposes it (e.g. Bluesky)
  engagement?: number;
}

export interface SourceStatus {
  source: string;
  /** false → rendered as a visible "source not connected" state, never faked around. */
  connected: boolean;
  reason?: string;
  count: number;
  error?: string;
}

export type Level = "Low" | "Medium" | "High" | "Unknown";

/** Every indicator carries a level, the signals behind it, and an explicit
 * alternative explanation — per the project's non-negotiable rules. */
export interface Indicator {
  key: string;
  label: string;
  level: Level;
  score: number; // 0-100 (ignored when level === "Unknown")
  confidence: number; // 0-1
  signals: string[]; // evidence bullets
  alternative: string; // "could also be explained by…"
  detail: string;
}

/** OSINT intel on a single amplifying domain (reuses the shared rdap/dns/ip libs).
 * Infrastructure facts only — organizations/countries, never a private individual. */
export interface DomainIntel {
  domain: string;
  count: number; // mentions observed from this domain
  registrantCountry?: string;
  registrantOrg?: string; // organization only (rdap already drops redacted/privacy)
  hostingCountry?: string;
  asn?: string;
  asnOrg?: string;
  ageDays?: number;
  privacyProtected?: boolean;
}

/** Aggregated infrastructure view across the amplifying domains. */
export interface ForeignEnrichment {
  intel: DomainIntel[];
  considered: number; // domains we looked at
  resolved: number;   // domains we got any intel for
  topRegistrantCountry?: string;
  registrantShare: number; // 0-1 of resolved domains sharing the top registrant country
  topHostingCountry?: string;
  hostingShare: number;    // 0-1 of resolved domains sharing the top hosting country
  sharedAsn: { asn: string; asnOrg?: string; domains: string[] }[];
  privacyCount: number;
}

/** Cross-language mirroring — LLM read of whether ONE claim is mirrored across
 * languages. Correlation, never proof of state involvement. Degrades to
 * available:false (visible "not connected") when the AI layer is absent. */
export interface MirroringResult {
  available: boolean;
  mirrored: boolean;
  languages: string[];
  claim?: string;
  alternative?: string;
  reason?: string;
}

export interface NarrativeCluster {
  label: string;
  summary: string;
  hostility: "low" | "medium" | "high";
  alternative: string; // "could also be explained by…"
}
export interface NarrativeExtraction {
  available: boolean;
  coreClaims: string[];
  clusters: NarrativeCluster[];
  assessment: string;
  reason?: string;
}

/** A preserved copy of an evidence URL. `archived` = a snapshot is confirmed
 * available; `requested` = Save Page Now was triggered but not yet confirmed
 * (honest — we never claim a snapshot that may not exist). */
export interface ArchiveLink {
  url: string;
  archiveUrl: string;
  status: "archived" | "requested";
  timestamp?: string;
}

export type ThreatStatus = "CALM" | "ELEVATED" | "UNDER_ATTACK" | "UNKNOWN";

export interface ThreatResult {
  entity: string;
  score: number | null; // null → Unknown (no signals)
  status: ThreatStatus;
  totalMentions: number;
  totalAccounts: number;
  sources: SourceStatus[];
  indicators: Indicator[];
  evidence: Mention[];
  trend: { ts: string; count: number }[];
  rubricVersion: string;
  generatedAt: string;
  note?: string;
  narratives?: NarrativeExtraction;
  /** Earliest-timestamped mention in the collected data. ALWAYS "earliest
   * observed in collected data" — never asserted as the true origin. */
  earliest?: Mention;
  /** Preserved copies of the top evidence URLs (deep scans). */
  archives?: ArchiveLink[];
}
