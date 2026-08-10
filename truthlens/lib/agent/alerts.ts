// Agent alert routing (layer 05 · P6). Reuses the Brand Watch pipeline (dedup,
// cooldown, flapping) - no second alerting system. Alert ONLY on the events that
// change the picture or need a human; everything else goes to the digest. No
// alert text may assert intent, coordination, escalation, or attribution.

export const AGENT_ALERTS_VERSION = "agent-alerts-v1";

export type AgentAlertKind =
  | "judgment_change" | "rung_change" | "assumption_failing"
  | "indicator_fired" | "proposal_queued" | "halted";

// The complete set that alerts; anything not here is digest-only.
const ALERTING: ReadonlySet<AgentAlertKind> = new Set<AgentAlertKind>([
  "judgment_change", "rung_change", "assumption_failing", "indicator_fired", "proposal_queued", "halted",
]);

export function agentShouldAlert(kind: string): boolean {
  return ALERTING.has(kind as AgentAlertKind);
}

/** Brand Watch fingerprint - dedup/cooldown are handled by that pipeline. */
export function agentAlertFingerprint(caseId: string, changeKind: string, subjectKey: string): string {
  return `${caseId}␟${changeKind}␟${subjectKey}`;
}

// Alert copy must never assert intent/coordination/attribution. Reject such text.
const FORBIDDEN_ALERT = /\b(coordinated|directed|orchestrated|campaign|intent(ional)?|escalation|attributed to|operated by|state-sponsored)\b/i;
export function isPermittedAlertText(text: string): boolean {
  return !FORBIDDEN_ALERT.test(text || "");
}
