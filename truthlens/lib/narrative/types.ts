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
}
