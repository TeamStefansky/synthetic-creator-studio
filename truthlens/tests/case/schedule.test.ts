import { describe, it, expect } from "vitest";
import { nextInterval, budgetExhausted, coverageOf, MIN_INTERVAL_MS, MAX_INTERVAL_MS, BACKOFF_FACTOR, RUN_BUDGET } from "../../lib/case/schedule";
import { synthesizeCase } from "../../lib/case/synthesize";
import { monitorDiff } from "../../lib/case/diff";

describe("coverage-safe scheduling (04·P3)", () => {
  it("cadence resets to the floor on a material change and backs off when dormant", () => {
    expect(nextInterval(null, false)).toBe(MIN_INTERVAL_MS);          // first run
    expect(nextInterval(MIN_INTERVAL_MS, true)).toBe(MIN_INTERVAL_MS); // material change resets
    expect(nextInterval(MIN_INTERVAL_MS, false)).toBe(MIN_INTERVAL_MS * BACKOFF_FACTOR); // dormant backs off
    expect(nextInterval(MAX_INTERVAL_MS, false)).toBe(MAX_INTERVAL_MS); // capped at ceiling
  });

  it("budget exhaustion is detected on either external calls or wall clock", () => {
    expect(budgetExhausted({ externalCalls: RUN_BUDGET.maxExternalCalls, wallClockMs: 0 })).toBe(true);
    expect(budgetExhausted({ externalCalls: 0, wallClockMs: RUN_BUDGET.maxWallClockMs })).toBe(true);
    expect(budgetExhausted({ externalCalls: 1, wallClockMs: 1 })).toBe(false);
  });

  it("coverage is partial when a collector fails, the budget is spent, or entities are missed", () => {
    const spent = { externalCalls: 1, wallClockMs: 1 };
    expect(coverageOf({ spent, entitiesPlanned: 5, entitiesCollected: 5 })).toBe("full");
    expect(coverageOf({ spent, collectorFailed: true, entitiesPlanned: 5, entitiesCollected: 5 })).toBe("partial");
    expect(coverageOf({ spent: { externalCalls: RUN_BUDGET.maxExternalCalls, wallClockMs: 0 }, entitiesPlanned: 5, entitiesCollected: 5 })).toBe("partial");
    expect(coverageOf({ spent, entitiesPlanned: 5, entitiesCollected: 2 })).toBe("partial");
  });

  it("STARVED-BUDGET scenario: a partial run records the coverage and retracts nothing", () => {
    const prev = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [{ a: "a.com", b: "b.com", strength: "High" }], enteredCaseAt: "2026-01-01T00:00:00Z" });
    // budget starved after collecting 2 of 5 entities => partial
    const coverage = coverageOf({ spent: { externalCalls: RUN_BUDGET.maxExternalCalls, wallClockMs: 0 }, entitiesPlanned: 5, entitiesCollected: 2 });
    expect(coverage).toBe("partial");
    const starved = synthesizeCase({ entities: ["a.com", "b.com"], boardEdges: [], enteredCaseAt: "2026-01-01T00:00:00Z" }); // cluster "lost" only because we didn't collect
    const d = monitorDiff(prev, starved, coverage);
    expect(d.suppressedRemovals).toBeGreaterThan(0);
    expect(d.alerts).toHaveLength(0); // no alert of any kind from a partial run
  });
});
