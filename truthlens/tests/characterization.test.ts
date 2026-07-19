// P0 — characterization tests for the influence-ops engine upgrade.
// Captures CURRENT clustering behavior and DEMONSTRATES the non-Latin bug.
// The `it.fails(...)` blocks below assert the DESIRED (post-fix) behavior and
// therefore PASS today only because the body throws (the bug). In P1 (Unicode
// normalization) they flip to plain `it(...)` and must pass for real.

import { describe, it, expect } from "vitest";
import { analyzeCib } from "../lib/cib/analyze";
import { computeThreat } from "../lib/narrative/threat";
import type { Mention, SourceStatus } from "../lib/narrative/types";

const SRC: SourceStatus[] = [{ source: "bluesky", connected: true, count: 0 }];

function mk(text: string, account: string, minute: number): Mention {
  return {
    source: "bluesky", id: `${account}-${minute}`, text, account, accountId: account,
    timestamp: new Date(Date.UTC(2024, 0, 1, 12, minute)).toISOString(),
  };
}

describe("P0 characterization — current (Latin) behavior is preserved", () => {
  it("English: identical posts from ≥2 accounts cluster and grade above None", () => {
    const m = [mk("boycott the brand now", "a1", 0), mk("boycott the brand now", "a2", 1), mk("boycott the brand now", "a3", 2)];
    const r = analyzeCib("brand", m);
    expect(r.clusters.length).toBeGreaterThanOrEqual(1);
    expect(r.likelihood).not.toBe("None");
  });

  it("English coordination indicator fires in the threat engine", () => {
    const m = [mk("stop the brand", "a1", 0), mk("stop the brand", "a2", 1)];
    const coord = computeThreat("brand", m, SRC).indicators.find((i) => i.key === "coordination");
    expect(coord?.level).not.toBe("Unknown");
    expect(coord!.score).toBeGreaterThan(0);
  });
});

describe("P1 — non-Latin scripts now cluster (bug fixed)", () => {
  // Previously normalizeText stripped these to "" and they never clustered.
  it("Hebrew: identical posts from ≥2 accounts cluster", () => {
    const m = [mk("בואו נחרים את המותג עכשיו", "a1", 0), mk("בואו נחרים את המותג עכשיו", "a2", 1), mk("בואו נחרים את המותג עכשיו", "a3", 2)];
    expect(analyzeCib("מותג", m).clusters.length).toBeGreaterThanOrEqual(1);
  });

  it("Russian: identical posts from ≥2 accounts cluster", () => {
    const m = [mk("бойкотируйте бренд сейчас", "a1", 0), mk("бойкотируйте бренд сейчас", "a2", 1), mk("бойкотируйте бренд сейчас", "a3", 2)];
    expect(analyzeCib("бренд", m).clusters.length).toBeGreaterThanOrEqual(1);
  });

  it("Hebrew: coordination indicator fires in the threat engine", () => {
    const m = [mk("תפיצו את זה מיד", "a1", 0), mk("תפיצו את זה מיד", "a2", 1)];
    const coord = computeThreat("x", m, SRC).indicators.find((i) => i.key === "coordination");
    expect(coord!.score).toBeGreaterThan(0);
  });
});
