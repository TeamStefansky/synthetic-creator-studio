// P2 — temporal fingerprint tests. Synthetic timelines exercise burst detection,
// posting-hour concentration, and account-creation clustering. The load-bearing
// counter-scenario: a genuine breaking-news spike (many accounts, one day, one
// hour) must NOT trip the posting-hour band above Low — sustained concentration
// across days is the influence-op tell, a one-day spike is normal.

import { describe, it, expect } from "vitest";
import {
  detectBursts, hourBandConcentration, creationClustering,
  HOUR_BAND_MIN_SHARE, HOUR_BAND_MIN_DAYS, CREATION_MIN_ACCOUNTS,
} from "../lib/narrative/fingerprints";
import { analyzeCib } from "../lib/cib/analyze";
import type { Mention } from "../lib/narrative/types";

const HOUR = 3_600_000;
const DAY = 86_400_000;
// A fixed base instant (no Date.now — tests must be reproducible).
const BASE = Date.UTC(2024, 0, 1, 0, 0, 0);

describe("detectBursts", () => {
  it("flags a synchronized burst: ≥3 posts from ≥2 accounts inside the window", () => {
    const items = [
      { t: BASE, account: "a" }, { t: BASE + 60_000, account: "b" },
      { t: BASE + 120_000, account: "c" },
    ];
    const { bursts, biggest } = detectBursts(items);
    expect(bursts).toBeGreaterThanOrEqual(1);
    expect(biggest).toBeGreaterThanOrEqual(3);
  });

  it("does NOT flag one account posting rapidly (no distinct-account count)", () => {
    const items = [
      { t: BASE, account: "a" }, { t: BASE + 30_000, account: "a" },
      { t: BASE + 60_000, account: "a" },
    ];
    expect(detectBursts(items).bursts).toBe(0);
  });

  it("does NOT flag posts spread far apart in time", () => {
    const items = [
      { t: BASE, account: "a" }, { t: BASE + HOUR, account: "b" },
      { t: BASE + 2 * HOUR, account: "c" },
    ];
    expect(detectBursts(items).bursts).toBe(0);
  });
});

describe("hourBandConcentration", () => {
  it("COUNTER-SCENARIO: a one-day breaking-news spike does not sustain across days", () => {
    // 30 accounts all post within the same UTC hour on ONE day — a real event.
    const ts = Array.from({ length: 30 }, (_, i) => BASE + 13 * HOUR + i * 1000);
    const band = hourBandConcentration(ts);
    // Share is high (all in one band) but it spans a single day → NOT sustained.
    expect(band.days).toBe(1);
    expect(band.days).toBeLessThan(HOUR_BAND_MIN_DAYS);
    const bandStrong = band.share >= HOUR_BAND_MIN_SHARE && band.days >= HOUR_BAND_MIN_DAYS;
    expect(bandStrong).toBe(false);
  });

  it("flags a SUSTAINED posting-hour band across multiple days", () => {
    // Every day for 5 days, all posts land in the 08:00–09:00 UTC window.
    const ts: number[] = [];
    for (let d = 0; d < 5; d++) for (let n = 0; n < 6; n++) ts.push(BASE + d * DAY + 8 * HOUR + n * 60_000);
    const band = hourBandConcentration(ts);
    expect(band.share).toBeGreaterThanOrEqual(HOUR_BAND_MIN_SHARE);
    expect(band.days).toBeGreaterThanOrEqual(HOUR_BAND_MIN_DAYS);
  });

  it("returns zeroed result for no timestamps", () => {
    expect(hourBandConcentration([])).toEqual({ share: 0, days: 0, band: [0, 0], count: 0, total: 0 });
  });
});

describe("creationClustering", () => {
  it("clusters accounts created within the window", () => {
    const dates = [
      new Date(BASE).toISOString(),
      new Date(BASE + 2 * DAY).toISOString(),
      new Date(BASE + 5 * DAY).toISOString(),
    ];
    const c = creationClustering(dates);
    expect(c.collected).toBe(3);
    expect(c.clustered).toBeGreaterThanOrEqual(CREATION_MIN_ACCOUNTS);
  });

  it("does NOT cluster accounts created months apart", () => {
    const dates = [
      new Date(BASE).toISOString(),
      new Date(BASE + 60 * DAY).toISOString(),
      new Date(BASE + 120 * DAY).toISOString(),
    ];
    expect(creationClustering(dates).clustered).toBe(1);
  });

  it("ignores undefined dates but still counts collected ones", () => {
    const c = creationClustering([new Date(BASE).toISOString(), undefined, undefined]);
    expect(c.collected).toBe(1);
  });
});

describe("analyzeCib — breaking-news does not over-grade on timing alone", () => {
  function mk(text: string, account: string, tMs: number): Mention {
    return { source: "bluesky", id: `${account}-${tMs}`, text, account, accountId: account,
      timestamp: new Date(tMs).toISOString() };
  }
  it("distinct organic reactions in a one-day spike do not reach Strong via the hour band", () => {
    // 12 distinct accounts, distinct wording, all one day, one hour — no copypasta.
    const m = Array.from({ length: 12 }, (_, i) =>
      mk(`my own independent reaction number ${i} to the news today`, `acct${i}`, BASE + 13 * HOUR + i * 90_000));
    const r = analyzeCib("event", m);
    const band = r.signals.find((s) => /posting-hour/i.test(s.name));
    // The hour-band signal must not be Medium (it is one day → below the sustain bar).
    expect(band?.confidence).not.toBe("Medium");
    expect(r.likelihood).not.toBe("Strong");
  });
});
