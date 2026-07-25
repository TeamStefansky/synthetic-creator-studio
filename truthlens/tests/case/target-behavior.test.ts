import { describe, it, expect } from "vitest";
import { ALL_FIXTURES } from "./fixtures/tool-outputs";
import { orderOf } from "../../lib/case/calibrate-time";
import { buildClusters, type StrengthEdge } from "../../lib/case/cluster";
import { classifyOutcome, scoreContribution } from "../../lib/case/negative";
import { eventTime } from "../../lib/case/adapters/util";

// ============================================================================
// Layer 03 · P0 — target-behavior specs (discovery, no production code yet).
//
// These state the behaviours later phases must satisfy. They are registered as
// PENDING (it.todo) so `main` stays green on auto-deploy; the phase that builds
// the module named in each todo replaces it with a live assertion that must fail
// for the right reason before it passes. This is the single documented deviation
// from "write failing tests" in P0 — the target is captured executably, without
// shipping a red suite to production.
// ============================================================================

describe("case synthesis — target behaviours (P0, activated as phases land)", () => {
  // ACTIVATED in 03·P3 (graph/direction).
  it("T4-only pair yields order_not_established, not silently dropped", () => {
    expect(orderOf(eventTime("2026-01-01T00:00:00Z", "T4"), eventTime("2026-02-01T00:00:00Z", "T4"))).toBe("order_not_established");
  });

  // ACTIVATED in 03·P3 (clusters).
  it("weak edges never join components", () => {
    const edges: StrengthEdge[] = [
      { a: "a.com", b: "b.com", strength: "High" },  // GA-id cluster
      { a: "b.com", b: "c.com", strength: "Low" },   // ASN — must not pull c.com in
    ];
    const clusters = buildClusters(["a.com", "b.com", "c.com"], edges);
    expect(clusters.find((c) => c.members.includes("a.com"))!.members).not.toContain("c.com");
  });

  // ACTIVATED in 03·P4 (negative evidence vs gaps).
  it("a gap must not score in the ACH matrix; only an adequate absence does", () => {
    const gap = classifyOutcome({ id: "g", hypothesis: "same_operator", expectedKind: "ssl_san", predicted: true, searchCapable: false, coverageComplete: true, found: false, where: "crt.sh" });
    const neg = classifyOutcome({ id: "n", hypothesis: "same_operator", expectedKind: "ssl_san", predicted: true, searchCapable: true, coverageComplete: true, found: false, where: "crt.sh" });
    expect(scoreContribution(gap, "same_operator")).toBe(0);
    expect(scoreContribution(neg, "same_operator")).toBe(-1);
  });

  // P6 (validator): lib/case/narrate.ts + lexicon.ts — statement validation.
  it.todo(
    "a FACT label without directly observed evidence is rejected — the validator drops it, counts the " +
    "drop, and surfaces the count to the user [activates in 03·P6]",
  );

  // P6 (validator): rung ladder enforcement.
  it.todo(
    "language may not exceed the recorded rung — an `operated by the same group` statement attached to " +
    "an `association`-rung cluster is rejected and rewritten to the association-rung verb [activates in 03·P6]",
  );
});

// A green sanity check now: the discovery fixtures carry the evidence-bearing
// fields the P1 adapters will read, so the adapters have real shapes to target.
describe("P0 fixtures — shape sanity (green now)", () => {
  it("site fixtures expose the operator/time-tier fields adapters need", () => {
    expect(ALL_FIXTURES.site.infrastructure.domain.value.createdAt).toBeTruthy();       // T1 (RDAP)
    expect(ALL_FIXTURES.site.originTrace.likelyOrigin.asnOrg).toContain("1984");        // net_org clue
    expect(ALL_FIXTURES.siteB.geography.dns[0].host).toContain("1984.is");              // NS operator link
    expect(ALL_FIXTURES.site.infrastructure.ssl.value.sanDomains.length).toBeGreaterThan(0);
  });
  it("board fixture carries a High individualizing edge and a Low class-only edge", () => {
    const strengths = ALL_FIXTURES.board.edges.map((e) => e.strength);
    expect(strengths).toContain("High"); // shared GA id -> individual
    expect(strengths).toContain("Low");  // shared ASN -> class only
  });
  it("logs/email fixtures carry third-party-observed timestamps (T1-ish)", () => {
    expect(ALL_FIXTURES.logs.topIps[0].contentPath[0].timestamp).toBeTruthy();
    expect(ALL_FIXTURES.email.hops[0].timestamp).toBeTruthy();
  });
});
