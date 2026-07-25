import { describe, it, expect } from "vitest";
import { classifyOutcome, scoreContribution, type SearchAttempt } from "../../lib/case/negative";
import { buildGapsRegister } from "../../lib/case/gaps";
import { buildLedger } from "../../lib/case/ledger";
import { mkProvenance, eventTime } from "../../lib/case/adapters/util";

const attempt = (over: Partial<SearchAttempt>): SearchAttempt => ({
  id: "att1", hypothesis: "same_operator", expectedKind: "adsense_id",
  predicted: true, searchCapable: true, coverageComplete: true, found: false, where: "adsense scan",
  ...over,
});

describe("negative evidence vs. gap — the four-condition test (P4)", () => {
  it("an ADEQUATE search that finds nothing is negative evidence and scores against its hypothesis", () => {
    const o = classifyOutcome(attempt({ found: false, searchCapable: true, coverageComplete: true }));
    expect(o.type).toBe("negative_evidence");
    expect(scoreContribution(o, "same_operator")).toBe(-1);   // counts against the predicting hypothesis
    expect(scoreContribution(o, "coincidence_null")).toBe(0); // not against others
  });

  it("a TRUNCATED search (not capable) is a gap and scores zero — even for the predicting hypothesis", () => {
    const o = classifyOutcome(attempt({ found: false, searchCapable: false }));
    expect(o.type).toBe("gap");
    expect(scoreContribution(o, "same_operator")).toBe(0); // the defect this section prevents
  });

  it("INCOMPLETE coverage is a gap, not negative evidence", () => {
    const o = classifyOutcome(attempt({ found: false, searchCapable: true, coverageComplete: false }));
    expect(o.type).toBe("gap");
    expect(scoreContribution(o, "same_operator")).toBe(0);
  });

  it("a found artifact is neither gap nor negative evidence", () => {
    const o = classifyOutcome(attempt({ found: true }));
    expect(o.type).toBe("found");
    expect(scoreContribution(o, "same_operator")).toBe(0);
  });

  it("negative evidence and gap are never interchangeable in the scorer", () => {
    const neg = classifyOutcome(attempt({ found: false, searchCapable: true, coverageComplete: true }));
    const gap = classifyOutcome(attempt({ found: false, searchCapable: false }));
    expect(scoreContribution(neg, "same_operator")).not.toBe(scoreContribution(gap, "same_operator"));
  });
});

describe("gaps register (P4)", () => {
  it("flags missing RDAP/archive, uningested platforms, empty adapters, and gap outcomes", () => {
    const { items } = buildLedger([
      { kind: "ip", entityKey: "domain:x.com", value: "1.2.3.4", provenance: mkProvenance({ sourceClass: "ip_enrichment", lineageId: "l", collectedAt: "2026-01-01T00:00:00Z" }) },
      { kind: "claim", entityKey: "post:s", value: "a claim with no time", provenance: mkProvenance({ sourceClass: "self_byline", lineageId: "l2", collectedAt: "2026-01-01T00:00:00Z" }) },
    ], "2026-07-20T00:00:00Z");
    const ledger = { items, byId: Object.fromEntries(items.map((i) => [i.id, i])) };
    const gaps = buildGapsRegister({
      ledger, entities: ["domain:x.com"],
      emptyAdapters: ["opensanctions"],
      reverseIpUnavailable: ["1.2.3.4"],
      outcomes: [{ type: "gap", hypothesis: "same_operator", expectedKind: "ssl_san", reason: "rate limited", where: "crt.sh" }],
    });
    const kinds = gaps.map((g) => g.kind);
    expect(kinds).toContain("no_rdap");
    expect(kinds).toContain("no_archive");
    expect(kinds).toContain("unresolved_time");        // the claim with no eventTime
    expect(kinds).toContain("reverse_ip_unavailable");
    expect(kinds).toContain("empty_adapter");
    expect(kinds).toContain("uningested_platform");    // Telegram/X/Meta
    expect(kinds).toContain("predicted_but_uncollected");
  });
});
