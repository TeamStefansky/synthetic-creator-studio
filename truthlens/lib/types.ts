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
  country: Maybe<string>;
  hostname: Maybe<string>;
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
}
