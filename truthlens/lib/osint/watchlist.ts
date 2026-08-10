// OSINT watchlist - loads the operator-curated monitor rules (data/osint/
// watchlist.json) and resolves, honestly, which of each rule's tools are LIVE on
// this deployment vs not configured (rule 7 - degraded coverage is disclosed,
// never hidden). Attribution is organization/campaign-level with cited public
// reporting only; no private individuals (rule 1). Pure + testable.

import raw from "@/data/osint/watchlist.json";

export const WATCHLIST_VERSION = "osint-watchlist-v1";

export type Confidence = "high" | "moderate" | "low";

export interface WatchRule {
  id: string;
  cluster: string;
  attribution: string;
  reporting: string[];
  confidence: Confidence;
  tools: string[];
  match: Record<string, unknown>;
  notes: string;
}

export interface ResolvedRule extends WatchRule {
  toolsLive: string[];
  toolsNotConfigured: string[];
  /** Honest coverage note for the report / UI. */
  coverage: string;
}

/**
 * Tool availability. A tool is LIVE when it needs no key (keyless open source) or
 * when its env key is present; otherwise it is not_configured. The map is the one
 * place that knows what powers each selector - extend it as connectors are added.
 */
const TOOL_ENV: Record<string, string | null> = {
  "crtsh.certs": null, // crt.sh CT logs - keyless, always live
  "urlscan.search": "URLSCAN_API_KEY",
  "securitytrails.subdomains": "SECURITYTRAILS_API_KEY",
  "securitytrails.whois_history": "SECURITYTRAILS_API_KEY",
  "securitytrails.passive_dns_history": "SECURITYTRAILS_API_KEY",
  "domaintools.reverse_ip": "DOMAINTOOLS_API_KEY",
  "recordedfuture.ioc_context": "RECORDEDFUTURE_API_KEY",
  "reversetracker.by_adsense": "REVERSETRACKER_API_KEY",
  "reversetracker.shared_code": "REVERSETRACKER_API_KEY",
};

/** Is a tool live on this deployment? Keyless tools are always live. */
export function toolStatus(toolId: string, env: NodeJS.ProcessEnv = process.env): "live" | "not_configured" {
  if (!(toolId in TOOL_ENV)) return "not_configured";
  const envKey = TOOL_ENV[toolId];
  if (envKey === null) return "live"; // keyless
  return env[envKey] ? "live" : "not_configured";
}

function coverageNote(live: string[], missing: string[]): string {
  if (missing.length === 0) return "Full tool coverage for this rule.";
  if (live.length === 0) return `Degraded: no configured tools - free-source checks only (${missing.join(", ")} not configured).`;
  return `Partial coverage: ${live.join(", ")} live; ${missing.join(", ")} not configured - free-source checks fill the gap.`;
}

/** Resolve one rule against the live tool set. Pure given `env`. */
export function resolveRule(rule: WatchRule, env: NodeJS.ProcessEnv = process.env): ResolvedRule {
  const toolsLive = rule.tools.filter((t) => toolStatus(t, env) === "live");
  const toolsNotConfigured = rule.tools.filter((t) => toolStatus(t, env) !== "live");
  return { ...rule, toolsLive, toolsNotConfigured, coverage: coverageNote(toolsLive, toolsNotConfigured) };
}

export function getRules(): WatchRule[] {
  return ((raw as { rules?: WatchRule[] }).rules || []).map((r) => ({
    id: r.id, cluster: r.cluster, attribution: r.attribution, reporting: r.reporting || [],
    confidence: r.confidence, tools: r.tools || [], match: r.match || {}, notes: r.notes || "",
  }));
}

export function getResolvedRules(env: NodeJS.ProcessEnv = process.env): ResolvedRule[] {
  return getRules().map((r) => resolveRule(r, env));
}

export function watchlistDefaults(): { schedule: string; min_confidence_to_alert: string; dedupe_window_days: number } {
  const d = (raw as any).defaults || {};
  return {
    schedule: d.schedule || "0 */6 * * *",
    min_confidence_to_alert: d.min_confidence_to_alert || "low",
    dedupe_window_days: d.dedupe_window_days ?? 30,
  };
}
