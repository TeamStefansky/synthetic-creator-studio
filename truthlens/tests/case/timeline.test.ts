import { describe, it, expect } from "vitest";
import { buildLedger } from "../../lib/case/ledger";
import { buildTimeline } from "../../lib/case/timeline";
import { orderOf } from "../../lib/case/calibrate-time";
import { containsBannedOriginTerm, EARLIEST_OBSERVED_LABEL } from "../../lib/case/vocab";
import { clusterClaims } from "../../lib/case/claim-identity";
import { mkProvenance, eventTime } from "../../lib/case/adapters/util";
import type { EvidenceDraft } from "../../lib/case/types";

const prov = (lin: string, url?: string, bytes?: string) =>
  mkProvenance({ sourceClass: "self_byline", lineageId: lin, sourceUrl: url, bytes, collectedAt: "2026-07-20T00:00:00Z" });
const claim = (val: string, url: string, at?: string, tier: any = "T3"): EvidenceDraft =>
  ({ kind: "claim", entityKey: "post:story", value: val, provenance: prov("lin:" + url, url, val), eventTime: eventTime(at, tier) });

describe("case timeline + claim identity (P2)", () => {
  it("Hebrew and Russian restatements of one claim cluster with the English original", () => {
    // Each restatement shares the same distinctive anchors (proper noun + figure).
    const en = "Acme raised 500 million from investors";
    const he = "Acme גייסה 500 מיליון דולר ממשקיעים";
    const ru = "Acme привлекла 500 миллионов от инвесторов";
    const clusters = clusterClaims([en, he, ru], (t) => t);
    expect(clusters).toHaveLength(1); // one claim, three languages
  });

  it("earliestByClaim collapses the multilingual restatements to one, labeled 'earliest observed'", () => {
    const { items } = buildLedger([
      claim("Acme raised 500 million from investors", "en", "2026-01-01T00:00:00Z", "T1"),
      claim("Acme גייסה 500 מיליון דולר ממשקיעים", "he", "2026-01-03T00:00:00Z"),
      claim("Acme привлекла 500 миллионов от инвесторов", "ru", "2026-01-05T00:00:00Z"),
    ], "2026-07-20T00:00:00Z");
    const tl = buildTimeline({ items, byId: Object.fromEntries(items.map((i) => [i.id, i])) });
    expect(tl.earliestByClaim).toHaveLength(1);
    expect(tl.earliestByClaim[0].label).toBe(EARLIEST_OBSERVED_LABEL);
    expect(tl.earliestByClaim[0].earliestAt).toBe("2026-01-01T00:00:00.000Z"); // the English, earliest
  });

  it("breaking news: near-simultaneous outlets form ONE claim, with no coordination claim", () => {
    const at = "2026-02-01T09:0"; // same-ish minute, different seconds
    const items = buildLedger([
      claim("Ministry X confirmed policy Y today", "a", at + "0:00Z"),
      claim("Ministry X confirmed policy Y today", "b", at + "1:00Z"),
      claim("Ministry X confirmed policy Y today", "c", at + "2:00Z"),
      claim("Ministry X confirmed policy Y today", "d", at + "3:00Z"),
      claim("Ministry X confirmed policy Y today", "e", at + "4:00Z"),
    ], "2026-07-20T00:00:00Z").items;
    const tl = buildTimeline({ items, byId: Object.fromEntries(items.map((i) => [i.id, i])) });
    expect(tl.earliestByClaim).toHaveLength(1);
    // the timeline is descriptive only - it asserts no coordination/edge field
    expect((tl as any).coordination).toBeUndefined();
    expect((tl as any).edges).toBeUndefined();
  });

  it("a 40-second gap between two independent T1 times yields no ordering (clock skew)", () => {
    const a = eventTime("2026-03-01T10:00:00Z", "T1");
    const b = eventTime("2026-03-01T10:00:40Z", "T1");
    expect(orderOf(a, b)).toBe("order_not_established");
  });

  it("banned origin vocabulary never appears in timeline labels", () => {
    const { items } = buildLedger([claim("Acme raised 500 million", "en", "2026-01-01T00:00:00Z", "T1")], "2026-07-20T00:00:00Z");
    const tl = buildTimeline({ items, byId: Object.fromEntries(items.map((i) => [i.id, i])) });
    const allText = [tl.note, ...tl.earliestByEntity.map((e) => e.label), ...tl.earliestByClaim.map((c) => c.label)].join(" ");
    expect(containsBannedOriginTerm(allText)).toBe(false);
    // and the lint helper does catch the banned words
    expect(containsBannedOriginTerm("the origin of the campaign")).toBe(true);
    expect(containsBannedOriginTerm("patient zero was account X")).toBe(true);
  });

  it("adaptive bucketing: a burst uses minute buckets, spread-out infra uses day buckets", () => {
    // Burst: 3 SAN events for one entity within an hour.
    const burst = buildLedger([
      { kind: "ssl_san", entityKey: "domain:x.com", value: "a.x.com", provenance: prov("l1"), eventTime: eventTime("2026-04-01T10:00:00Z", "T1") },
      { kind: "ssl_san", entityKey: "domain:x.com", value: "b.x.com", provenance: prov("l2"), eventTime: eventTime("2026-04-01T10:20:00Z", "T1") },
      { kind: "ssl_san", entityKey: "domain:x.com", value: "c.x.com", provenance: prov("l3"), eventTime: eventTime("2026-04-01T10:40:00Z", "T1") },
    ], "2026-07-20T00:00:00Z").items;
    const tlBurst = buildTimeline({ items: burst, byId: Object.fromEntries(burst.map((i) => [i.id, i])) });
    expect(tlBurst.entries[0].bucket).toMatch(/T\d\d:\d\dZ$/); // minute granularity

    const spread = buildLedger([
      { kind: "domain_created", entityKey: "domain:y.com", value: "2020-01-01T00:00:00Z", provenance: prov("l4"), eventTime: eventTime("2020-01-01T00:00:00Z", "T1") },
      { kind: "archive_first_seen", entityKey: "domain:y.com", value: "2023-06-01T00:00:00Z", provenance: prov("l5"), eventTime: eventTime("2023-06-01T00:00:00Z", "T2") },
    ], "2026-07-20T00:00:00Z").items;
    const tlSpread = buildTimeline({ items: spread, byId: Object.fromEntries(spread.map((i) => [i.id, i])) });
    expect(tlSpread.entries[0].bucket).toMatch(/^\d{4}-\d\d-\d\d$/); // day granularity
  });
});
