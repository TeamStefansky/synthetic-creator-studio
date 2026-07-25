import { describe, it, expect } from "vitest";
import { agentShouldAlert, agentAlertFingerprint, isPermittedAlertText } from "../../lib/agent/alerts";

describe("agent alert routing (05·P6)", () => {
  it("alerts only on picture-changing / human-needed events; the rest is digest", () => {
    for (const k of ["judgment_change", "rung_change", "assumption_failing", "indicator_fired", "proposal_queued", "halted"]) {
      expect(agentShouldAlert(k)).toBe(true);
    }
    for (const k of ["new_evidence", "crawl_time_advanced", "collection", "cosmetic"]) {
      expect(agentShouldAlert(k)).toBe(false);
    }
  });

  it("uses a Brand-Watch-compatible fingerprint (caseId, changeKind, subjectKey)", () => {
    expect(agentAlertFingerprint("c1", "rung_change", "case:rung")).toContain("c1");
  });

  it("rejects alert copy that asserts intent, coordination, or attribution", () => {
    expect(isPermittedAlertText("cluster a.com,b.com strengthened High")).toBe(true);
    expect(isPermittedAlertText("the campaign was coordinated by actor X")).toBe(false);
    expect(isPermittedAlertText("sites are operated by the same group")).toBe(false);
  });
});
