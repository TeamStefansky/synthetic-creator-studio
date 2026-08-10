// Gaps register (layer 03 · P4). Everything our collection did NOT cover, kept
// strictly separate from negative evidence. Always visible, never collapsed by
// default (a UI rule for P7). A gap carries zero evidential weight.

import type { EvidenceOutcome } from "./negative";
import type { Ledger } from "./types";

// Platforms we do not ingest - their absence is a coverage gap, never a finding.
export const UNINGESTED_PLATFORMS = ["Telegram", "X", "Meta"] as const;

export interface Gap {
  kind: "no_rdap" | "no_archive" | "unresolved_time" | "reverse_ip_unavailable" | "empty_adapter" | "uningested_platform" | "predicted_but_uncollected";
  subject: string;
  reason: string;
}

export interface GapsInput {
  ledger: Ledger;
  entities: string[];                 // entityKeys in the case
  outcomes?: EvidenceOutcome[];       // classified search attempts (gaps flow in here)
  emptyAdapters?: string[];           // adapters that returned nothing
  reverseIpUnavailable?: string[];    // IPs whose neighbour count could not be fetched
}

export function buildGapsRegister(input: GapsInput): Gap[] {
  const gaps: Gap[] = [];
  const has = (entityKey: string, kind: string) =>
    input.ledger.items.some((i) => i.entityKey === entityKey && i.kind === kind && i.state !== "superseded");

  for (const ek of input.entities) {
    if (!has(ek, "domain_created")) gaps.push({ kind: "no_rdap", subject: ek, reason: "no RDAP/WHOIS creation date collected - no T1 lower bound for age/ordering" });
    if (!has(ek, "archive_first_seen")) gaps.push({ kind: "no_archive", subject: ek, reason: "no archive coverage - cannot bound when it first appeared" });
  }

  // Items that assert a value but carry no usable eventAt.
  for (const i of input.ledger.items) {
    if ((i.kind === "claim" || i.kind === "email_origin") && !i.eventTime) {
      gaps.push({ kind: "unresolved_time", subject: `${i.kind}:${i.value.slice(0, 40)}`, reason: "no event time resolved for this item" });
    }
  }

  for (const ip of input.reverseIpUnavailable || []) gaps.push({ kind: "reverse_ip_unavailable", subject: ip, reason: "reverse-IP neighbour count unavailable - shared-IP commonness could not be measured" });
  for (const a of input.emptyAdapters || []) gaps.push({ kind: "empty_adapter", subject: a, reason: "adapter returned no evidence - source unavailable or nothing to collect" });
  for (const p of UNINGESTED_PLATFORMS) gaps.push({ kind: "uningested_platform", subject: p, reason: "platform not ingested (out of scope) - a genuinely earlier/other instance may exist there" });

  for (const o of input.outcomes || []) {
    if (o.type === "gap") gaps.push({ kind: "predicted_but_uncollected", subject: `${o.hypothesis}:${o.expectedKind}`, reason: o.reason });
  }

  return gaps;
}
