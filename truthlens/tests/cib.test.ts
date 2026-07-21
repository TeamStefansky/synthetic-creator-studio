import { describe, it, expect } from "vitest";
import { analyzeCib } from "../lib/cib/analyze";
import type { Mention } from "../lib/narrative/types";

function mk(text: string, account: string, minute: number, source = "bluesky"): Mention {
  return { source, id: `${account}-${minute}`, text, account, accountId: account,
    timestamp: new Date(Date.UTC(2024, 0, 1, 12, minute)).toISOString() };
}

describe("CIB analysis", () => {
  it("ALWAYS emits the UNDETERMINED attribution + next steps (mandatory)", () => {
    const r = analyzeCib("example.com", []);
    expect(r.attribution.toUpperCase()).toContain("UNDETERMINED");
    expect(r.attribution.toLowerCase()).toContain("not proof of state sponsorship");
    expect(r.nextSteps.length).toBeGreaterThan(0);
  });

  it("has NO actor/country field anywhere in the report", () => {
    const r = analyzeCib("x", [mk("hello", "a", 0)]);
    const json = JSON.stringify(r).toLowerCase();
    expect(json).not.toContain('"country"');
    expect(json).not.toContain('"actor"');
    expect(json).not.toContain('"origin"');
  });

  it("grades Strong when identical text is posted by many accounts in a burst", () => {
    const mentions: Mention[] = [
      mk("boycott example now", "a1", 0), mk("boycott example now", "a2", 1),
      mk("boycott example now", "a3", 2), mk("boycott example now", "a4", 3),
    ];
    const r = analyzeCib("example", mentions);
    expect(r.likelihood).toBe("Strong");
    expect(r.clusters[0].accounts).toBeGreaterThanOrEqual(3);
  });

  it("grades None when there is no duplication or synchronization", () => {
    const mentions: Mention[] = [
      mk("a unique thought about example", "a1", 0),
      mk("a totally different take here", "a2", 120),
    ];
    expect(analyzeCib("example", mentions).likelihood).toBe("None");
  });

  it("marks account-creation + network signals as 'Not collected' without a platform API", () => {
    const r = analyzeCib("example", [mk("hi", "a", 0)]);
    // No creation dates and no repost graph are available from the free set, so
    // both must render honestly as "Not collected" - never faked around.
    const creation = r.signals.find((s) => /creation/i.test(s.name));
    const network = r.signals.find((s) => /network/i.test(s.name));
    expect(creation?.confidence).toBe("Not collected");
    expect(network?.confidence).toBe("Not collected");
  });
});
