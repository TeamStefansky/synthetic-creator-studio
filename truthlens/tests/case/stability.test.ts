import { describe, it, expect } from "vitest";
import {
  oscillationCount, isUnstable, isConfirmed, shouldAlertEdge, churnRate, isVolatile,
  isDismissed, type Dismissal,
} from "../../lib/case/stability";

describe("stability gating - anti-flapping (04·P2)", () => {
  it("a flapping edge (appear/disappear x2) alerts at most once and is marked unstable", () => {
    const flap = [true, false, true, false]; // appeared, gone, back, gone
    expect(oscillationCount(flap)).toBe(3);
    expect(isUnstable(flap)).toBe(true);
    expect(shouldAlertEdge(flap)).toBe(false); // suppressed while unstable
  });

  it("a stable non-T1 edge alerts only after it holds EDGE_CONFIRMATION_RUNS", () => {
    expect(shouldAlertEdge([false, true])).toBe(false);        // first appearance only
    expect(shouldAlertEdge([false, true, true])).toBe(true);   // held two runs
    expect(shouldAlertEdge([false, true, true], { alreadyAlerted: true })).toBe(false); // once only
  });

  it("a T1-derived edge alerts on first observation", () => {
    expect(isConfirmed([true], true)).toBe(true);
    expect(shouldAlertEdge([true], { t1Stable: true })).toBe(true);
  });

  it("a case that will not sit still is volatile", () => {
    const histories = [[true, false, true, false], [false, true, false, true], [true, false, true, false]];
    expect(churnRate(histories)).toBeGreaterThan(0.5);
    expect(isVolatile(histories)).toBe(true);
    expect(isVolatile([[false, true, true, true]])).toBe(false); // one stable element
  });

  it("a dismissal suppresses recurrence and is revocable", () => {
    const d: Dismissal[] = [{ caseId: "c1", changeKind: "new_moderate_edge", subjectKey: "a|b", reason: "known agency", at: "2026-01-01T00:00:00Z" }];
    expect(isDismissed(d, "c1", "new_moderate_edge", "a|b")).toBe(true);
    expect(isDismissed(d, "c1", "new_moderate_edge", "x|y")).toBe(false); // different subject
    const revoked: Dismissal[] = [{ ...d[0], revoked: true }];
    expect(isDismissed(revoked, "c1", "new_moderate_edge", "a|b")).toBe(false); // revocable
  });
});
