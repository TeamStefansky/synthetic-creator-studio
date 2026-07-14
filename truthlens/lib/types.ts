// Shared TypeScript types for the entire TruthLens report object.
// Keeping these in one place lets every lib/ module and component agree
// on the exact shape of the data that flows through /api/analyze.

/** Generic wrapper for a data source that may be unavailable. */
export type Maybe<T> = T | null;

// ----------------------------------------------------------------------------
// Infrastructure
// ----------------------------------------------------------------------------

export interface DomainInfo {
  registrar: Maybe<string>;
  createdAt: Maybe<string>; // ISO date
  expiresAt: Maybe<string>; // ISO date
  updatedAt: Maybe<string>; // ISO date
  registrantOrg: Maybe<string>;
  registrantCountry: Maybe<string>;
  privacyProtected: boolean;
  ageDays: Maybe<number>;
  nameservers: string[];
}

export interface HostingInfo {
  ip: Maybe<string>;
  asn: Maybe<string>;
  org: Maybe<string>; // hosting provider / org
  city: Maybe<string>;
  region: Maybe<string>;
  country: Maybe<string>; // ISO-2 country code
  hostname: Maybe<string>;
  // Attribution addendum: a CDN masks the true origin server, so a country
  // read off a CDN edge is meaningless. When isCdn is true the UI must label
  // the geolocation as "CDN edge — true origin masked" rather than assert a
  // country. isDatacenter marks hosting/cloud ASNs (a bot signal in logs).
  isCdn: boolean;
  cdnProvider: Maybe<string>;
  isDatacenter: boolean;
}

export interface MailInfo {
  mxProvider: Maybe<string>;
  mxRecords: string[];
  hasSpf: boolean;
  hasDkim: boolean; // best-effort (DKIM selectors are not enumerable via DNS)
  hasDmarc: boolean;
  emailsFound: string[];
}

export interface SslInfo {
  issuer: Maybe<string>;
  validFrom: Maybe<string>;
  validTo: Maybe<string>;
  sanDomains: string[]; // de-duplicated SAN domains across all certs
  certCount: number;
  validHttps: boolean;
}

export interface TechInfo {
  cms: Maybe<string>;
  server: Maybe<string>;
  frameworks: string[];
  adNetworks: string[];
  trackers: string[];
  gaIds: string[]; // Google Analytics (G-..., UA-...)
  adsenseIds: string[]; // ca-pub-...
  hasAbout: boolean;
  hasContact: boolean;
  hasAuthors: boolean;
  hasCorrections: boolean;
}

export interface ArchiveInfo {
  firstSeen: Maybe<string>; // ISO date
  snapshotCount: number;
}

export interface Infrastructure {
  domain: DomainInfo;
  hosting: HostingInfo;
  mail: MailInfo;
  ssl: SslInfo;
  tech: TechInfo;
  archive: ArchiveInfo;
}

// ----------------------------------------------------------------------------
// Reputation
// ----------------------------------------------------------------------------

export interface FactCheckItem {
  claim: string;
  publisher: string;
  rating: Maybe<string>;
  url: Maybe<string>;
}

export interface Reputation {
  matchedCredible: boolean;
  matchedFake: boolean;
  matchedCredibleDomain: Maybe<string>;
  matchedFakeDomain: Maybe<string>;
  factChecks: FactCheckItem[];
}

// ----------------------------------------------------------------------------
// Content analysis (Anthropic)
// ----------------------------------------------------------------------------

export interface ContentAnalysis {
  available: boolean;
  sensationalism: Maybe<number>; // 0-100
  emotionalManipulation: Maybe<number>; // 0-100
  sourcingQuality: Maybe<number>; // 0-100
  aiGeneratedLikelihood: Maybe<number>; // 0-100
  summary: Maybe<string>;
  redFlags: string[];
}

// ----------------------------------------------------------------------------
// Risk
// ----------------------------------------------------------------------------

export type Band = "LIKELY LEGITIMATE" | "UNKNOWN" | "HIGH RISK";
export type Confidence = "Low" | "Medium" | "High";

export interface EvidenceItem {
  label: string;
  impact: number; // +/- contribution to the score
  detail: string;
}

export interface Risk {
  score: number; // 0-100, higher = higher risk
  band: Band;
  confidence: Confidence;
  evidence: EvidenceItem[];
}

// ----------------------------------------------------------------------------
// Operator network graph
// ----------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  label: string;
  kind: "target" | "domain" | "ip" | "ga" | "adsense";
  known?: "credible" | "fake";
}

export interface GraphEdge {
  source: string;
  target: string;
  reason: string; // why these two are linked
}

export interface OperatorNetwork {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ----------------------------------------------------------------------------
// Attribution addendum — shared, and site-report extensions
// ----------------------------------------------------------------------------

export type Likelihood = "Low" | "Medium" | "High";

/** Adversary-origin flagging on the site report. */
export interface AdversaryOrigin {
  configured: boolean; // is an adversary list configured at all?
  flagged: boolean;
  // Which observed country codes matched the adversary list, and from where.
  matches: { source: "hosting" | "asn" | "registrant"; country: string }[];
  cdnMasked: boolean; // true origin hidden behind a CDN — don't assert country
  cdnProvider: Maybe<string>;
}

/** Coordination / bot-farm likelihood derived from already-available signals. */
export interface Coordination {
  likelihood: Likelihood;
  score: number;
  evidence: EvidenceItem[];
}

/** Open-web content-propagation tracing result. */
export interface PropagationHit {
  domain: string;
  url: string;
  title: Maybe<string>;
  publishedAt: Maybe<string>;
}
export interface Propagation {
  available: boolean;
  query: Maybe<string>; // the distinctive phrase searched
  hits: PropagationHit[];
  earliestPublisher: Maybe<string>;
  earliestDate: Maybe<string>;
  coordinatedAmplification: boolean; // republishers share operator infra
  note: Maybe<string>;
}

// ----------------------------------------------------------------------------
// Top-level report
// ----------------------------------------------------------------------------

export interface Report {
  url: string;
  domain: string;
  fetchedAt: string; // ISO timestamp
  infrastructure: Infrastructure;
  reputation: Reputation;
  contentAnalysis: ContentAnalysis;
  risk: Risk;
  network: OperatorNetwork;
  // Attribution addendum additions:
  adversaryOrigin: AdversaryOrigin;
  coordination: Coordination;
  propagation: Propagation;
}

// ----------------------------------------------------------------------------
// Attribution tools — log analyzer
// ----------------------------------------------------------------------------

export interface EnrichedIp {
  ip: string;
  country: Maybe<string>;
  city: Maybe<string>;
  asn: Maybe<string>;
  asnOrg: Maybe<string>;
  isDatacenter: boolean;
  isCdn: boolean;
  cdnProvider: Maybe<string>;
  ptr: Maybe<string>;
  adversary: boolean;
  enriched: boolean; // false when enrichment was unavailable
}

export interface LogIpRow {
  ip: string;
  requests: number;
  firstSeen: Maybe<string>;
  lastSeen: Maybe<string>;
  userAgents: string[];
  paths: string[]; // distinct paths, capped
  flags: string[]; // human-readable reasons
  info: EnrichedIp;
  // ordered content path (url + ts), capped
  contentPath: { path: string; at: Maybe<string> }[];
}

export interface LogAnalysis {
  totalLines: number;
  parsedRequests: number;
  malformedLines: number;
  uniqueIps: number;
  datacenterPct: number;
  adversaryIpCount: number;
  suspectedBotIpCount: number;
  countryBreakdown: { country: string; requests: number }[];
  timeline: { bucket: string; requests: number; burst: boolean }[];
  rows: LogIpRow[];
  botUserAgents: { userAgent: string; ipCount: number }[];
  enrichmentAvailable: boolean;
}

// ----------------------------------------------------------------------------
// Attribution tools — email header tracer
// ----------------------------------------------------------------------------

export interface EmailHop {
  index: number; // 0 = origin (bottom-most Received)
  from: Maybe<string>;
  by: Maybe<string>;
  ip: Maybe<string>;
  timestamp: Maybe<string>;
  info: Maybe<EnrichedIp>;
}

export interface EmailTrace {
  hops: EmailHop[];
  originIp: Maybe<string>;
  originCountry: Maybe<string>;
  spf: Maybe<string>;
  dkim: Maybe<string>;
  dmarc: Maybe<string>;
  spoofingVerdict: "Likely authentic" | "Suspicious" | "Likely spoofed" | "Unknown";
  spoofingReasons: string[];
  adversaryHops: number;
}
