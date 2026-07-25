// Materiality classification (layer 04 · P1). Every diff item lands in exactly one
// tier. Only Structural and Interpretive alert; Evidential accumulates into the
// digest; Cosmetic never reaches the diff feed. The unit of change is the
// conclusion, not the evidence — a re-observed fact or an advanced crawl time is
// Cosmetic no matter how much the ledger churned.

export const MATERIALITY_VERSION = "case-materiality-v1";

export type MaterialityTier = "structural" | "interpretive" | "evidential" | "cosmetic";

export type ChangeKind =
  // structural
  | "cluster_merge" | "cluster_split" | "new_moderate_edge" | "articulation_formed"
  | "articulation_collapsed" | "direction_established" | "direction_lost" | "membership_change"
  | "tier_upgrade_enables_direction" | "indicator_fired" | "content_superseded" | "rung_downgrade"
  // interpretive
  | "hypothesis_flip" | "verdict_change" | "confidence_band_change" | "narrative_rebuilt"
  | "assumption_confidence_drop"
  // evidential
  | "new_evidence" | "new_archive_snapshot" | "time_tier_upgrade"
  // cosmetic
  | "refound_fact" | "crawl_time_advanced" | "collector_bump" | "ordering_changed";

// The single source of truth for change -> tier. Versioned + stamped on each diff.
export const MATERIALITY_TABLE: Record<ChangeKind, MaterialityTier> = {
  cluster_merge: "structural",
  cluster_split: "structural",
  new_moderate_edge: "structural",
  articulation_formed: "structural",
  articulation_collapsed: "structural",
  direction_established: "structural",
  direction_lost: "structural",
  membership_change: "structural",
  // The most valuable alert: a tier upgrade that newly satisfies the direction test.
  tier_upgrade_enables_direction: "structural",
  indicator_fired: "structural",       // a pre-declared indicator overrides the generic tier
  content_superseded: "structural",    // silent drift: bytes changed under a conclusion
  rung_downgrade: "structural",        // a retraction of a claim the analyst may have acted on

  hypothesis_flip: "interpretive",
  verdict_change: "interpretive",      // undetermined <-> determined
  confidence_band_change: "interpretive",
  narrative_rebuilt: "interpretive",
  assumption_confidence_drop: "interpretive",

  new_evidence: "evidential",
  new_archive_snapshot: "evidential",
  time_tier_upgrade: "evidential",

  refound_fact: "cosmetic",
  crawl_time_advanced: "cosmetic",
  collector_bump: "cosmetic",
  ordering_changed: "cosmetic",
};

export function classifyMateriality(kind: ChangeKind): MaterialityTier {
  return MATERIALITY_TABLE[kind];
}

const ALERTING_TIERS: ReadonlySet<MaterialityTier> = new Set<MaterialityTier>(["structural", "interpretive"]);
export function tierAlerts(tier: MaterialityTier): boolean {
  return ALERTING_TIERS.has(tier);
}

/**
 * The Evidential -> Structural promotion (req. 5): a time-tier upgrade that newly
 * satisfies the directional test is the moment the sequence becomes provable, and
 * is promoted to the top alerting tier.
 */
export function promoteTierUpgrade(enablesDirection: boolean): ChangeKind {
  return enablesDirection ? "tier_upgrade_enables_direction" : "time_tier_upgrade";
}
