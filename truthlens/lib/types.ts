// ============================================================================
// TruthLens — shared TypeScript types for the whole report object and the
// attribution tools. Keeping these in one place means lib modules, API routes,
// and components all agree on shape.
// ============================================================================

export type Availability = "ok" | "unavailable";

/** A single value that may not have been retrievable from its source. */
export interface Maybe<T> {
  status: Availability;
  value?: T;
  error?: string;
}

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

export interface DomainInfo {
  registrar?: string;
  createdAt?: string; // ISO
  expiresAt?: string; // ISO
  updatedAt?: string; // ISO
  registrantOrg?: string;
  registrantCountry?: string;
  privacyProtected: boolean;
  ageDays?: number;
  status?: string[];
}

export interface HostingInfo {
  ip?: string;
  asn?: string;
  asnOrg?: string;
  country?: string;
  region?: string;
  city?: string;
  hostingType?: "residential" | "datacenter" | "unknown";
  cdn?: string; // detected CDN name, if any
  cdnMasksOrigin?: boolean;
}

export interface MailInfo {
  mxProviders: string[];
  spf: boolean;
  dkim: boolean; // best-effort (selector-dependent, often "unknown")
  dmarc: boolean;
  emailsFound: string[];
}

export interface SslInfo {
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  sanDomains: string[];
  certCount: number;
}

export interface TechInfo {
  cms?: string;
  frameworks: string[];
  adNetworks: string[];
  trackers: string[];
  gaIds: string[]; // G-..., UA-...
  adsenseIds: string[]; // ca-pub-...
  emails: string[];
  hasAbout: boolean;
  hasContact: boolean;
  hasAuthor: boolean;
  hasCorrections: boolean;
}

export interface ArchiveInfo {
  firstSeen?: string;
  snapshotCount: number;
}

export interface Infrastructure {
  domain: Maybe<DomainInfo>;
  hosting: Maybe<HostingInfo>;
  mail: Maybe<MailInfo>;
  ssl: Maybe<SslInfo>;
  tech: Maybe<TechInfo>;
  archive: Maybe<ArchiveInfo>;
}

// ---------------------------------------------------------------------------
// Reputation & content
// ---------------------------------------------------------------------------

export interface FactCheckItem {
  claim: string;
  publisher: string;
  rating: string;
  url?: string;
}

export interface Reputation {
  matchedCredible: boolean;
  matchedFake: boolean;
  matchedCredibleDomain?: string;
  matchedFakeDomain?: string;
  factChecks: FactCheckItem[];
}

export interface ContentAnalysis {
  available: boolean;
  sensationalism: number; // 0-100
  emotionalManipulation: number;
  sourcingQuality: number;
  aiGeneratedLikelihood: number;
  summary: string;
  redFlags: string[];
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type RiskBand = "LIKELY_LEGITIMATE" | "UNKNOWN" | "HIGH_RISK";
export type Confidence = "Low" | "Medium" | "High";

export interface EvidenceItem {
  label: string;
  impact: number; // +N risk-increasing, -N risk-decreasing
  detail: string;
}

export interface RiskResult {
  score: number; // 0-100 (higher = riskier)
  band: RiskBand;
  confidence: Confidence;
  evidence: EvidenceItem[];
}

// ---------------------------------------------------------------------------
// Operator network graph
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  label: string;
  kind: "target" | "domain" | "ip" | "ga" | "adsense";
  flaggedFake?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  reason: string; // "shared IP", "shared GA id", etc.
}

export interface OperatorNetwork {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
// Full report
// ---------------------------------------------------------------------------

export interface Report {
  url: string;
  domain: string;
  fetchedAt: string;
  finalUrl?: string;
  infrastructure: Infrastructure;
  reputation: Reputation;
  contentAnalysis: ContentAnalysis;
  risk: RiskResult;
  network: OperatorNetwork;
  propagation?: PropagationResult;
  coordination?: CoordinationResult;
}

// ===========================================================================
// ATTRIBUTION ADDENDUM TYPES
// ===========================================================================

// --- IP enrichment (shared by log analyzer + email tracer) ---------------

export interface IpEnrichment {
  ip: string;
  country?: string;
  region?: string;
  city?: string;
  asn?: string;
  asnOrg?: string;
  ptr?: string; // reverse DNS
  hostingType: "residential" | "datacenter" | "unknown";
  isAdversary: boolean;
}

// --- Log analyzer ---------------------------------------------------------

export interface LogEntry {
  ip: string;
  timestamp?: string;
  method?: string;
  path?: string;
  status?: number;
  bytes?: number;
  userAgent?: string;
  referer?: string;
  forwardedFor?: string;
}

export type LogFlag =
  | "adversary_country"
  | "datacenter_asn"
  | "shared_user_agent"
  | "high_rate"
  | "path_scanning";

export interface IpAggregate {
  ip: string;
  requests: number;
  enrichment: IpEnrichment;
  userAgents: string[];
  flags: LogFlag[];
  reasons: string[];
  /** Ordered URL path the visitor moved through. */
  contentPath: { path: string; timestamp?: string; status?: number }[];
}

export interface LogAnalysisResult {
  totalRequests: number;
  parsedLines: number;
  skippedLines: number;
  uniqueIps: number;
  datacenterPct: number;
  adversaryIpCount: number;
  suspectedBotIpCount: number;
  countryBreakdown: { country: string; requests: number }[];
  timeline: { bucket: string; requests: number; burst: boolean }[];
  topIps: IpAggregate[];
  sharedUserAgents: { userAgent: string; ipCount: number }[];
  note: string;
}

// --- Email header tracer --------------------------------------------------

export interface EmailHop {
  index: number;
  raw: string;
  from?: string;
  by?: string;
  ip?: string;
  enrichment?: IpEnrichment;
  timestamp?: string;
}

export interface EmailAuthResult {
  spf?: string;
  dkim?: string;
  dmarc?: string;
  spoofingLikely: boolean;
  verdict: string;
}

export interface EmailTraceResult {
  hops: EmailHop[]; // origin-first (bottom-to-top)
  originIp?: string;
  originCountry?: string;
  originIsAdversary: boolean;
  auth: EmailAuthResult;
}

// --- Content propagation --------------------------------------------------

export interface PropagationHit {
  domain: string;
  url: string;
  publishedAt?: string;
  source: "search" | "wayback";
}

export interface PropagationResult {
  available: boolean;
  quote: string;
  hits: PropagationHit[];
  earliestPublisher?: string;
  earliestDate?: string;
  coordinatedAmplification: boolean;
  note: string;
}

// --- Coordination / bot-farm ---------------------------------------------

export type CoordinationLevel = "Low" | "Medium" | "High";

export interface CoordinationResult {
  level: CoordinationLevel;
  score: number; // 0-100 internal
  signals: { label: string; weight: number; detail: string }[];
  note: string;
}
