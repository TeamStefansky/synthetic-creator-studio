import { describe, it, expect } from "vitest";
import { ALL_FIXTURES } from "./fixtures/tool-outputs";

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

describe("case synthesis — target behaviours (P0)", () => {
  // P3 (graph/direction): lib/case/graph.ts + timeline direction matrix.
  it.todo(
    "T4-only pair yields `order not established` — a shared-content pair where one endpoint's only " +
    "timestamp is our crawl time (T4) and the other is also T4 produces a related-but-unordered edge, " +
    "no arrow in either direction, and is NOT silently dropped [activates in 03·P3]",
  );

  // P3 (clusters): lib/case/cluster.ts — only Moderate+ edges create/extend a component.
  it.todo(
    "weak edges never join components — the boardResult fixture's Low ASN edge (b.com↔c.com) must not " +
    "merge c.com into the a/b cluster formed by the High shared GA id [activates in 03·P3]",
  );

  // P4 (negative evidence vs gaps): lib/case/gaps.ts + negative.ts + the ACH scorer.
  it.todo(
    "a gap must not score in the ACH matrix — an absence from a truncated/rate-limited search is a Gap " +
    "(scores zero both directions), never NegativeEvidence; only a four-condition-adequate absence " +
    "scores against a hypothesis [activates in 03·P4]",
  );

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
